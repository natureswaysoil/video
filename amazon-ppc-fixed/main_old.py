"""
Amazon PPC Optimizer - Cloud Function Entry Point
Optimizes Amazon Advertising campaigns with bid management, dayparting, and keyword discovery
"""

import os
import json
import logging
from typing import Dict, Any
from pathlib import Path

# Import the optimizer - use relative import
import sys
sys.path.insert(0, str(Path(__file__).parent))
from amazon_ppc_optimizer import (
    PPCAutomation,
    Config
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def _resolve_config_path(config_value: str) -> str:
    """Resolve config path from env var or use as direct path"""
    if not config_value:
        raise ValueError("No config path provided")
    
    # If it's a file path
    if os.path.isfile(config_value):
        return config_value
    
    # If it's JSON string
    try:
        json.loads(config_value)
        return config_value
    except json.JSONDecodeError:
        pass
    
    # Try as relative path
    relative_path = Path(__file__).parent / config_value
    if relative_path.is_file():
        return str(relative_path)
    
    raise FileNotFoundError(f"Config not found: {config_value}")


def load_config() -> str:
    """Get configuration path or create temp config from environment"""
    # Try PPC_CONFIG env var first (Secret Manager)
    config_value = os.getenv('PPC_CONFIG')
    
    if config_value:
        logger.info("Loading config from PPC_CONFIG environment variable")
        
        # Check if it's a JSON string
        try:
            config_data = json.loads(config_value)
            # Write to temp file
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                json.dump(config_data, f)
                temp_config_path = f.name
            logger.info(f"Created temp config at {temp_config_path}")
            return temp_config_path
        except json.JSONDecodeError:
            # It's a file path
            return _resolve_config_path(config_value)
    else:
        # Fall back to config.json
        config_file = Path(__file__).parent / 'config.json'
        logger.info(f"Loading config from {config_file}")
        return str(config_file)


def run_optimizer(request=None) -> Dict[str, Any]:
    """
    Cloud Function entry point for PPC optimization
    
    Args:
        request: HTTP request object (for Cloud Functions)
        
    Returns:
        Dict with optimization results
    """
    import time
    start_time = time.time()
    
    try:
        # Parse request if present
        dry_run = False
        if request:
            request_json = request.get_json(silent=True)
            if request_json:
                dry_run = request_json.get('dry_run', False)
        
        # Check for dry_run env var
        if os.getenv('DRY_RUN', '').lower() in ('true', '1', 'yes'):
            dry_run = True
        
        logger.info(f"Starting PPC optimization (dry_run={dry_run})")
        
        # Load configuration
        config_path = load_config()
        
        # Get profile_id from env or config
        profile_id = os.getenv('PROFILE_ID', '1780498399290938')  # Default US seller profile
        
        # Initialize optimizer
        optimizer = PPCAutomation(config_path, profile_id, dry_run=dry_run)
        
        # Run optimization
        results = optimizer.run()
        
        # Calculate duration
        duration = time.time() - start_time
        
        response = {
            'status': 'success',
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'dry_run': dry_run,
            'duration_seconds': round(duration, 2),
            'results': results
        }
        
        logger.info(f"Optimization completed in {duration:.2f}s")
        return response
        
    except Exception as e:
        logger.error(f"Optimization failed: {e}", exc_info=True)
        return {
            'status': 'error',
            'error': str(e),
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S')
        }


# For local testing
if __name__ == '__main__':
    print("Running PPC Optimizer locally...")
    result = run_optimizer()
    print(json.dumps(result, indent=2))
