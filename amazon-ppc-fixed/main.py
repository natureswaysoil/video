"""
Amazon PPC Optimizer - Cloud Function Entry Point
Simplified version using v3 API directly
"""

import os
import json
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any
from amazon_ads_api_v3 import AmazonAdsAPIv3

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import BigQuery logging utilities
try:
    from bigquery_logger import (
        log_to_bigquery,
        log_optimizer_start,
        log_optimizer_complete,
        log_optimizer_error
    )
    BIGQUERY_ENABLED = True
except ImportError as e:
    logger.warning(f"BigQuery logging not available: {e}")
    BIGQUERY_ENABLED = False


def apply_bid_optimization(api: AmazonAdsAPIv3, config: Dict) -> Dict:
    """Apply bid optimization to keywords"""
    results = {
        'keywords_analyzed': 0,
        'bids_increased': 0,
        'bids_decreased': 0,
        'no_change': 0
    }
    
    try:
        # Get all enabled keywords
        keywords = api.list_keywords(state_filter='ENABLED')
        results['keywords_analyzed'] = len(keywords)
        
        if not keywords:
            logger.warning("No keywords found")
            return results
        
        # Simple bid optimization logic
        updates = []
        bid_config = config.get('bid_optimization', {})
        min_bid = bid_config.get('min_bid', 0.30)
        max_bid = bid_config.get('max_bid', 5.00)
        bid_adjustment = bid_config.get('bid_adjustment_percent', 10) / 100
        
        for kw in keywords:
            current_bid = kw.bid
            # Simple logic: could be enhanced with performance data
            new_bid = round(current_bid * (1 + bid_adjustment), 2)
            new_bid = max(min_bid, min(max_bid, new_bid))
            
            if abs(new_bid - current_bid) > 0.01:
                updates.append({
                    'keywordId': kw.keyword_id,
                    'bid': new_bid
                })
                if new_bid > current_bid:
                    results['bids_increased'] += 1
                else:
                    results['bids_decreased'] += 1
            else:
                results['no_change'] += 1
        
        # Apply updates in batches
        if updates:
            batch_size = 100
            for i in range(0, len(updates), batch_size):
                batch = updates[i:i+batch_size]
                api.update_keywords(batch)
                logger.info(f"Updated batch {i//batch_size + 1} ({len(batch)} keywords)")
        
        return results
        
    except Exception as e:
        logger.error(f"Bid optimization failed: {e}")
        return results


def apply_dayparting(api: AmazonAdsAPIv3, config: Dict) -> Dict:
    """Apply dayparting bid adjustments"""
    results = {
        'keywords_updated': 0,
        'current_hour': datetime.now().hour,
        'current_day': datetime.now().strftime('%A').upper(),
        'multiplier': 1.0
    }
    
    try:
        dayparting = config.get('dayparting', {})
        if not dayparting.get('enabled', False):
            logger.info("Dayparting not enabled")
            return results
        
        # Get current time multiplier
        current_hour = results['current_hour']
        current_day = results['current_day']
        
        hourly_multipliers = dayparting.get('hourly_multipliers', {})
        multiplier = hourly_multipliers.get(str(current_hour), 1.0)
        results['multiplier'] = multiplier
        
        if multiplier != 1.0:
            keywords = api.list_keywords(state_filter='ENABLED')
            updates = []
            
            for kw in keywords:
                adjusted_bid = round(kw.bid * multiplier, 2)
                if adjusted_bid != kw.bid:
                    updates.append({
                        'keywordId': kw.keyword_id,
                        'bid': adjusted_bid
                    })
            
            if updates:
                api.update_keywords(updates)
                results['keywords_updated'] = len(updates)
        
        return results
        
    except Exception as e:
        logger.error(f"Dayparting failed: {e}")
        return results


def manage_campaigns(api: AmazonAdsAPIv3, config: Dict) -> Dict:
    """Manage campaign states"""
    results = {
        'campaigns_activated': 0,
        'campaigns_paused': 0,
        'no_change': 0
    }
    
    try:
        campaigns = api.list_campaigns()
        logger.info(f"Found {len(campaigns)} campaigns")
        
        campaign_mgmt = config.get('campaign_management', {})
        if not campaign_mgmt.get('enabled', False):
            logger.info("Campaign management not enabled")
            results['no_change'] = len(campaigns)
            return results
        
        # Simple logic: could be enhanced with performance criteria
        for camp in campaigns:
            # Log campaign for visibility
            logger.info(f"Campaign: {camp.name} (ID: {camp.campaign_id}, State: {camp.state}, Budget: ${camp.daily_budget})")
        
        results['no_change'] = len(campaigns)
        return results
        
    except Exception as e:
        logger.error(f"Campaign management failed: {e}")
        return results


def discover_keywords(api: AmazonAdsAPIv3, config: Dict) -> Dict:
    """Discover and automatically add new high-potential keywords"""
    results = {
        'keywords_discovered': 0,
        'keywords_added': 0,
        'ad_groups_analyzed': 0
    }
    
    try:
        keyword_discovery = config.get('keyword_discovery', {})
        if not keyword_discovery.get('enabled', False):
            logger.info("Keyword discovery not enabled")
            return results
        
        # Configuration
        max_ad_groups = keyword_discovery.get('max_ad_groups_per_run', 10)
        max_recommendations = keyword_discovery.get('max_recommendations_per_ad_group', 20)
        min_bid = keyword_discovery.get('min_bid', 0.50)
        max_bid = keyword_discovery.get('max_bid', 2.00)
        auto_add = keyword_discovery.get('auto_add', True)
        
        # Get ad groups to discover keywords for
        ad_groups = api.list_ad_groups()
        logger.info(f"Found {len(ad_groups)} ad groups for keyword discovery")
        
        # Get existing keywords to avoid duplicates
        existing_keywords = api.list_keywords()
        existing_keyword_texts = {
            (kw.ad_group_id, kw.keyword_text.lower(), kw.match_type) 
            for kw in existing_keywords
        }
        logger.info(f"Filtering against {len(existing_keyword_texts)} existing keywords")
        
        # Get recommendations for each ad group
        new_keywords_to_add = []
        for ag in ad_groups[:max_ad_groups]:
            try:
                ad_group_id = str(ag.get('adGroupId'))
                campaign_id = str(ag.get('campaignId'))
                
                recommendations = api.get_keyword_recommendations(
                    ad_group_id,
                    max_recommendations=max_recommendations
                )
                results['keywords_discovered'] += len(recommendations)
                results['ad_groups_analyzed'] += 1
                
                # Filter and prepare keywords to add
                for rec in recommendations:
                    keyword_text = rec.get('keywordText', '').strip()
                    match_type = rec.get('matchType', 'BROAD')
                    suggested_bid = float(rec.get('suggestedBid', min_bid))
                    
                    # Check if keyword already exists
                    if (ad_group_id, keyword_text.lower(), match_type) in existing_keyword_texts:
                        continue
                    
                    # Use suggested bid but cap it
                    bid = max(min_bid, min(max_bid, suggested_bid))
                    
                    new_keywords_to_add.append({
                        'campaignId': int(campaign_id),
                        'adGroupId': int(ad_group_id),
                        'keywordText': keyword_text,
                        'matchType': match_type,
                        'state': 'ENABLED',
                        'bid': round(bid, 2)
                    })
                
                logger.info(f"Ad group {ad_group_id}: {len(recommendations)} recommendations, "
                          f"{len([k for k in new_keywords_to_add if k['adGroupId'] == int(ad_group_id)])} new keywords")
                
            except Exception as e:
                logger.warning(f"Failed to get recommendations for ad group {ag.get('adGroupId')}: {e}")
        
        # Add keywords if enabled
        if auto_add and new_keywords_to_add:
            logger.info(f"Adding {len(new_keywords_to_add)} new keywords...")
            batch_size = 100
            for i in range(0, len(new_keywords_to_add), batch_size):
                batch = new_keywords_to_add[i:i+batch_size]
                created_ids = api.create_keywords(batch)
                results['keywords_added'] += len(created_ids)
                logger.info(f"Added batch {i//batch_size + 1} ({len(created_ids)} keywords)")
        else:
            results['keywords_added'] = 0
            logger.info(f"Would add {len(new_keywords_to_add)} keywords (auto_add={auto_add})")
        
        return results
        
    except Exception as e:
        logger.error(f"Keyword discovery failed: {e}")
        return results


def manage_negative_keywords(api: AmazonAdsAPIv3, config: Dict) -> Dict:
    """Automatically identify and add negative keywords based on poor performance"""
    results = {
        'negative_keywords_added': 0,
        'keywords_analyzed': 0,
        'existing_negatives': 0,
        'poor_performers_found': 0
    }
    
    try:
        neg_kw_config = config.get('negative_keywords', {})
        if not neg_kw_config.get('enabled', False):
            logger.info("Negative keyword management not enabled")
            return results
        
        # Configuration
        min_spend = neg_kw_config.get('min_spend_threshold', 10.0)  # Min spend before considering negative
        max_acos = neg_kw_config.get('max_acos_threshold', 100.0)  # Max ACOS % before negative
        min_clicks = neg_kw_config.get('min_clicks_threshold', 20)  # Min clicks before considering
        auto_add = neg_kw_config.get('auto_add', True)
        match_type = neg_kw_config.get('negative_match_type', 'NEGATIVE_PHRASE')  # or NEGATIVE_EXACT
        lookback_days = neg_kw_config.get('lookback_days', 30)
        
        # Get existing negative keywords to avoid duplicates
        existing_negatives = api.list_negative_keywords()
        results['existing_negatives'] = len(existing_negatives)
        existing_negative_texts = {
            (str(nk.get('campaignId')), nk.get('keywordText', '').lower(), nk.get('matchType', ''))
            for nk in existing_negatives
        }
        logger.info(f"Found {len(existing_negatives)} existing negative keywords")
        
        # Get all active keywords
        keywords = api.list_keywords(state_filter='ENABLED')
        results['keywords_analyzed'] = len(keywords)
        logger.info(f"Analyzing {len(keywords)} active keywords for negative candidates")
        
        # Get performance data from Reporting API
        end_date = datetime.now().strftime('%Y%m%d')
        start_date = (datetime.now() - timedelta(days=lookback_days)).strftime('%Y%m%d')
        
        logger.info(f"Fetching performance data from {start_date} to {end_date}")
        
        try:
            # Try to get keyword performance data
            performance_data = api.get_keyword_performance(start_date, end_date)
            logger.info(f"Retrieved performance data for {len(performance_data)} keywords")
            
            # Also try to get search term data for additional insights
            search_terms = api.get_search_term_report(start_date, end_date)
            logger.info(f"Retrieved search term data for {len(search_terms)} queries")
            
        except Exception as e:
            logger.warning(f"Could not fetch performance data (Reporting API may not be configured): {e}")
            performance_data = []
            search_terms = []
        
        negatives_to_add = []
        
        # Analyze performance data for poor performers
        if performance_data:
            for perf in performance_data:
                try:
                    campaign_id = str(perf.get('campaignId', ''))
                    keyword_text = perf.get('keywordText', '').strip()
                    clicks = int(perf.get('clicks', 0))
                    cost = float(perf.get('cost', 0))
                    sales = float(perf.get('attributedSales7d', 0) or perf.get('sales', 0))
                    conversions = int(perf.get('attributedConversions7d', 0) or perf.get('purchases', 0))
                    
                    # Calculate ACOS
                    acos = (cost / sales * 100) if sales > 0 else 999.0
                    
                    # Identify poor performers
                    is_poor_performer = False
                    reason = ""
                    
                    if clicks >= min_clicks and cost >= min_spend:
                        if conversions == 0:
                            is_poor_performer = True
                            reason = f"No conversions after {clicks} clicks, ${cost:.2f} spent"
                        elif acos > max_acos:
                            is_poor_performer = True
                            reason = f"ACOS {acos:.1f}% exceeds threshold {max_acos}%"
                    
                    if is_poor_performer:
                        results['poor_performers_found'] += 1
                        
                        # Check if already negative
                        if (campaign_id, keyword_text.lower(), match_type) not in existing_negative_texts:
                            negatives_to_add.append({
                                'campaignId': int(campaign_id),
                                'keywordText': keyword_text,
                                'matchType': match_type,
                                'state': 'ENABLED',
                                '_reason': reason  # For logging only
                            })
                            logger.info(f"Identified negative candidate: '{keyword_text}' - {reason}")
                
                except Exception as e:
                    logger.warning(f"Error analyzing performance record: {e}")
                    continue
        
        # Analyze search terms for additional negative candidates
        if search_terms:
            for term in search_terms:
                try:
                    campaign_id = str(term.get('campaignId', ''))
                    query = term.get('query', '').strip()
                    clicks = int(term.get('clicks', 0))
                    cost = float(term.get('cost', 0))
                    sales = float(term.get('sales', 0))
                    purchases = int(term.get('purchases', 0))
                    
                    # Check if search term should be negative
                    if clicks >= min_clicks and cost >= min_spend and purchases == 0:
                        if (campaign_id, query.lower(), match_type) not in existing_negative_texts:
                            # Avoid duplicates in our add list
                            if not any(n['keywordText'].lower() == query.lower() and 
                                     str(n['campaignId']) == campaign_id for n in negatives_to_add):
                                negatives_to_add.append({
                                    'campaignId': int(campaign_id),
                                    'keywordText': query,
                                    'matchType': match_type,
                                    'state': 'ENABLED',
                                    '_reason': f"Search term with {clicks} clicks, ${cost:.2f} spent, no conversions"
                                })
                                results['poor_performers_found'] += 1
                
                except Exception as e:
                    logger.warning(f"Error analyzing search term: {e}")
                    continue
        
        # Add manual negative keywords from config
        manual_negatives = neg_kw_config.get('manual_negative_keywords', [])
        if manual_negatives:
            logger.info(f"Adding {len(manual_negatives)} manual negative keywords")
            for campaign in api.list_campaigns():
                campaign_id = str(campaign.campaign_id)
                
                for negative_text in manual_negatives:
                    # Check if already exists
                    if (campaign_id, negative_text.lower(), match_type) in existing_negative_texts:
                        continue
                    
                    # Avoid duplicates in our add list
                    if not any(n['keywordText'].lower() == negative_text.lower() and 
                             str(n['campaignId']) == campaign_id for n in negatives_to_add):
                        negatives_to_add.append({
                            'campaignId': int(campaign_id),
                            'keywordText': negative_text,
                            'matchType': match_type,
                            'state': 'ENABLED',
                            '_reason': 'Manual negative keyword from config'
                        })
        
        # Remove the _reason field before adding (API doesn't accept it)
        for negative in negatives_to_add:
            if '_reason' in negative:
                del negative['_reason']
        
        # Add negative keywords if enabled
        if auto_add and negatives_to_add:
            logger.info(f"Adding {len(negatives_to_add)} negative keywords...")
            batch_size = 100
            for i in range(0, len(negatives_to_add), batch_size):
                batch = negatives_to_add[i:i+batch_size]
                created_ids = api.create_negative_keywords(batch)
                results['negative_keywords_added'] += len(created_ids)
                logger.info(f"Added negative keyword batch {i//batch_size + 1} ({len(created_ids)} keywords)")
        else:
            logger.info(f"Would add {len(negatives_to_add)} negative keywords (auto_add={auto_add})")
        
        logger.info(f"Negative keyword management complete: {results['poor_performers_found']} poor performers found, "
                   f"{results['negative_keywords_added']} added, {results['existing_negatives']} already exist")
        
        return results
        
    except Exception as e:
        logger.error(f"Negative keyword management failed: {e}")
        return results


def run_optimizer(request=None) -> Dict[str, Any]:
    """
    Cloud Function entry point for PPC optimization
    """
    start_time = time.time()
    run_id = str(uuid.uuid4())  # Generate unique run ID
    
    try:
        # Parse request
        dry_run = False
        if request:
            request_json = request.get_json(silent=True)
            if request_json:
                dry_run = request_json.get('dry_run', False)
        
        if os.getenv('DRY_RUN', '').lower() in ('true', '1', 'yes'):
            dry_run = True
        
        logger.info(f"Starting PPC optimization (dry_run={dry_run}, run_id={run_id})")
        
        # Log optimizer start to BigQuery
        if BIGQUERY_ENABLED:
            log_optimizer_start(run_id, config={'dry_run': dry_run})
        
        # Load config from env var (Secret Manager)
        config_str = os.getenv('PPC_CONFIG', '{}')
        try:
            config = json.loads(config_str)
        except json.JSONDecodeError:
            logger.warning("Failed to parse PPC_CONFIG, using defaults")
            config = {
                'bid_optimization': {
                    'enabled': True, 
                    'min_bid': 0.30, 
                    'max_bid': 5.00,
                    'bid_adjustment_percent': 10
                },
                'dayparting': {
                    'enabled': False,  # Disabled by default
                    'hourly_multipliers': {}
                },
                'campaign_management': {
                    'enabled': True
                },
                'keyword_discovery': {
                    'enabled': True,
                    'auto_add': True,
                    'max_ad_groups_per_run': 10,
                    'max_recommendations_per_ad_group': 20,
                    'min_bid': 0.50,
                    'max_bid': 2.00
                },
                'negative_keywords': {
                    'enabled': True,
                    'auto_add': True,
                    'min_spend_threshold': 10.0,
                    'max_acos_threshold': 100.0,
                    'min_clicks_threshold': 20,
                    'negative_match_type': 'NEGATIVE_PHRASE',
                    'manual_negative_keywords': []  # Add manual negatives here
                }
            }
        
        # Initialize v3 API client
        logger.info("Initializing Amazon Ads API v3 client...")
        api = AmazonAdsAPIv3()
        
        # Run optimization steps
        results = {}
        
        logger.info("=== Optimizing Bids ===")
        results['bid_optimization'] = apply_bid_optimization(api, config)
        
        logger.info("=== Applying Dayparting ===")
        results['dayparting'] = apply_dayparting(api, config)
        
        logger.info("=== Managing Campaigns ===")
        results['campaign_management'] = manage_campaigns(api, config)
        
        logger.info("=== Discovering Keywords ===")
        results['keyword_discovery'] = discover_keywords(api, config)
        
        logger.info("=== Managing Negative Keywords ===")
        results['negative_keywords'] = manage_negative_keywords(api, config)
        
        # Calculate duration
        duration = time.time() - start_time
        
        response = {
            'status': 'success',
            'timestamp': datetime.now().isoformat(),
            'dry_run': dry_run,
            'duration_seconds': round(duration, 2),
            'results': results,
            'run_id': run_id
        }
        
        logger.info(f"Optimization completed in {duration:.2f}s")
        
        # Log successful completion to BigQuery
        if BIGQUERY_ENABLED:
            log_optimizer_complete(run_id, results, duration)
        
        return response
        
    except Exception as e:
        logger.error(f"Optimization failed: {e}", exc_info=True)
        
        # Log error to BigQuery
        if BIGQUERY_ENABLED:
            import traceback
            error_details = {
                'error_type': type(e).__name__,
                'traceback': traceback.format_exc()
            }
            log_optimizer_error(run_id, str(e), error_details)
        
        return {
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
            'run_id': run_id
        }


# For local testing
if __name__ == '__main__':
    print("Running PPC Optimizer locally...")
    result = run_optimizer()
    print(json.dumps(result, indent=2))
