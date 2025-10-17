#!/usr/bin/env python3
"""
Flask API wrapper for Amazon PPC Optimizer
Provides REST endpoints for dashboard and metrics
"""

import os
import json
import logging
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import time

# Import the optimizer
from amazon_ppc_optimizer import BidOptimizer, AmazonAdsAPI

app = Flask(__name__)
CORS(app)  # Enable CORS for dashboard access

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state for caching metrics
metrics_cache = {
    'last_updated': None,
    'data': {},
    'optimizer_running': False
}

CACHE_DURATION = 300  # 5 minutes


def get_api_client():
    """Initialize Amazon Ads API client from environment variables"""
    try:
        client_id = os.environ.get('CLIENT_ID')
        client_secret = os.environ.get('CLIENT_SECRET')
        refresh_token = os.environ.get('REFRESH_TOKEN')
        profile_id = os.environ.get('PROFILE_ID', '1780498399290938')
        
        if not all([client_id, client_secret, refresh_token]):
            raise ValueError("Missing required credentials")
        
        api = AmazonAdsAPI(
            client_id=client_id,
            client_secret=client_secret,
            refresh_token=refresh_token,
            region='NA'
        )
        api.profile_id = profile_id
        return api
    except Exception as e:
        logger.error(f"Failed to initialize API client: {e}")
        return None


def fetch_metrics():
    """Fetch current metrics from Amazon Ads API"""
    try:
        api = get_api_client()
        if not api:
            return None
        
        # Get campaigns
        campaigns = api.get_campaigns()
        
        # Calculate metrics
        total_spend = sum(c.get('cost', 0) for c in campaigns)
        total_sales = sum(c.get('sales', 0) for c in campaigns)
        total_clicks = sum(c.get('clicks', 0) for c in campaigns)
        total_impressions = sum(c.get('impressions', 0) for c in campaigns)
        
        acos = (total_spend / total_sales * 100) if total_sales > 0 else 0
        ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
        
        active_campaigns = len([c for c in campaigns if c.get('state') == 'ENABLED'])
        
        metrics = {
            'summary': {
                'total_spend': round(total_spend, 2),
                'total_sales': round(total_sales, 2),
                'acos': round(acos, 2),
                'roas': round(total_sales / total_spend, 2) if total_spend > 0 else 0,
                'clicks': total_clicks,
                'impressions': total_impressions,
                'ctr': round(ctr, 4),
                'active_campaigns': active_campaigns,
                'total_campaigns': len(campaigns)
            },
            'campaigns': campaigns[:10],  # Top 10 campaigns
            'last_updated': datetime.now().isoformat()
        }
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error fetching metrics: {e}")
        return None


def update_metrics_cache():
    """Background task to update metrics cache"""
    global metrics_cache
    
    while True:
        try:
            logger.info("Updating metrics cache...")
            metrics = fetch_metrics()
            
            if metrics:
                metrics_cache['data'] = metrics
                metrics_cache['last_updated'] = datetime.now()
                logger.info("Metrics cache updated successfully")
            else:
                logger.warning("Failed to fetch metrics")
                
        except Exception as e:
            logger.error(f"Error updating cache: {e}")
        
        # Wait before next update
        time.sleep(CACHE_DURATION)


@app.route('/')
def index():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'Amazon PPC Optimizer API',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/health')
def health():
    """Detailed health check"""
    api = get_api_client()
    api_healthy = api is not None
    
    return jsonify({
        'status': 'healthy' if api_healthy else 'degraded',
        'api_connection': api_healthy,
        'cache_age': (datetime.now() - metrics_cache['last_updated']).seconds if metrics_cache['last_updated'] else None,
        'optimizer_running': metrics_cache['optimizer_running']
    })


@app.route('/api/metrics')
def get_metrics():
    """Get current PPC metrics"""
    try:
        # Check cache freshness
        if metrics_cache['last_updated']:
            age = (datetime.now() - metrics_cache['last_updated']).seconds
            if age < CACHE_DURATION and metrics_cache['data']:
                logger.info(f"Returning cached metrics (age: {age}s)")
                return jsonify(metrics_cache['data'])
        
        # Fetch fresh metrics
        logger.info("Fetching fresh metrics...")
        metrics = fetch_metrics()
        
        if metrics:
            metrics_cache['data'] = metrics
            metrics_cache['last_updated'] = datetime.now()
            return jsonify(metrics)
        else:
            return jsonify({
                'error': 'Failed to fetch metrics',
                'last_cached': metrics_cache['last_updated'].isoformat() if metrics_cache['last_updated'] else None
            }), 503
            
    except Exception as e:
        logger.error(f"Error in get_metrics: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/optimize', methods=['POST'])
def run_optimization():
    """Trigger optimization run"""
    try:
        if metrics_cache['optimizer_running']:
            return jsonify({
                'status': 'already_running',
                'message': 'Optimization is already in progress'
            }), 409
        
        # Get options from request
        data = request.json or {}
        dry_run = data.get('dry_run', False)
        
        # Run optimization in background
        def optimize():
            global metrics_cache
            try:
                metrics_cache['optimizer_running'] = True
                logger.info(f"Starting optimization (dry_run={dry_run})...")
                
                # Here you would call the actual optimizer
                # For now, just simulate
                time.sleep(5)
                
                logger.info("Optimization completed")
            except Exception as e:
                logger.error(f"Optimization error: {e}")
            finally:
                metrics_cache['optimizer_running'] = False
        
        thread = threading.Thread(target=optimize)
        thread.start()
        
        return jsonify({
            'status': 'started',
            'dry_run': dry_run,
            'message': 'Optimization started in background'
        })
        
    except Exception as e:
        logger.error(f"Error starting optimization: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/campaigns')
def get_campaigns():
    """Get list of campaigns"""
    try:
        api = get_api_client()
        if not api:
            return jsonify({'error': 'API client not initialized'}), 503
        
        campaigns = api.get_campaigns()
        return jsonify({
            'campaigns': campaigns,
            'count': len(campaigns)
        })
        
    except Exception as e:
        logger.error(f"Error fetching campaigns: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Start background cache updater
    cache_thread = threading.Thread(target=update_metrics_cache, daemon=True)
    cache_thread.start()
    
    # Start Flask app
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
