"""
Amazon Advertising API v3 Client for Sponsored Products
"""
import requests
import time
import logging
import os
from typing import Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

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
            response = self._request('PUT', '/sp/campaigns', json={'campaigns': [campaign_data]}, headers=headers)
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
                    'keywordId': int(update['keywordId']),
                    'bid': round(float(update['bid']), 2)
                }
                if 'state' in update:
                    formatted['state'] = update['state']
                formatted_updates.append(formatted)
            
            response = self._request('PUT', '/sp/keywords', json={'keywords': formatted_updates}, headers=headers)
            logger.info(f"Updated {len(updates)} keywords")
            return True
        except Exception as e:
            logger.error(f"Failed to update keywords: {e}")
            return False
    
    def create_keywords(self, keywords: List[Dict]) -> List[str]:
        try:
            headers = {'Accept': 'application/vnd.spKeyword.v3+json'}
            response = self._request('POST', '/sp/keywords', json={'keywords': keywords}, headers=headers)
            result = response.json()
            
            created_ids = []
            for kw_result in result.get('keywords', []):
                if kw_result.get('keywordId'):
                    created_ids.append(str(kw_result['keywordId']))
            
            logger.info(f"Created {len(created_ids)} keywords")
            return created_ids
        except Exception as e:
            logger.error(f"Failed to create keywords: {e}")
            return []
    
    def list_negative_keywords(self, campaign_id: Optional[str] = None) -> List[Dict]:
        try:
            headers = {'Accept': 'application/vnd.spNegativeKeyword.v3+json'}
            payload = {}
            if campaign_id:
                payload['campaignIdFilter'] = {'include': [campaign_id]}
            
            response = self._request('POST', '/sp/negativeKeywords/list', json=payload, headers=headers)
            result = response.json()
            negative_keywords = result.get('negativeKeywords', [])
            logger.info(f"Retrieved {len(negative_keywords)} negative keywords")
            return negative_keywords
        except Exception as e:
            logger.error(f"Failed to list negative keywords: {e}")
            return []
    
    def create_negative_keywords(self, negative_keywords: List[Dict]) -> List[str]:
        try:
            headers = {'Accept': 'application/vnd.spNegativeKeyword.v3+json'}
            response = self._request('POST', '/sp/negativeKeywords', json={'negativeKeywords': negative_keywords}, headers=headers)
            result = response.json()
            
            created_ids = []
            for nk_result in result.get('negativeKeywords', []):
                if nk_result.get('keywordId'):
                    created_ids.append(str(nk_result['keywordId']))
            
            logger.info(f"Created {len(created_ids)} negative keywords")
            return created_ids
        except Exception as e:
            logger.error(f"Failed to create negative keywords: {e}")
            return []
    
    def get_keyword_recommendations(self, ad_group_id: str, max_recommendations: int = 100) -> List[Dict]:
        try:
            payload = {'adGroupId': int(ad_group_id), 'maxRecommendations': max_recommendations}
            response = self._request('POST', '/sp/keywords/recommendations', json=payload)
            result = response.json()
            recommendations = result.get('recommendations', [])
            logger.info(f"Retrieved {len(recommendations)} keyword recommendations")
            return recommendations
        except Exception as e:
            logger.error(f"Failed to get keyword recommendations: {e}")
            return []
    
    def get_keyword_performance(self, start_date: str, end_date: str, metrics: List[str] = None) -> List[Dict]:
        """
        Get keyword performance metrics from Reporting API
        
        Args:
            start_date: Start date in YYYYMMDD format
            end_date: End date in YYYYMMDD format
            metrics: List of metrics to retrieve. Defaults to common metrics.
        
        Returns:
            List of keyword performance records
        """
        try:
            if metrics is None:
                metrics = [
                    'campaignId', 'adGroupId', 'keywordId', 'keywordText', 'matchType',
                    'impressions', 'clicks', 'cost', 'purchases', 'sales',
                    'attributedSales7d', 'attributedConversions7d'
                ]
            
            payload = {
                'reportDate': end_date,
                'metrics': ','.join(metrics),
                'segment': 'query'  # Get search term level data
            }
            
            # Note: Reporting API v3 uses different endpoints
            # This is a simplified version - full implementation would use async reports
            response = self._request('POST', '/sp/keywords/report', json=payload)
            result = response.json()
            
            # Parse report data
            records = result.get('records', [])
            logger.info(f"Retrieved performance data for {len(records)} keywords")
            return records
            
        except Exception as e:
            logger.error(f"Failed to get keyword performance: {e}")
            return []
    
    def get_search_term_report(self, start_date: str, end_date: str) -> List[Dict]:
        """
        Get search term report to identify negative keyword candidates
        
        Args:
            start_date: Start date in YYYYMMDD format  
            end_date: End date in YYYYMMDD format
        
        Returns:
            List of search term records with performance data
        """
        try:
            payload = {
                'reportDate': end_date,
                'metrics': 'campaignId,adGroupId,keywordId,query,impressions,clicks,cost,purchases,sales'
            }
            
            response = self._request('POST', '/sp/targets/report', json=payload)
            result = response.json()
            
            records = result.get('records', [])
            logger.info(f"Retrieved search term data for {len(records)} queries")
            return records
            
        except Exception as e:
            logger.error(f"Failed to get search term report: {e}")
            return []
