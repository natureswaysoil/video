"""Trusted GitHub OIDC worker. Does not use the expired cross-repository PAT."""
import base64
import json
import os
import pathlib
import sys
import time
import urllib.request
import urllib.parse
BASE = 'https://natures-way-marketing-agent-784311047921.us-east1.run.app'
STATE = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'marketing-worker-job.json'

def call(path, payload=None):
    oidc_url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=' + urllib.parse.quote(BASE, safe='')
    request = urllib.request.Request(oidc_url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urllib.request.urlopen(request, timeout=30) as response:
        token = json.load(response)['value']
    print('::add-mask::' + token, flush=True)
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(BASE + path, data=body, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def claim():
    preflight = call('/api/worker/preflight')
    if not preflight['enabled']:
        print('Automatic rotation paused in dashboard; no work claimed')
        return
    result = call('/api/worker/claim', {})
    if result.get('status') != 'claimed':
        print('No post attempted: ' + result.get('status', 'unknown'))
        return
    campaign = result['campaign']
    STATE.write_text(json.dumps(campaign))
    STATE.chmod(0o600)
    encoded = base64.urlsafe_b64encode(json.dumps(campaign).encode()).decode().rstrip('=')
    with open(os.environ['GITHUB_ENV'], 'a') as output:
        output.write('MARKETING_JOB_ID=' + campaign['job']['id'] + '\nMARKETING_CAMPAIGN_B64=' + encoded + '\nMARKETING_WORKER_CLAIMED=true\n')
    print('Worker claimed product ' + campaign['productId'] + '; campaign and slot are durably reserved')

def report():
    if not STATE.exists():
        print('No claimed marketing job to report')
        return
    campaign = json.loads(STATE.read_text())
    channels = {}
    receipt_path = pathlib.Path('marketing-result.json')
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        if receipt['jobId'] != campaign['job']['id'] or receipt['campaignId'] != campaign['id']:
            raise RuntimeError('Receipt identity mismatch')
        channels = receipt['channels']
    payload = {'campaignId': campaign['id'], 'jobId': campaign['job']['id'], 'success': os.environ.get('MARKETING_POST_OUTCOME') == 'success', 'channels': channels}
    for attempt in range(3):
        try:
            result = call('/api/worker/report', payload)
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)
    if not result.get('ok'):
        raise RuntimeError('Worker result not acknowledged; preserve artifact, do not replay')
    print('Channel receipts reported to marketing dashboard')

if __name__ == '__main__':
    try:
        {'claim': claim, 'report': report}[sys.argv[1]]()
    except Exception as error:
        print('Marketing worker failed: ' + type(error).__name__ + '. Do not replay an uncertain publishing job.', file=sys.stderr)
        raise SystemExit(1)
