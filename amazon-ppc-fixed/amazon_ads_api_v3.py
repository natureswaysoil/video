"""
Amazon Advertising API v3 Client for Sponsored Products
Fixed for Amazon-PPC-Job: Includes 'run_optimization' entry point
"""
import requests
import time
import logging
import os
import gzip
import json
from io import BytesIO
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
from google.cloud import bigquery

# --- CONFIGURATION ---
# Configure logging to show up in Cloud Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# BigQuery Settings (As requested)
BQ_PROJECT_ID = "amazon-ppc-474902"
BQ_DATASET_ID = "amazon_ppc"
BQ_TABLE_ID = "optimizer_run_events"

# --- BIGQUERY LOGGING FUNCTION ---
def log_to_bigquery(message, level="INFO", module="AmazonAdsAPI"):
    """
    Logs events directly to the corrected BigQuery table.
    """
    try:
        client = bigquery.Client(project=BQ_PROJECT_ID)
        table_ref = f"{BQ_PROJECT_ID}.{BQ_DATASET_ID}.{BQ_TABLE_ID}"
        
        rows_to_insert = [{
            "run_timestamp": datetime.now().isoformat(),
            "status": level,
            "details": message,
            # Ensure your BigQuery Schema actually has a 'module' column before uncommenting
            # "module": module 
        }]

        errors = client.insert_rows_json(table_ref, rows_to_insert)
        if errors:
            logger.error(f"BQ Insert Error: {errors}")
        else:
            logger.info(f"Logged to BigQuery: {message}")
            
    except Exception as e:
        logger.error(f"BQ Connection Failed: {e}")

@dataclass
class Campaign:
    campaign_id: str
    name: str
    state: str
    daily_budget: float
    targeting_type: str = ""
    campaign_type: str = "sponsoredProducts"

@dataclass
class Keyword:
    keyword_id: str
    ad_group_id: str
    campaign_id: str
    keyword_text: str
    match_type: str
    state: str
    bid: float

class RateLimiter:
    def __init__(self, requests_per_second: float = 0.5):
        self.min_interval = 1.0 / requests_per_second
        self.last_request = 0
    
    def wait_if_needed(self):
        elapsed = time.time() - self.last_request
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request = time.time()

class AmazonAdsAPIv3:
    BASE_URLS = {
        "NA": "https://advertising-api.amazon.com",
        "EU": "https://advertising-api-eu.amazon.com",
        "FE": "https://advertising-api-fe.amazon.com"
    }
    
    def __init__(self, client_id: str = None, client_secret: str = None, 
                 refresh_token: str = None, profile_id: str = None, region: str = "NA"):
        self.client_id = client_id or os.getenv('AMAZON_CLIENT_ID') or os.getenv('CLIENT_ID')
        self.client_secret = client_secret or os.getenv('AMAZON_CLIENT_SECRET') or os.getenv('CLIENT_SECRET')
        self.refresh_token = refresh_token or os.getenv('AMAZON_REFRESH_TOKEN') or os.getenv('REFRESH_TOKEN')
        self.profile_id = profile_id or os.getenv('PROFILE_ID')
        
        if not all([self.client_id, self.client_secret, self.refresh_token, self.profile_id]):
            # Log failure to BQ before crashing
            log_to_bigquery("Missing required environment credentials", level="CRITICAL")
            raise ValueError("Missing required credentials")
        
        self.base_url = self.BASE_URLS.get(region, self.BASE_URLS["NA"])
        self.access_token = None
        self.token_expiry = None
        self.rate_limiter = RateLimiter(requests_per_second=0.5)
        self._refresh_access_token()
    
    def _refresh_access_token(self):
        try:
            response = requests.post(
                'https://api.amazon.com/auth/o2/token',
                data={
                    'grant_type': 'refresh_token',
                    'refresh_token': self.refresh_token,
                    'client_id': self.client_id,
                    'client_secret': self.client_secret
                }
            )
            response.raise_for_status()
            data = response.json()
            self.access_token = data['access_token']
            self.token_expiry = time.time() + data.get('expires_in', 3600) - 300
            logger.info("Access token refreshed")
        except Exception as e:
            logger.error(f"Failed to refresh token: {e}")
            log_to_bigquery(f"Failed to refresh token: {e}", level="ERROR")
            raise
    
    def _get_headers(self, additional_headers: Dict = None) -> Dict:
        if self.token_expiry and time.time() >= self.token_expiry:
            self._refresh_access_token()
        
        headers = {
            'Amazon-Advertising-API-ClientId': self.client_id,
            'Amazon-Advertising-API-Scope': self.profile_id,
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        if additional_headers:
            headers.update(additional_headers)
        
        return headers
    
    def _request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        self.rate_limiter.wait_if_needed()
        url = f"{self.base_url}{endpoint}"
        max_retries = 3
        
        headers = self._get_headers()
        if 'headers' in kwargs:
            headers.update(kwargs.pop('headers'))
        
        for attempt in range(max_retries):
            try:
                response = requests.request(method=method, url=url, headers=headers, timeout=30, **kwargs)
                
                if response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 2 ** attempt))
                    logger.warning(f"Rate limit, waiting {retry_after}s")
                    time.sleep(retry_after)
                    continue
                
                response.raise_for_status()
                return response
            except requests.exceptions.HTTPError as e:
                if attempt == max_retries - 1:
                    logger.error(f"Request failed: {method} {endpoint} - {e}")
                    try:
                        error_detail = e.response.json()
                        logger.error(f"API Error Details: {error_detail}")
                    except:
                        pass
                    raise
                time.sleep(2 ** attempt)
        
        raise Exception(f"Request failed after {max_retries} attempts")
    
    def list_campaigns(self, state_filter: Optional[str] = None) -> List[Campaign]:
        try:
            headers = {'Accept': 'application/vnd.spCampaign.v3+json'}
            payload = {}
            if state_filter:
                payload['stateFilter'] = {'include': [state_filter] if isinstance(state_filter, str) else state_filter}
            
            response = self._request('POST', '/sp/campaigns/list', json=payload, headers=headers)
            result = response.json()
            campaigns_data = result.get('campaigns', [])
            
            campaigns = []
            for c in campaigns_data:
                budget = 0
                budget_obj = c.get('budget', {})
                if isinstance(budget_obj, dict):
                    budget = budget_obj.get('budget', 0)
                elif 'dailyBudget' in c:
                    budget = c['dailyBudget']
                
                campaign = Campaign(
                    campaign_id=str(c.get('campaignId')),
                    name=c.get('name', ''),
                    state=c.get('state', ''),
                    daily_budget=float(budget),
                    targeting_type=c.get('targetingType', ''),
                    campaign_type='sponsoredProducts'
                )
                campaigns.append(campaign)
            
            logger.info(f"Retrieved {len(campaigns)} campaigns")
            return campaigns
        except Exception as e:
            logger.error(f"Failed to list campaigns: {e}")
            return []
    
    def update_campaign(self, campaign_id: str, updates: Dict) -> bool:
        try:
            headers = {'Accept': 'application/vnd.spCampaign.v3+json'}
            campaign_data = {'campaignId': int(campaign_id), **updates}
            self._request('PUT', '/sp/campaigns', json={'campaigns': [campaign_data]}, headers=headers)
            logger.info(f"Updated campaign {campaign_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to update campaign {campaign_id}: {e}")
            return False
    
    def list_ad_groups(self, campaign_id: Optional[str] = None) -> List[Dict]:
        try:
            headers = {'Accept': 'application/vnd.spAdGroup.v3+json'}
            payload = {}
            if campaign_id:
                payload['campaignIdFilter'] = {'include': [campaign_id]}
            
            response = self._request('POST', '/sp/adGroups/list', json=payload, headers=headers)
            result = response.json()
            ad_groups = result.get('adGroups', [])
            logger.info(f"Retrieved {len(ad_groups)} ad groups")
            return ad_groups
        except Exception as e:
            logger.error(f"Failed to list ad groups: {e}")
            return []
    
    def list_keywords(self, campaign_id: Optional[str] = None, ad_group_id: Optional[str] = None, state_filter: Optional[str] = None) -> List[Keyword]:
        try:
            headers = {'Accept': 'application/vnd.spKeyword.v3+json'}
            payload = {}
            if campaign_id:
                payload['campaignIdFilter'] = {'include': [campaign_id]}
            if ad_group_id:
                payload['adGroupIdFilter'] = {'include': [ad_group_id]}
            if state_filter:
                payload['stateFilter'] = {'include': [state_filter]}
            
            response = self._request('POST', '/sp/keywords/list', json=payload, headers=headers)
            result = response.json()
            keywords_data = result.get('keywords', [])
            
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
            return keywords
        except Exception as e:
            logger.error(f"Failed to list keywords: {e}")
            return []
    
    def update_keywords(self, updates: List[Dict]) -> bool:
        try:
            headers = {'Accept': 'application/vnd.spKeyword.v3+json'}
            formatted_updates = []
            for update in updates:
                formatted = {
                    'keywordId': str(update['keywordId']), # API v3 often expects string IDs in payload
                    'bid': round(float(update['bid']), 2)
                }
                if 'state' in update:
                    formatted['state'] = update['state']
                formatted_updates.append(formatted)
            
            self._request('PUT', '/sp/keywords', json={'keywords': formatted_updates}, headers=headers)
            logger.info(f"Updated {len(updates)} keywords")
            return True
        except Exception as e:
            logger.error(f"Failed to update keywords: {e}")
            return False

    def get_keyword_performance(self, start_date: str, end_date: str, metrics: List[str] = None) -> List[Dict]:
        """
        Retrieves keyword performance using Amazon Ads API v3 Async Reporting.
        """
        try:
            if metrics is None:
                metrics = [
                    "campaignId", "adGroupId", "keywordId", "keywordText", "matchType",
                    "impressions", "clicks", "cost", "purchases14d", "sales14d"
                ]
            
            payload = {
                "name": f"Keyword_Perf_{end_date}",
                "startDate": start_date,
                "endDate": end_date,
                "configuration": {
                    "adProduct": "SPONSORED_PRODUCTS",
                    "groupBy": ["campaign", "adGroup", "keyword"],
                    "columns": metrics,
                    "reportTypeId": "spPerformance",
                    "timeUnit": "SUMMARY",
                    "format": "GZIP_JSON"
                }
            }
            
            logger.info("Requesting Keyword Performance Report...")
            response = self._request('POST', '/reporting/reports', json=payload)
            report_id = response.json().get('reportId')
            
            if not report_id:
                logger.error("No report ID received.")
                return []
                
            url = self._wait_for_report(report_id)
            if not url:
                return []
                
            records = self._download_and_parse_report(url)
            logger.info(f"Retrieved performance data for {len(records)} keywords")
            return records
            
        except Exception as e:
            logger.error(f"Failed to get keyword performance: {e}")
            log_to_bigquery(f"Keyword Report Failed: {str(e)}", level="ERROR")
            return []

    def _wait_for_report(self, report_id: str) -> Optional[str]:
        for _ in range(30):
            time.sleep(3)
            try:
                response = self._request('GET', f'/reporting/reports/{report_id}')
                data = response.json()
                status = data.get('status')
                
                if status == 'COMPLETED':
                    return data.get('url')
                elif status == 'FAILED':
                    logger.error(f"Report generation failed: {data}")
                    return None
            except Exception as e:
                logger.warning(f"Error checking report status: {e}")
        
        logger.error("Report generation timed out")
        return None

    def _download_and_parse_report(self, url: str) -> List[Dict]:
        try:
            r = requests.get(url)
            with gzip.GzipFile(fileobj=BytesIO(r.content)) as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to download/parse report: {e}")
            return []

# ==============================================================================
# ENTRY POINT FUNCTION (Required by Cloud Run Jobs / Functions)
# ==============================================================================

def run_optimization(request=None):
    """
    This is the main function that Google Cloud calls.
    It orchestrates the optimization process.
    """
    log_to_bigquery("Starting Optimization Run", level="INFO")
    
    try:
        # 1. Initialize API
        api = AmazonAdsAPIv3()
        log_to_bigquery("Amazon API Client Initialized", level="INFO")

        # 2. Define Date Range (Last 7 days excluding today)
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

        # 3. Fetch Data (Example: Get Performance Report)
        log_to_bigquery(f"Fetching report from {start_date} to {end_date}", level="INFO")
        report_data = api.get_keyword_performance(start_date=start_date, end_date=end_date)
        
        if not report_data:
            log_to_bigquery("No report data found or report failed.", level="WARNING")
            return "Run completed with warnings"

        # 4. Optimization Logic Placeholder
        # (Insert your specific optimization logic here. For now, we just count high ACOS keywords)
        high_acos_count = 0
        updates_to_push = []

        for row in report_data:
            cost = row.get('cost', 0)
            sales = row.get('sales14d', 0)
            
            # Simple Logic: If ACOS > 40% (and sales > 0), assume we want to lower bid
            if sales > 0:
                acos = cost / sales
                if acos > 0.40:
                    high_acos_count += 1
                    # Logic to lower bid would go here
                    # updates_to_push.append({'keywordId': row['keywordId'], 'bid': 0.50})
        
        message = f"Analysis Complete. Processed {len(report_data)} keywords. Found {high_acos_count} high ACOS items."
        logger.info(message)
        log_to_bigquery(message, level="SUCCESS")

        return "Run Success"

    except Exception as e:
        error_msg = f"Critical Error in run_optimization: {str(e)}"
        logger.error(error_msg)
        log_to_bigquery(error_msg, level="CRITICAL")
        # Re-raise exception to ensure Cloud Run marks the job as Failed
        raise e

# Local Testing Block
if __name__ == "__main__":
    run_optimization()
