import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('worker',pathlib.Path(__file__).with_name('marketing-worker.py'))
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
class WorkerTests(unittest.TestCase):
    def test_lost_claim_response_is_never_replayed(self):
        with patch.object(worker,'call',side_effect=[{'enabled':True},TimeoutError()]) as call:
            with self.assertRaises(TimeoutError):worker.claim()
            self.assertEqual(call.call_count,2)
    def test_report_retries_without_republishing(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=pathlib.Path(tmp)/'state.json'
            state.write_text(json.dumps({'id':'campaign','job':{'id':'job'}}))
            with patch.object(worker,'STATE',state),patch.object(worker,'call',side_effect=[TimeoutError(),{'ok':True}]) as call,patch.object(worker.time,'sleep'):
                worker.report()
                self.assertEqual(call.call_count,2)
                self.assertTrue(all(c.args[0]=='/api/worker/report' for c in call.call_args_list))
                self.assertEqual(call.call_args.args[1]['channels'],{})
if __name__=='__main__':unittest.main()
