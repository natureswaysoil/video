from flask import Flask, jsonify
from flask_cors import CORS
from amazon_ppc_optimizer import PPCOptimizer
from datetime import datetime
from time import time

app = Flask(__name__)
CORS(app)

# Simple in-memory cache
_CACHE = {'payload': None, 'ts': 0}
CACHE_TTL = 60  # seconds


@app.route('/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/metrics')
def api_metrics():
    """Return a JSON payload compatible with the dashboard.

    Shape:
    {
      "summary": {...},
      "campaigns": [...],
      "last_updated": "ISO timestamp"
    }
    """
    try:
        # Return cached payload when fresh
        if _CACHE['payload'] and (time() - _CACHE['ts'] < CACHE_TTL):
            return jsonify(_CACHE['payload'])

        optimizer = PPCOptimizer(config_path='config.json')
        summary = optimizer.get_summary_metrics()

        # campaigns: minimal placeholder list; later can be enriched
        campaigns = []
        if isinstance(summary, dict):
            # produce a simple campaigns array if present
            campaigns = [
                { 'name': 'Campaign A', 'acos': 32.5 },
                { 'name': 'Campaign B', 'acos': 41.2 }
            ]

        payload = {
            'summary': summary,
            'campaigns': campaigns,
            'last_updated': datetime.utcnow().isoformat() + 'Z'
        }
        _CACHE['payload'] = payload
        _CACHE['ts'] = time()
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
