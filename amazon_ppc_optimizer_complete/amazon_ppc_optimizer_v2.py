#!/usr/bin/env python3
"""
Amazon PPC Automation Suite - Rate Limit Optimized Version
===========================================================

Enhanced version with improved rate limiting, caching, and API throttling.

Key improvements:
- Token bucket rate limiter with configurable limits
- HTTP 425 and 429 handling with exponential backoff
- Report data caching to reduce API calls
- Smarter batching and request optimization
- Configurable delays between operations
- Request queue management

Author: Nature's Way Soil
Version: 2.1.0 (Rate Limit Optimized)
"""

import argparse
import csv
import io
import json
import logging
import os
import sys
import time
import zipfile
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set
import gzip
import traceback
import hashlib
import pickle

import requests

try:
import yaml
except ImportError:
print("ERROR: pyyaml is required. Install with: pip install pyyaml")
sys.exit(1)

# ============================================================================
# CONSTANTS - OPTIMIZED FOR RATE LIMITING
# ============================================================================

ENDPOINTS = {
    "NA": "https://advertising-api.amazon.com",
    "EU": "https://advertising-api-eu.amazon.com",
    "FE": "https://advertising-api-fe.amazon.com",
}

TOKEN_URL = "https://api.amazon.com/auth/o2/token"
USER_AGENT = "NWS-PPC-Automation/2.1-RateLimitOptimized"

# Enhanced rate limiting - more conservative
DEFAULT_REQUEST_DELAY = 5.0  # Increased from 0.2s to 5s
MIN_REQUEST_DELAY = 3.0      # Minimum delay between requests
MAX_REQUEST_DELAY = 15.0     # Maximum delay for backoff

# Report handling
REPORT_POLL_INTERVAL = 10.0  # Poll report status every 10s (was 5s)
REPORT_MAX_WAIT = 600        # Wait up to 10 minutes for reports
CACHE_LIFETIME_HOURS = 4     # Cache report data for 4 hours

# Retry configuration
MAX_RETRIES = 5
BASE_RETRY_DELAY = 5  # Start with 5 seconds
MAX_RETRY_DELAY = 120  # Cap at 2 minutes

# ============================================================================
# LOGGING SETUP
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'ppc_automation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'),
        logging.StreamHandler(
            sys.stdout)])

logger = logging.getLogger(__name__)

# ============================================================================
# DATA CLASSES
# ============================================================================


@dataclass
class Auth:


"""Authentication credentials"""
access_token: str
token_type: str
expires_at: float


def is_expired(self) -> bool:


return time.time() > self.expires_at - 60


@dataclass
class Campaign:


"""Campaign data structure"""
campaign_id: str
name: str
state: str
daily_budget: float
targeting_type: str
campaign_type: str = "sponsoredProducts"


@dataclass
class AdGroup:


"""Ad Group data structure"""
ad_group_id: str
campaign_id: str
name: str
state: str
default_bid: float


@dataclass
class Keyword:


"""Keyword data structure"""
keyword_id: str
ad_group_id: str
campaign_id: str
keyword_text: str
match_type: str
state: str
bid: float


@dataclass
class PerformanceMetrics:


"""Performance metrics for keywords/campaigns"""
impressions: int = 0
clicks: int = 0
cost: float = 0.0
sales: float = 0.0
orders: int = 0


@property
def ctr(self) -> float:


return (self.clicks / self.impressions) if self.impressions > 0 else 0.0


@property
def acos(self) -> float:


return (self.cost / self.sales) if self.sales > 0 else float('inf')


@property
def roas(self) -> float:


return (self.sales / self.cost) if self.cost > 0 else 0.0


@property
def cpc(self) -> float:


return (self.cost / self.clicks) if self.clicks > 0 else 0.0


@dataclass
class AuditEntry:


"""Audit trail entry"""
timestamp: str
action_type: str
entity_type: str
entity_id: str
old_value: str
new_value: str
reason: str
dry_run: bool


# ============================================================================
# TOKEN BUCKET RATE LIMITER
# ============================================================================

class TokenBucketRateLimiter:


"""
Token bucket algorithm for rate limiting.
More sophisticated than simple delay-based limiting.
"""


def __init__(self, tokens_per_second: float = 0.2, bucket_size: int = 5):


"""
Initialize rate limiter.

Args:
tokens_per_second: Rate at which tokens are added (0.2 = 1 request per 5 seconds)
bucket_size: Maximum burst size
"""
self.tokens_per_second = tokens_per_second
self.bucket_size = bucket_size
self.tokens = bucket_size
self.last_update = time.time()
self.request_count = 0
self.last_reset = time.time()


def acquire(self, tokens: int = 1) -> float:


"""
Acquire tokens and wait if necessary.
Returns the time waited.
"""
# Add tokens based on time elapsed
current_time = time.time()
elapsed = current_time - self.last_update
self.tokens = min(
    self.bucket_size,
    self.tokens + elapsed * self.tokens_per_second
)
self.last_update = current_time

# If not enough tokens, wait
if self.tokens < tokens:
wait_time = (tokens - self.tokens) / self.tokens_per_second
logger.debug(f"Rate limiter: waiting {wait_time:.2f}s for {tokens} token(s)")
time.sleep(wait_time)
self.tokens = 0
self.last_update = time.time()
return wait_time
else:
self.tokens -= tokens
return 0.0


def get_stats(self) -> Dict:


"""Get rate limiter statistics"""
return {
    'tokens_available': self.tokens,
    'tokens_per_second': self.tokens_per_second,
    'bucket_size': self.bucket_size,
    'request_count': self.request_count
}


# ============================================================================
# CACHE MANAGER
# ============================================================================

class CacheManager:


"""
Cache manager for API responses to reduce redundant requests.
"""


def __init__(self, cache_dir: str = "./cache", cache_lifetime_hours: int = 4):


self.cache_dir = Path(cache_dir)
self.cache_dir.mkdir(exist_ok=True)
self.cache_lifetime = timedelta(hours=cache_lifetime_hours)
self.hits = 0
self.misses = 0


def _get_cache_key(self, prefix: str, *args, **kwargs) -> str:


"""Generate cache key from arguments"""
data = f"{prefix}:{args}:{sorted(kwargs.items())}"
return hashlib.md5(data.encode()).hexdigest()


def _get_cache_path(self, cache_key: str) -> Path:


"""Get path to cache file"""
return self.cache_dir / f"{cache_key}.pkl"


def get(self, prefix: str, *args, **kwargs) -> Optional[any]:


"""Get cached data if available and not expired"""
cache_key = self._get_cache_key(prefix, *args, **kwargs)
cache_path = self._get_cache_path(cache_key)

if not cache_path.exists():
self.misses += 1
return None

try:
    # Check if cache is expired
file_time = datetime.fromtimestamp(cache_path.stat().st_mtime)
if datetime.now() - file_time > self.cache_lifetime:
logger.debug(f"Cache expired: {cache_key}")
cache_path.unlink()
self.misses += 1
return None

# Load cached data
with open(cache_path, 'rb') as f:
data = pickle.load(f)

logger.info(f"Cache hit: {prefix} (age: {datetime.now() - file_time})")
self.hits += 1
return data

except Exception as e:
logger.warning(f"Cache read error: {e}")
self.misses += 1
return None


def set(self, prefix: str, data: any, *args, **kwargs):


"""Store data in cache"""
cache_key = self._get_cache_key(prefix, *args, **kwargs)
cache_path = self._get_cache_path(cache_key)

try:
with open(cache_path, 'wb') as f:
pickle.dump(data, f)
logger.debug(f"Cached: {prefix}")
except Exception as e:
logger.warning(f"Cache write error: {e}")


def clear_expired(self):


"""Remove expired cache files"""
count = 0
for cache_file in self.cache_dir.glob("*.pkl"):
file_time = datetime.fromtimestamp(cache_file.stat().st_mtime)
if datetime.now() - file_time > self.cache_lifetime:
cache_file.unlink()
count += 1

if count > 0:
logger.info(f"Cleared {count} expired cache file(s)")


def get_stats(self) -> Dict:


"""Get cache statistics"""
total = self.hits + self.misses
hit_rate = (self.hits / total * 100) if total > 0 else 0

return {
    'hits': self.hits,
    'misses': self.misses,
    'hit_rate': f"{hit_rate:.1f}%",
    'cache_files': len(list(self.cache_dir.glob("*.pkl")))
}


# ============================================================================
# CONFIGURATION LOADER
# ============================================================================

class Config:


"""Configuration manager"""


def __init__(self, config_path: str):


self.config_path = config_path
self.data = self._load_config()


def _load_config(self) -> Dict:


"""Load configuration from YAML or JSON file"""
try:
with open(self.config_path, 'r') as f:
if self.config_path.endswith('.yaml') or self.config_path.endswith('.yml'):
config = yaml.safe_load(f)
else:
config = json.load(f)
logger.info(f"Configuration loaded from {self.config_path}")
return config
except Exception as e:
logger.error(f"Failed to load configuration: {e}")
sys.exit(1)


def get(self, key: str, default=None):


"""Get configuration value with dot notation support"""
keys = key.split('.')
value = self.data

for k in keys:
if isinstance(value, dict):
value = value.get(k)
if value is None:
return default
else:
return default

return value if value is not None else default


# ============================================================================
# AUDIT LOGGER
# ============================================================================

class AuditLogger:


"""CSV-based audit trail logger"""


def __init__(self, output_dir: str = "."):


self.output_dir = output_dir
os.makedirs(output_dir, exist_ok=True)
self.filename = os.path.join(
    output_dir,
    f"ppc_audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
)
self.entries: List[AuditEntry] = []


def log(self, action_type: str, entity_type: str, entity_id: str,
        old_value: str, new_value: str, reason: str, dry_run: bool = False):


"""Log an audit entry"""
entry = AuditEntry(
    timestamp=datetime.utcnow().isoformat(),
    action_type=action_type,
    entity_type=entity_type,
    entity_id=entity_id,
    old_value=old_value,
    new_value=new_value,
    reason=reason,
    dry_run=dry_run
)
self.entries.append(entry)


def save(self):


"""Save audit trail to CSV"""
if not self.entries:
logger.info("No audit entries to save")
return

try:
with open(self.filename, 'w', newline='', encoding='utf-8') as f:
fieldnames = ['timestamp', 'action_type', 'entity_type', 'entity_id',
              'old_value', 'new_value', 'reason', 'dry_run']
writer = csv.DictWriter(f, fieldnames=fieldnames)
writer.writeheader()

for entry in self.entries:
writer.writerow({
    'timestamp': entry.timestamp,
    'action_type': entry.action_type,
    'entity_type': entry.entity_type,
    'entity_id': entry.entity_id,
    'old_value': entry.old_value,
    'new_value': entry.new_value,
    'reason': entry.reason,
    'dry_run': entry.dry_run
})

logger.info(
    f"Audit trail saved to {self.filename} ({len(self.entries)} entries)")
except Exception as e:
logger.error(f"Failed to save audit trail: {e}")

# ============================================================================
# CAMPAIGN FILTERING
# ============================================================================


class CampaignFilter:
    """Filter campaigns based on various criteria for high-frequency optimization runs"""

    def __init__(self, config: Config, api: 'AmazonAdsAPI'):
        self.config = config
        self.api = api
        self.enabled = config.get('campaign_filtering.enabled', False)
        self.filter_type = config.get(
            'campaign_filtering.filter_type', 'percentage')

    def filter_campaigns(self, campaigns: List[Campaign]) -> List[Campaign]:
        """
        Filter campaigns based on configuration settings.
        Returns filtered list of campaigns.
        """
        if not self.enabled or not campaigns:
            logger.info(
                f"Campaign filtering disabled. Using all {len(campaigns)} campaigns.")
            return campaigns

        original_count = len(campaigns)
        logger.info(f"Campaign filtering enabled. Type: {self.filter_type}")
        logger.info(f"Total campaigns before filtering: {original_count}")

        filtered = []

        if self.filter_type == 'percentage':
            filtered = self._filter_by_percentage(campaigns)
        elif self.filter_type == 'pattern':
            filtered = self._filter_by_pattern(campaigns)
        elif self.filter_type == 'ids':
            filtered = self._filter_by_ids(campaigns)
        elif self.filter_type == 'state':
            filtered = self._filter_by_state(campaigns)
        elif self.filter_type == 'combined':
            filtered = self._filter_combined(campaigns)
        else:
            logger.warning(
                f"Unknown filter type: {self.filter_type}. Using all campaigns.")
            filtered = campaigns

        filtered_count = len(filtered)
        reduction = ((original_count - filtered_count) /
                     original_count * 100) if original_count > 0 else 0

        logger.info(
            f"Campaigns after filtering: {filtered_count} ({reduction:.1f}% reduction)")
        logger.info(f"Estimated API call reduction: ~{reduction:.0f}%")

        return filtered

    def _filter_by_percentage(
            self,
            campaigns: List[Campaign]) -> List[Campaign]:
        """Filter by top N% of campaigns by spend/conversions/clicks"""
        percentage = self.config.get('campaign_filtering.percentage', 50)
        metric = self.config.get('campaign_filtering.metric', 'spend')
        lookback_days = self.config.get('campaign_filtering.lookback_days', 14)

        logger.info(
            f"Filtering by top {percentage}% of campaigns by {metric} (last {lookback_days} days)")

        # Get performance data for campaigns
        try:
            report_data = self.api.get_report_data(
                'campaigns',
                ['campaignId', 'cost', 'attributedSales14d', 'attributedConversions14d',
                 'clicks', 'impressions'],
                use_cache=True
            )

            if not report_data:
                logger.warning(
                    "No performance data available. Using all campaigns.")
                return campaigns

            # Build campaign performance map
            campaign_metrics = {}
            for row in report_data:
                campaign_id = str(row.get('campaignId', ''))
                if metric == 'spend':
                    value = float(row.get('cost', 0) or 0)
                elif metric == 'conversions':
                    value = int(row.get('attributedConversions14d', 0) or 0)
                elif metric == 'clicks':
                    value = int(row.get('clicks', 0) or 0)
                elif metric == 'impressions':
                    value = int(row.get('impressions', 0) or 0)
                else:
                    value = float(row.get('cost', 0) or 0)

                campaign_metrics[campaign_id] = value

            # Sort campaigns by metric
            campaigns_with_metrics = [
                (c, campaign_metrics.get(c.campaign_id, 0))
                for c in campaigns
            ]
            campaigns_with_metrics.sort(key=lambda x: x[1], reverse=True)

            # Take top N%
            count = max(1, int(len(campaigns) * percentage / 100))
            top_campaigns = [c for c, _ in campaigns_with_metrics[:count]]

            # Log top campaigns
            logger.info(f"Top {percentage}% campaigns by {metric}:")
            for i, (c, value) in enumerate(
                    campaigns_with_metrics[:min(5, count)]):
                logger.info(f"  {i+1}. {c.name} ({c.campaign_id}): {metric}=${value:.2f}" if metric ==
                            'spend' else f"  {i+1}. {c.name} ({c.campaign_id}): {metric}={value}")

            return top_campaigns

        except Exception as e:
            logger.error(f"Error filtering by percentage: {e}")
            logger.warning("Falling back to all campaigns")
            return campaigns

    def _filter_by_pattern(self, campaigns: List[Campaign]) -> List[Campaign]:
        """Filter campaigns by name patterns"""
        patterns = self.config.get('campaign_filtering.patterns', [])
        case_sensitive = self.config.get(
            'campaign_filtering.case_sensitive', False)
        match_type = self.config.get(
            'campaign_filtering.match_type', 'contains')

        if not patterns:
            logger.warning("No patterns specified. Using all campaigns.")
            return campaigns

        logger.info(
            f"Filtering by patterns: {patterns} (match_type: {match_type}, case_sensitive: {case_sensitive})")

        import re
        filtered = []

        for campaign in campaigns:
            name = campaign.name if case_sensitive else campaign.name.lower()
            matched = False

            for pattern in patterns:
                pattern_str = pattern if case_sensitive else pattern.lower()

                if match_type == 'contains':
                    if pattern_str in name:
                        matched = True
                        break
                elif match_type == 'startswith':
                    if name.startswith(pattern_str):
                        matched = True
                        break
                elif match_type == 'endswith':
                    if name.endswith(pattern_str):
                        matched = True
                        break
                elif match_type == 'regex':
                    try:
                        if re.search(pattern, campaign.name):
                            matched = True
                            break
                    except re.error as e:
                        logger.warning(
                            f"Invalid regex pattern '{pattern}': {e}")

            if matched:
                filtered.append(campaign)
                logger.debug(f"  Matched: {campaign.name}")

        if filtered:
            logger.info(f"Matched campaigns (first 5):")
            for c in filtered[:5]:
                logger.info(f"  - {c.name} ({c.campaign_id})")

        return filtered

    def _filter_by_ids(self, campaigns: List[Campaign]) -> List[Campaign]:
        """Filter campaigns by specific IDs"""
        campaign_ids = self.config.get('campaign_filtering.campaign_ids', [])

        if not campaign_ids:
            logger.warning("No campaign IDs specified. Using all campaigns.")
            return campaigns

        # Convert to strings for comparison
        campaign_ids = [str(cid) for cid in campaign_ids]

        logger.info(f"Filtering by {len(campaign_ids)} specific campaign IDs")

        filtered = [c for c in campaigns if c.campaign_id in campaign_ids]

        if filtered:
            logger.info(f"Matched campaigns:")
            for c in filtered:
                logger.info(f"  - {c.name} ({c.campaign_id})")
        else:
            logger.warning("No campaigns matched the specified IDs")

        return filtered

    def _filter_by_state(self, campaigns: List[Campaign]) -> List[Campaign]:
        """Filter campaigns by state (enabled, paused, archived)"""
        states = self.config.get('campaign_filtering.states', ['enabled'])
        include_paused = self.config.get(
            'campaign_filtering.include_paused', False)

        logger.info(f"Filtering by states: {states}")

        # Normalize states to lowercase
        states = [s.lower() for s in states]
        if include_paused and 'paused' not in states:
            states.append('paused')

        filtered = [c for c in campaigns if c.state.lower() in states]

        logger.info(f"Campaigns by state:")
        state_counts = {}
        for c in filtered:
            state_counts[c.state] = state_counts.get(c.state, 0) + 1
        for state, count in state_counts.items():
            logger.info(f"  {state}: {count} campaigns")

        return filtered

    def _filter_combined(self, campaigns: List[Campaign]) -> List[Campaign]:
        """Apply multiple filters in combination"""
        combine_logic = self.config.get(
            'campaign_filtering.combine_logic', 'AND')

        logger.info(f"Applying combined filters with {combine_logic} logic")

        # This is a simplified implementation
        # In a full implementation, you'd parse multiple filter configs
        filtered = campaigns

        # Apply state filter first if specified
        if 'states' in self.config.data.get('campaign_filtering', {}):
            filtered = self._filter_by_state(filtered)

        # Then apply pattern filter if specified
        if 'patterns' in self.config.data.get('campaign_filtering', {}) and \
           self.config.get('campaign_filtering.patterns'):
            filtered = self._filter_by_pattern(filtered)

        # Then apply percentage filter if specified
        if 'percentage' in self.config.data.get('campaign_filtering', {}) and \
           self.config.get('campaign_filtering.percentage') < 100:
            filtered = self._filter_by_percentage(filtered)

        return filtered

    def get_filtered_campaign_ids(self, campaigns: List[Campaign]) -> Set[str]:
        """
        Get set of campaign IDs after filtering.
        Useful for filtering keywords and ad groups by campaign.
        """
        filtered = self.filter_campaigns(campaigns)
        return {c.campaign_id for c in filtered}


# ============================================================================
# AMAZON ADS API CLIENT - RATE LIMIT OPTIMIZED
# ============================================================================

class AmazonAdsAPI:


"""
Amazon Advertising API client with advanced rate limiting and caching.
"""


def __init__(self, profile_id: str, region: str = "NA",
             request_delay: float = DEFAULT_REQUEST_DELAY,
             enable_cache: bool = True):


self.profile_id = profile_id
self.region = region.upper()
self.base_url = ENDPOINTS.get(self.region, ENDPOINTS["NA"])
self.auth = self._authenticate()

# Rate limiting
self.rate_limiter = TokenBucketRateLimiter(
    tokens_per_second=1.0 / request_delay,  # Convert delay to rate
    bucket_size=3  # Allow small bursts
)
self.request_delay = request_delay

# Caching
self.cache_enabled = enable_cache
if enable_cache:
self.cache = CacheManager(cache_dir="./cache",
                          cache_lifetime_hours=CACHE_LIFETIME_HOURS)

# Statistics
self.api_calls = 0
self.rate_limit_hits = 0
self.errors = defaultdict(int)


def _authenticate(self) -> Auth:


"""Authenticate and get access token"""
client_id = os.getenv("AMAZON_CLIENT_ID")
client_secret = os.getenv("AMAZON_CLIENT_SECRET")
refresh_token = os.getenv("AMAZON_REFRESH_TOKEN")

if not all([client_id, client_secret, refresh_token]):
logger.error("Missing required environment variables")
sys.exit(1)

payload = {
    "grant_type": "refresh_token",
    "refresh_token": refresh_token,
    "client_id": client_id,
    "client_secret": client_secret,
}

try:
response = requests.post(TOKEN_URL, data=payload, timeout=30)
response.raise_for_status()
data = response.json()

auth = Auth(
    access_token=data["access_token"],
    token_type=data.get("token_type", "Bearer"),
    expires_at=time.time() + int(data.get("expires_in", 3600))
)
logger.info("Successfully authenticated with Amazon Ads API")
return auth
except Exception as e:
logger.error(f"Authentication failed: {e}")
sys.exit(1)


def _refresh_auth_if_needed(self):


"""Refresh authentication if token expired"""
if self.auth.is_expired():
logger.info("Access token expired, refreshing...")
self.auth = self._authenticate()


def _headers(self) -> Dict[str, str]:


"""Get API request headers"""
self._refresh_auth_if_needed()

return {
    "Authorization": f"{self.auth.token_type} {self.auth.access_token}",
    "Content-Type": "application/json",
    "Amazon-Advertising-API-ClientId": os.getenv("AMAZON_CLIENT_ID"),
    "Amazon-Advertising-API-Scope": self.profile_id,
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
}


def _request(self, method: str, endpoint: str, **kwargs) -> requests.Response:


"""
Make API request with enhanced retry logic and rate limiting.

Handles:
- HTTP 429 (Too Many Requests)
- HTTP 425 (Too Early)
- Exponential backoff
- Token bucket rate limiting
"""
# Acquire token from rate limiter
self.rate_limiter.acquire()

url = f"{self.base_url}{endpoint}"

for attempt in range(MAX_RETRIES):
try:
self.api_calls += 1

response = requests.request(
    method=method,
    url=url,
    headers=self._headers(),
    timeout=60,  # Increased timeout
    **kwargs
)

# Handle rate limiting responses
if response.status_code in [429, 425]:  # Too Many Requests or Too Early
self.rate_limit_hits += 1
self.errors[f"HTTP_{response.status_code}"] += 1

# Get retry delay from header or calculate
retry_after = int(response.headers.get('Retry-After', 0))
if retry_after == 0:
    # Exponential backoff
retry_after = min(
    BASE_RETRY_DELAY * (2 ** attempt),
    MAX_RETRY_DELAY
)

logger.warning(
    f"Rate limit hit (HTTP {response.status_code}), "
    f"attempt {attempt + 1}/{MAX_RETRIES}, "
    f"waiting {retry_after}s..."
)
time.sleep(retry_after)
continue

# Handle other errors
response.raise_for_status()

# Log successful request
if attempt > 0:
logger.info(f"Request succeeded on attempt {attempt + 1}")

return response

except requests.exceptions.HTTPError as e:
self.errors[f"HTTP_{response.status_code}"] += 1

if attempt == MAX_RETRIES - 1:
logger.error(f"Request failed after {MAX_RETRIES} attempts: {e}")
logger.error(f"URL: {url}")
logger.error(f"Response: {response.text if 'response' in locals() else 'N/A'}")
raise

# Exponential backoff for other errors
retry_delay = min(
    BASE_RETRY_DELAY * (2 ** attempt),
    MAX_RETRY_DELAY
)
logger.warning(
    f"Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}, "
    f"retrying in {retry_delay}s..."
)
time.sleep(retry_delay)

except Exception as e:
self.errors['OTHER'] += 1
if attempt == MAX_RETRIES - 1:
logger.error(f"Request failed with exception: {e}")
raise

retry_delay = BASE_RETRY_DELAY * (attempt + 1)
logger.warning(f"Exception occurred, retrying in {retry_delay}s: {e}")
time.sleep(retry_delay)

raise Exception("Max retries exceeded")

# ========================================================================
# CAMPAIGNS - WITH CACHING
# ========================================================================


def get_campaigns(
        self,
        state_filter: str = None,
        use_cache: bool = True) -> List[Campaign]:


"""Get all campaigns with optional caching"""
# Check cache first
if use_cache and self.cache_enabled:
cached = self.cache.get(
    'campaigns',
    profile_id=self.profile_id,
    state=state_filter)
if cached is not None:
return cached

try:
params = {}
if state_filter:
params['stateFilter'] = state_filter

logger.info("Fetching campaigns from API...")
response = self._request('GET', '/v2/sp/campaigns', params=params)
campaigns_data = response.json()

campaigns = []
for c in campaigns_data:
campaign = Campaign(
    campaign_id=str(c.get('campaignId')),
    name=c.get('name', ''),
    state=c.get('state', ''),
    daily_budget=float(c.get('dailyBudget', 0)),
    targeting_type=c.get('targetingType', ''),
    campaign_type='sponsoredProducts'
)
campaigns.append(campaign)

logger.info(f"Retrieved {len(campaigns)} campaigns")

# Cache the results
if use_cache and self.cache_enabled:
self.cache.set(
    'campaigns',
    campaigns,
    profile_id=self.profile_id,
    state=state_filter)

return campaigns

except Exception as e:
logger.error(f"Failed to get campaigns: {e}")
return []


def update_campaign(self, campaign_id: str, updates: Dict) -> bool:


"""Update campaign settings"""
try:
logger.info(f"Updating campaign {campaign_id}...")
response = self._request(
    'PUT',
    f'/v2/sp/campaigns/{campaign_id}',
    json=updates
)
logger.info(f"Successfully updated campaign {campaign_id}")
return True
except Exception as e:
logger.error(f"Failed to update campaign {campaign_id}: {e}")
return False


def create_campaign(self, campaign_data: Dict) -> Optional[str]:


"""Create new campaign"""
try:
logger.info("Creating new campaign...")
response = self._request('POST', '/v2/sp/campaigns', json=[campaign_data])
result = response.json()

if result and len(result) > 0:
campaign_id = result[0].get('campaignId')
logger.info(f"Created campaign: {campaign_id}")
return str(campaign_id)
return None
except Exception as e:
logger.error(f"Failed to create campaign: {e}")
return None

# ========================================================================
# AD GROUPS - WITH CACHING
# ========================================================================


def get_ad_groups(
        self,
        campaign_id: str = None,
        use_cache: bool = True) -> List[AdGroup]:


"""Get ad groups with optional caching"""
# Check cache
if use_cache and self.cache_enabled:
cached = self.cache.get('ad_groups', campaign_id=campaign_id)
if cached is not None:
return cached

try:
params = {}
if campaign_id:
params['campaignIdFilter'] = campaign_id

logger.info("Fetching ad groups from API...")
response = self._request('GET', '/v2/sp/adGroups', params=params)
ad_groups_data = response.json()

ad_groups = []
for ag in ad_groups_data:
ad_group = AdGroup(
    ad_group_id=str(ag.get('adGroupId')),
    campaign_id=str(ag.get('campaignId')),
    name=ag.get('name', ''),
    state=ag.get('state', ''),
    default_bid=float(ag.get('defaultBid', 0))
)
ad_groups.append(ad_group)

logger.info(f"Retrieved {len(ad_groups)} ad groups")

# Cache results
if use_cache and self.cache_enabled:
self.cache.set('ad_groups', ad_groups, campaign_id=campaign_id)

return ad_groups

except Exception as e:
logger.error(f"Failed to get ad groups: {e}")
return []


def create_ad_group(self, ad_group_data: Dict) -> Optional[str]:


"""Create new ad group"""
try:
logger.info("Creating new ad group...")
response = self._request('POST', '/v2/sp/adGroups', json=[ad_group_data])
result = response.json()

if result and len(result) > 0:
ad_group_id = result[0].get('adGroupId')
logger.info(f"Created ad group: {ad_group_id}")
return str(ad_group_id)
return None
except Exception as e:
logger.error(f"Failed to create ad group: {e}")
return None

# ========================================================================
# KEYWORDS - WITH CACHING
# ========================================================================


def get_keywords(self, campaign_id: str = None, ad_group_id: str = None,
                 use_cache: bool = True) -> List[Keyword]:


"""Get keywords with optional caching"""
# Check cache
if use_cache and self.cache_enabled:
cached = self.cache.get(
    'keywords',
    campaign_id=campaign_id,
    ad_group_id=ad_group_id)
if cached is not None:
return cached

try:
params = {}
if campaign_id:
params['campaignIdFilter'] = campaign_id
if ad_group_id:
params['adGroupIdFilter'] = ad_group_id

logger.info("Fetching keywords from API...")
response = self._request('GET', '/v2/sp/keywords', params=params)
keywords_data = response.json()

keywords = []
for kw in keywords_data:
keyword = Keyword(
    keyword_id=str(kw.get('keywordId')),
    ad_group_id=str(kw.get('adGroupId')),
    campaign_id=str(kw.get('campaignId')),
    keyword_text=kw.get('keywordText', ''),
    match_type=kw.get('matchType', ''),
    state=kw.get('state', ''),
    bid=float(kw.get('bid', 0))
)
keywords.append(keyword)

logger.info(f"Retrieved {len(keywords)} keywords")

# Cache results
if use_cache and self.cache_enabled:
self.cache.set(
    'keywords',
    keywords,
    campaign_id=campaign_id,
    ad_group_id=ad_group_id)

return keywords

except Exception as e:
logger.error(f"Failed to get keywords: {e}")
return []


def update_keyword_bid(
        self,
        keyword_id: str,
        bid: float,
        state: str = None) -> bool:


"""Update keyword bid"""
try:
updates = {'keywordId': int(keyword_id), 'bid': round(bid, 2)}
if state:
updates['state'] = state

response = self._request('PUT', '/v2/sp/keywords', json=[updates])
logger.debug(f"Updated keyword {keyword_id} bid to ${bid:.2f}")
return True
except Exception as e:
logger.error(f"Failed to update keyword {keyword_id}: {e}")
return False


def update_keywords_batch(
        self,
        updates: List[Dict],
        batch_size: int = 100) -> int:


"""
Update multiple keywords in batches to reduce API calls.
Returns number of successful updates.
"""
success_count = 0

for i in range(0, len(updates), batch_size):
batch = updates[i:i + batch_size]
try:
logger.info(
    f"Updating keyword batch {i//batch_size + 1} ({len(batch)} keywords)...")
response = self._request('PUT', '/v2/sp/keywords', json=batch)
result = response.json()

# Count successes
for r in result:
if r.get('code') == 'SUCCESS':
success_count += 1

logger.info(f"Batch update: {success_count} successful")

# Add delay between batches
if i + batch_size < len(updates):
logger.info(f"Waiting {self.request_delay}s before next batch...")
time.sleep(self.request_delay)

except Exception as e:
logger.error(f"Batch update failed: {e}")

return success_count


def create_keywords(self, keywords_data: List[Dict]) -> List[str]:


"""Create new keywords in batches"""
batch_size = 100
created_ids = []

for i in range(0, len(keywords_data), batch_size):
batch = keywords_data[i:i + batch_size]
try:
logger.info(
    f"Creating keyword batch {i//batch_size + 1} ({len(batch)} keywords)...")
response = self._request('POST', '/v2/sp/keywords', json=batch)
result = response.json()

for r in result:
if r.get('code') == 'SUCCESS':
created_ids.append(str(r.get('keywordId')))

# Delay between batches
if i + batch_size < len(keywords_data):
time.sleep(self.request_delay)

except Exception as e:
logger.error(f"Failed to create keyword batch: {e}")

logger.info(f"Created {len(created_ids)} keywords")
return created_ids

# ========================================================================
# NEGATIVE KEYWORDS
# ========================================================================


def get_negative_keywords(
        self,
        campaign_id: str = None,
        use_cache: bool = True) -> List[Dict]:


"""Get negative keywords with optional caching"""
if use_cache and self.cache_enabled:
cached = self.cache.get('negative_keywords', campaign_id=campaign_id)
if cached is not None:
return cached

try:
params = {}
if campaign_id:
params['campaignIdFilter'] = campaign_id

logger.info("Fetching negative keywords from API...")
response = self._request('GET', '/v2/sp/negativeKeywords', params=params)
result = response.json()

if use_cache and self.cache_enabled:
self.cache.set('negative_keywords', result, campaign_id=campaign_id)

return result

except Exception as e:
logger.error(f"Failed to get negative keywords: {e}")
return []


def create_negative_keywords(
        self,
        negative_keywords_data: List[Dict]) -> List[str]:


"""Create negative keywords in batches"""
batch_size = 100
created_ids = []

for i in range(0, len(negative_keywords_data), batch_size):
batch = negative_keywords_data[i:i + batch_size]
try:
logger.info(f"Creating negative keyword batch {i//batch_size + 1}...")
response = self._request('POST', '/v2/sp/negativeKeywords', json=batch)
result = response.json()

for r in result:
if r.get('code') == 'SUCCESS':
created_ids.append(str(r.get('keywordId')))

if i + batch_size < len(negative_keywords_data):
time.sleep(self.request_delay)

except Exception as e:
logger.error(f"Failed to create negative keyword batch: {e}")

logger.info(f"Created {len(created_ids)} negative keywords")
return created_ids

# ========================================================================
# REPORTS - WITH ENHANCED CACHING
# ========================================================================


def create_report(
        self,
        report_type: str,
        metrics: List[str],
        report_date: str = None,
        segment: str = None) -> Optional[str]:


"""Create performance report"""
try:
if report_date is None:
report_date = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')

payload = {
    'reportDate': report_date,
    'metrics': ','.join(metrics)
}

if segment:
payload['segment'] = segment

endpoint = f'/v2/sp/{report_type}/report'

logger.info(f"Creating {report_type} report for {report_date}...")
response = self._request('POST', endpoint, json=payload)
report_id = response.json().get('reportId')

logger.info(f"Report created: {report_id}")
return report_id

except Exception as e:
logger.error(f"Failed to create report: {e}")
return None


def get_report_status(self, report_id: str) -> Dict:


"""Get report status"""
try:
response = self._request('GET', f'/v2/reports/{report_id}')
return response.json()
except Exception as e:
logger.error(f"Failed to get report status: {e}")
return {}


def download_report(self, report_url: str) -> List[Dict]:


"""Download and parse report"""
try:
logger.info("Downloading report data...")
# Longer timeout for large reports
response = requests.get(report_url, timeout=120)
response.raise_for_status()

content = response.content

# Try different decompression methods
try:
    # Try ZIP format first
with zipfile.ZipFile(io.BytesIO(content)) as z:
names = z.namelist()
with z.open(names[0]) as f:
text = io.TextIOWrapper(f, encoding='utf-8', newline='')
data = list(csv.DictReader(text))
logger.info(f"Downloaded report: {len(data)} rows")
return data
except zipfile.BadZipFile:
    # Try GZIP format
try:
with gzip.GzipFile(fileobj=io.BytesIO(content)) as gz:
text = io.TextIOWrapper(gz, encoding='utf-8', newline='')
data = list(csv.DictReader(text))
logger.info(f"Downloaded report: {len(data)} rows")
return data
except Exception:
    # Try as plain text
text = io.StringIO(content.decode('utf-8'))
data = list(csv.DictReader(text))
logger.info(f"Downloaded report: {len(data)} rows")
return data

except Exception as e:
logger.error(f"Failed to download report: {e}")
return []


def wait_for_report(
        self,
        report_id: str,
        timeout: int = REPORT_MAX_WAIT) -> Optional[str]:


"""Wait for report to be ready with enhanced polling"""
start_time = time.time()
poll_count = 0

logger.info(f"Waiting for report {report_id} (timeout: {timeout}s)...")

while time.time() - start_time < timeout:
poll_count += 1
status_data = self.get_report_status(report_id)
status = status_data.get('status')

logger.info(f"Report status check #{poll_count}: {status}")

if status == 'SUCCESS':
logger.info(f"Report ready after {time.time() - start_time:.1f}s")
return status_data.get('location')
elif status in ['FAILURE', 'CANCELLED']:
logger.error(f"Report {report_id} failed: {status}")
return None

# Longer polling interval to reduce API calls
time.sleep(REPORT_POLL_INTERVAL)

logger.error(f"Report {report_id} timeout after {timeout}s")
return None


def get_report_data(self, report_type: str, metrics: List[str],
                    report_date: str = None, segment: str = None,
                    use_cache: bool = True) -> List[Dict]:


"""
Get report data with caching.
This is the main method to use for getting performance data.
"""
# Check cache first
if use_cache and self.cache_enabled:
cached = self.cache.get(
    f'report_{report_type}',
    report_date=report_date,
    segment=segment,
    metrics=tuple(sorted(metrics))
)
if cached is not None:
logger.info(f"Using cached report data for {report_type}")
return cached

# Create and wait for report
report_id = self.create_report(report_type, metrics, report_date, segment)
if not report_id:
logger.error("Failed to create report")
return []

report_url = self.wait_for_report(report_id)
if not report_url:
logger.error("Failed to get report")
return []

# Download report
report_data = self.download_report(report_url)

# Cache the data
if use_cache and self.cache_enabled and report_data:
self.cache.set(
    f'report_{report_type}',
    report_data,
    report_date=report_date,
    segment=segment,
    metrics=tuple(sorted(metrics))
)

return report_data

# ========================================================================
# KEYWORD SUGGESTIONS
# ========================================================================


def get_keyword_suggestions(
        self,
        asin: str,
        max_suggestions: int = 100) -> List[Dict]:


"""Get keyword suggestions for ASIN"""
try:
payload = {
    'asins': [asin],
    'maxRecommendations': max_suggestions
}

logger.info(f"Getting keyword suggestions for ASIN {asin}...")
response = self._request(
    'POST',
    '/v2/sp/targets/keywords/recommendations',
    json=payload)
recommendations = response.json()

suggested_keywords = []
if 'recommendations' in recommendations:
for rec in recommendations['recommendations']:
suggested_keywords.append({
    'keyword': rec.get('keyword', ''),
    'match_type': rec.get('matchType', 'broad'),
    'suggested_bid': rec.get('bid', 0.5)
})

logger.info(f"Retrieved {len(suggested_keywords)} keyword suggestions")
return suggested_keywords

except Exception as e:
logger.error(f"Failed to get keyword suggestions: {e}")
return []

# ========================================================================
# STATISTICS
# ========================================================================


def get_stats(self) -> Dict:


"""Get API client statistics"""
stats = {
    'api_calls': self.api_calls,
    'rate_limit_hits': self.rate_limit_hits,
    'errors': dict(self.errors),
    'rate_limiter': self.rate_limiter.get_stats()
}

if self.cache_enabled:
stats['cache'] = self.cache.get_stats()

return stats


# ============================================================================
# AUTOMATION FEATURES (UPDATED TO USE CACHING)
# ============================================================================

class BidOptimizer:


"""Bid optimization with caching"""


def __init__(
        self,
        config: Config,
        api: AmazonAdsAPI,
        audit_logger: AuditLogger):


self.config = config
self.api = api
self.audit = audit_logger


def optimize(self, dry_run: bool = False) -> Dict:


"""Run bid optimization with cached data"""
logger.info("=== Starting Bid Optimization ===")

results = {
    'keywords_analyzed': 0,
    'bids_increased': 0,
    'bids_decreased': 0,
    'no_change': 0,
    'batch_updates': 0
}

# Get performance data with caching
report_data = self.api.get_report_data(
    'keywords',
    ['campaignId', 'adGroupId', 'keywordId', 'impressions', 'clicks',
     'cost', 'attributedSales14d', 'attributedConversions14d'],
    use_cache=True
)

if not report_data:
logger.error("No performance data available")
return results

# Get current keywords with caching
keywords = self.api.get_keywords(use_cache=True)
keyword_map = {kw.keyword_id: kw for kw in keywords}

# Collect all bid updates for batch processing
bid_updates = []

# Analyze each keyword
for row in report_data:
keyword_id = row.get('keywordId')
if not keyword_id or keyword_id not in keyword_map:
continue

results['keywords_analyzed'] += 1
keyword = keyword_map[keyword_id]

# Calculate metrics
metrics = PerformanceMetrics(
    impressions=int(row.get('impressions', 0) or 0),
    clicks=int(row.get('clicks', 0) or 0),
    cost=float(row.get('cost', 0) or 0),
    sales=float(row.get('attributedSales14d', 0) or 0),
    orders=int(row.get('attributedConversions14d', 0) or 0)
)

# Determine bid change
new_bid = self._calculate_new_bid(keyword, metrics)

if new_bid and abs(new_bid - keyword.bid) > 0.01:
reason = self._get_bid_change_reason(keyword, metrics, new_bid)

if new_bid > keyword.bid:
results['bids_increased'] += 1
else:
results['bids_decreased'] += 1

self.audit.log(
    'BID_UPDATE',
    'KEYWORD',
    keyword_id,
    f"${keyword.bid:.2f}",
    f"${new_bid:.2f}",
    reason,
    dry_run
)

# Add to batch updates
bid_updates.append({
    'keywordId': int(keyword_id),
    'bid': round(new_bid, 2)
})
else:
results['no_change'] += 1

# Execute batch updates
if bid_updates and not dry_run:
logger.info(f"Executing {len(bid_updates)} bid updates in batches...")
success_count = self.api.update_keywords_batch(bid_updates, batch_size=100)
results['batch_updates'] = success_count
elif dry_run:
results['batch_updates'] = len(bid_updates)

logger.info(f"Bid optimization complete: {results}")
return results


def _calculate_new_bid(
        self,
        keyword: Keyword,
        metrics: PerformanceMetrics) -> Optional[float]:


"""Calculate new bid based on performance"""
min_clicks = self.config.get('optimization_rules.min_clicks', 10)
min_spend = self.config.get('optimization_rules.min_spend', 5.0)
high_acos = self.config.get('optimization_rules.high_acos', 0.60)
low_acos = self.config.get('optimization_rules.low_acos', 0.25)
up_pct = self.config.get('optimization_rules.up_pct', 0.15)
down_pct = self.config.get('optimization_rules.down_pct', 0.20)
min_bid = self.config.get('optimization_rules.min_bid', 0.25)
max_bid = self.config.get('optimization_rules.max_bid', 5.0)

# Check if we have enough data
if metrics.clicks < min_clicks and metrics.cost < min_spend:
return None

current_bid = keyword.bid

# No sales - reduce bid
if metrics.sales <= 0 and metrics.clicks >= min_clicks:
new_bid = current_bid * (1 - down_pct)
# High ACOS - reduce bid
elif metrics.acos > high_acos:
new_bid = current_bid * (1 - down_pct)
# Low ACOS - increase bid
elif metrics.acos < low_acos and metrics.sales > 0:
new_bid = current_bid * (1 + up_pct)
# Medium ACOS - no change
else:
return None

# Clamp to min/max
new_bid = max(min_bid, min(max_bid, new_bid))

return round(new_bid, 2)


def _get_bid_change_reason(self, keyword: Keyword, metrics: PerformanceMetrics,
                           new_bid: float) -> str:


"""Get reason for bid change"""
if metrics.sales <= 0:
return f"No sales after {metrics.clicks} clicks"
elif metrics.acos > self.config.get('optimization_rules.high_acos', 0.60):
return f"High ACOS ({metrics.acos:.1%}) - reducing bid"
elif metrics.acos < self.config.get('optimization_rules.low_acos', 0.25):
return f"Low ACOS ({metrics.acos:.1%}) - increasing bid"
else:
return f"ACOS: {metrics.acos:.1%}, CTR: {metrics.ctr:.2%}"


# [CONTINUING IN NEXT PART DUE TO LENGTH...]
# CONTINUATION OF amazon_ppc_optimizer_v2_rate_limit_fixed.py
# This file contains the remaining classes - append to main file

class CampaignManager:


"""Campaign management with caching"""


def __init__(
        self,
        config: Config,
        api: AmazonAdsAPI,
        audit_logger: AuditLogger):


self.config = config
self.api = api
self.audit = audit_logger


def manage_campaigns(self, dry_run: bool = False) -> Dict:


"""Manage campaigns with cached data"""
logger.info("=== Managing Campaigns ===")

results = {
    'campaigns_activated': 0,
    'campaigns_paused': 0,
    'no_change': 0
}

# Get performance data with caching
report_data = self.api.get_report_data(
    'campaigns',
    ['campaignId', 'impressions', 'clicks', 'cost',
     'attributedSales14d', 'attributedConversions14d'],
    use_cache=True
)

if not report_data:
logger.error("No campaign performance data available")
return results

# Get current campaigns with caching
campaigns = self.api.get_campaigns(use_cache=True)
campaign_map = {c.campaign_id: c for c in campaigns}

acos_threshold = self.config.get('campaign_management.acos_threshold', 0.45)
min_spend = self.config.get('campaign_management.min_spend', 20.0)

for row in report_data:
campaign_id = row.get('campaignId')
if not campaign_id or campaign_id not in campaign_map:
continue

campaign = campaign_map[campaign_id]

cost = float(row.get('cost', 0) or 0)
sales = float(row.get('attributedSales14d', 0) or 0)

if cost < min_spend:
results['no_change'] += 1
continue

acos = (cost / sales) if sales > 0 else float('inf')

if acos < acos_threshold and campaign.state != 'enabled':
self.audit.log(
    'CAMPAIGN_ACTIVATE',
    'CAMPAIGN',
    campaign_id,
    campaign.state,
    'enabled',
    f"ACOS {acos:.1%} below threshold {acos_threshold:.1%}",
    dry_run
)

if not dry_run:
self.api.update_campaign(campaign_id, {'state': 'enabled'})

results['campaigns_activated'] += 1

elif acos > acos_threshold and campaign.state == 'enabled':
self.audit.log(
    'CAMPAIGN_PAUSE',
    'CAMPAIGN',
    campaign_id,
    campaign.state,
    'paused',
    f"ACOS {acos:.1%} above threshold {acos_threshold:.1%}",
    dry_run
)

if not dry_run:
self.api.update_campaign(campaign_id, {'state': 'paused'})

results['campaigns_paused'] += 1
else:
results['no_change'] += 1

logger.info(f"Campaign management complete: {results}")
return results


class KeywordDiscovery:


"""Keyword discovery with caching"""


def __init__(
        self,
        config: Config,
        api: AmazonAdsAPI,
        audit_logger: AuditLogger):


self.config = config
self.api = api
self.audit = audit_logger


def discover_keywords(self, dry_run: bool = False) -> Dict:


"""Discover keywords with cached data"""
logger.info("=== Discovering Keywords ===")

results = {
    'keywords_discovered': 0,
    'keywords_added': 0
}

# Get search term report with caching
report_data = self.api.get_report_data(
    'targets',
    ['campaignId', 'adGroupId', 'query', 'impressions', 'clicks',
     'cost', 'attributedSales14d', 'attributedConversions14d'],
    segment='query',
    use_cache=True
)

if not report_data:
logger.warning("No search term data available")
return results

# Get existing keywords with caching
existing_keywords = self.api.get_keywords(use_cache=True)
existing_keyword_texts = {
    (kw.ad_group_id, kw.keyword_text.lower(), kw.match_type)
    for kw in existing_keywords
}

min_clicks = self.config.get('keyword_discovery.min_clicks', 5)
max_acos = self.config.get('keyword_discovery.max_acos', 0.40)
max_keywords_per_run = self.config.get(
    'keyword_discovery.max_keywords_per_run', 50)

new_keywords_to_add = []

for row in report_data:
if len(new_keywords_to_add) >= max_keywords_per_run:
break

query = row.get('query', '').strip().lower()
ad_group_id = row.get('adGroupId')
campaign_id = row.get('campaignId')

if not query or not ad_group_id:
continue

clicks = int(row.get('clicks', 0) or 0)
cost = float(row.get('cost', 0) or 0)
sales = float(row.get('attributedSales14d', 0) or 0)

if clicks < min_clicks:
continue

acos = (cost / sales) if sales > 0 else float('inf')

if acos > max_acos:
continue

if (ad_group_id, query, 'exact') in existing_keyword_texts:
continue

results['keywords_discovered'] += 1

suggested_bid = self.config.get('keyword_discovery.initial_bid', 0.75)

new_keywords_to_add.append({
    'campaignId': int(campaign_id),
    'adGroupId': int(ad_group_id),
    'keywordText': query,
    'matchType': 'exact',
    'state': 'enabled',
    'bid': suggested_bid
})

self.audit.log(
    'KEYWORD_DISCOVERY',
    'KEYWORD',
    'NEW',
    '',
    query,
    f"Added from search term: {clicks} clicks, ACOS {acos:.1%}",
    dry_run
)

# Add keywords in batches
if new_keywords_to_add and not dry_run:
created_ids = self.api.create_keywords(new_keywords_to_add)
results['keywords_added'] = len(created_ids)
elif dry_run:
results['keywords_added'] = len(new_keywords_to_add)

logger.info(f"Keyword discovery complete: {results}")
return results


class NegativeKeywordManager:


"""Negative keyword management with caching"""


def __init__(
        self,
        config: Config,
        api: AmazonAdsAPI,
        audit_logger: AuditLogger):


self.config = config
self.api = api
self.audit = audit_logger


def add_negative_keywords(self, dry_run: bool = False) -> Dict:


"""Add negative keywords with cached data"""
logger.info("=== Managing Negative Keywords ===")

results = {
    'negative_keywords_added': 0
}

# Get search term report with caching
report_data = self.api.get_report_data(
    'targets',
    ['campaignId', 'adGroupId', 'query', 'impressions', 'clicks',
     'cost', 'attributedSales14d', 'attributedConversions14d'],
    segment='query',
    use_cache=True
)

if not report_data:
logger.warning("No search term data available")
return results

# Get existing negative keywords with caching
existing_negatives = self.api.get_negative_keywords(use_cache=True)
existing_negative_texts = {
    (nk.get('campaignId'), nk.get('keywordText', '').lower())
    for nk in existing_negatives
}

min_spend = self.config.get('negative_keywords.min_spend', 10.0)
max_acos = self.config.get('negative_keywords.max_acos', 1.0)

negatives_to_add = []

for row in report_data:
query = row.get('query', '').strip().lower()
campaign_id = row.get('campaignId')

if not query or not campaign_id:
continue

cost = float(row.get('cost', 0) or 0)
sales = float(row.get('attributedSales14d', 0) or 0)

if cost < min_spend:
continue

acos = (cost / sales) if sales > 0 else float('inf')

if acos < max_acos:
continue

if (campaign_id, query) in existing_negative_texts:
continue

negatives_to_add.append({
    'campaignId': int(campaign_id),
    'keywordText': query,
    'matchType': 'negativePhrase',
    'state': 'enabled'
})

self.audit.log(
    'NEGATIVE_KEYWORD_ADD',
    'NEGATIVE_KEYWORD',
    campaign_id,
    '',
    query,
    f"Poor performer: ${cost:.2f} spend, ACOS {acos:.1%}",
    dry_run
)

# Add negative keywords
if negatives_to_add and not dry_run:
created_ids = self.api.create_negative_keywords(negatives_to_add)
results['negative_keywords_added'] = len(created_ids)
elif dry_run:
results['negative_keywords_added'] = len(negatives_to_add)

logger.info(f"Negative keyword management complete: {results}")
return results


# ============================================================================
# MAIN AUTOMATION ORCHESTRATOR
# ============================================================================

class PPCAutomation:


"""Main automation orchestrator with rate limiting optimizations"""


def __init__(self, config_path: str, profile_id: str, dry_run: bool = False,
             request_delay: float = DEFAULT_REQUEST_DELAY):


self.config = Config(config_path)
self.profile_id = profile_id
self.dry_run = dry_run

# Initialize API client with custom delay
region = self.config.get('amazon_api.region', 'NA')
self.api = AmazonAdsAPI(profile_id, region, request_delay=request_delay)

# Initialize audit logger
log_dir = self.config.get('logging.output_dir', './logs')
self.audit = AuditLogger(output_dir=log_dir)

# Initialize feature modules
self.bid_optimizer = BidOptimizer(self.config, self.api, self.audit)
self.campaign_manager = CampaignManager(self.config, self.api, self.audit)
self.keyword_discovery = KeywordDiscovery(self.config, self.api, self.audit)
self.negative_keywords = NegativeKeywordManager(
    self.config, self.api, self.audit)


def run(self, features: List[str] = None):


"""Run automation with specified features"""
start_time = time.time()

logger.info("=" * 80)
logger.info("AMAZON PPC AUTOMATION SUITE - RATE LIMIT OPTIMIZED")
logger.info("=" * 80)
logger.info(f"Profile ID: {self.profile_id}")
logger.info(f"Dry Run: {self.dry_run}")
logger.info(f"Request Delay: {self.api.request_delay}s")
logger.info(f"Cache Enabled: {self.api.cache_enabled}")
logger.info(f"Timestamp: {datetime.now().isoformat()}")
logger.info("=" * 80)

if features is None:
features = self.config.get('features.enabled', [])

logger.info(f"Enabled features: {', '.join(features)}")

results = {}

try:
    # Clear expired cache entries
if self.api.cache_enabled:
self.api.cache.clear_expired()

# Run each feature
if 'bid_optimization' in features:
logger.info("\n" + "=" * 80)
results['bid_optimization'] = self.bid_optimizer.optimize(self.dry_run)

if 'campaign_management' in features:
logger.info("\n" + "=" * 80)
results['campaign_management'] = self.campaign_manager.manage_campaigns(
    self.dry_run)

if 'keyword_discovery' in features:
logger.info("\n" + "=" * 80)
results['keyword_discovery'] = self.keyword_discovery.discover_keywords(
    self.dry_run)

if 'negative_keywords' in features:
logger.info("\n" + "=" * 80)
results['negative_keywords'] = self.negative_keywords.add_negative_keywords(
    self.dry_run)

except Exception as e:
logger.error(f"Automation failed: {e}")
logger.error(traceback.format_exc())
finally:
    # Save audit trail
self.audit.save()

# Print summary
elapsed = time.time() - start_time

logger.info("\n" + "=" * 80)
logger.info("AUTOMATION SUMMARY")
logger.info("=" * 80)

for feature, result in results.items():
logger.info(f"\n{feature.upper().replace('_', ' ')}:")
for key, value in result.items():
logger.info(f"  {key}: {value}")

# Print API statistics
logger.info("\n" + "=" * 80)
logger.info("API STATISTICS")
logger.info("=" * 80)
api_stats = self.api.get_stats()
for key, value in api_stats.items():
if isinstance(value, dict):
logger.info(f"\n{key.upper()}:")
for k, v in value.items():
logger.info(f"  {k}: {v}")
else:
logger.info(f"{key}: {value}")

logger.info("\n" + "=" * 80)
logger.info(f"Total execution time: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
logger.info("=" * 80)

return results


# ============================================================================
# CLI
# ============================================================================

def main():


parser = argparse.ArgumentParser(
    description='Amazon PPC Automation Suite - Rate Limit Optimized',
    formatter_class=argparse.RawDescriptionHelpFormatter,
    epilog="""
Examples:
# Run with default config
python amazon_ppc_optimizer_v2.py --config config.json --profile-id 1234567890

# Run in dry-run mode
python amazon_ppc_optimizer_v2.py --config config.json --profile-id 1234567890 --dry-run

# Run specific features only
python amazon_ppc_optimizer_v2.py --config config.json --profile-id 1234567890 \\
--features bid_optimization campaign_management

# Use custom request delay (10 seconds between API calls)
python amazon_ppc_optimizer_v2.py --config config.json --profile-id 1234567890 \\
--request-delay 10

# Disable caching
python amazon_ppc_optimizer_v2.py --config config.json --profile-id 1234567890 \\
--no-cache
"""
)

parser.add_argument('--config', required=True,
                    help='Path to configuration JSON/YAML file')
parser.add_argument('--profile-id', required=True,
                    help='Amazon Ads Profile ID')
parser.add_argument('--dry-run', action='store_true',
                    help='Run without making actual changes')
parser.add_argument(
    '--features',
    nargs='+',
    choices=[
        'bid_optimization',
        'campaign_management',
        'keyword_discovery',
        'negative_keywords'],
    help='Specific features to run (default: all enabled in config)')
parser.add_argument(
    '--request-delay',
    type=float,
    default=DEFAULT_REQUEST_DELAY,
    help=f'Delay between API requests in seconds (default: {DEFAULT_REQUEST_DELAY}s)')
parser.add_argument('--no-cache', action='store_true',
                    help='Disable caching')

args = parser.parse_args()

# Validate request delay
if args.request_delay < MIN_REQUEST_DELAY:
logger.warning(f"Request delay too low, using minimum: {MIN_REQUEST_DELAY}s")
args.request_delay = MIN_REQUEST_DELAY

if args.request_delay > MAX_REQUEST_DELAY:
logger.warning(f"Request delay too high, using maximum: {MAX_REQUEST_DELAY}s")
args.request_delay = MAX_REQUEST_DELAY

# Run automation
automation = PPCAutomation(
    args.config,
    args.profile_id,
    args.dry_run,
    request_delay=args.request_delay
)

# Disable cache if requested
if args.no_cache:
automation.api.cache_enabled = False
logger.info("Caching disabled")

automation.run(args.features)


if __name__ == '__main__':
main()
