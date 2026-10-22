"""Real subprocess resource/cleanup tests; no network or room assets."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import psutil

SPEC = importlib.util.find_spec('cpu_review_worker')
worker = None
if SPEC:
    import cpu_review_worker as worker


class CPUReviewWorkerTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(worker, 'bounded CPU supervisor is not implemented')

    def run_child(self, code, **limits):
        return worker.supervise([sys.executable, '-I', '-c', code], **limits)

    def test_actual_process_has_single_numerical_threads_and_resource_receipt(self):
        report, receipt = self.run_child('import os,json; print(json.dumps({k:os.environ[k] for k in '
            '["OMP_NUM_THREADS","OPENBLAS_NUM_THREADS","MKL_NUM_THREADS","NUMEXPR_NUM_THREADS"]}))')
        self.assertEqual(set(json.loads(report).values()), {'1'})
        self.assertEqual(receipt['status'], 'settled')
        self.assertEqual(receipt['outcome'], 'passed')
        self.assertGreater(receipt['peak_rss_bytes'], 0)
        self.assertGreaterEqual(receipt['min_available_bytes'], 2*1024**3)
        self.assertLess(receipt['elapsed_seconds'], 150)

    def test_timeout_kills_owned_descendants(self):
        code = ('import subprocess,sys,time; '
                'p=subprocess.Popen([sys.executable,"-I","-c","import time;time.sleep(30)"]); '
                'print(p.pid,flush=True);time.sleep(30)')
        report, receipt = self.run_child(code, timeout_seconds=1)
        self.assertEqual(receipt['outcome'], 'deadline')
        self.assertEqual(receipt['status'], 'settled')
        self.assertFalse(psutil.pid_exists(int(report)))

    def test_excess_report_is_rejected_and_process_stopped(self):
        _, receipt = self.run_child('import sys,time;sys.stdout.write("x"*70000);sys.stdout.flush();time.sleep(30)')
        self.assertEqual(receipt['outcome'], 'report-limit')
        self.assertEqual(receipt['status'], 'settled')

    def test_rss_limit_is_measured_on_real_process(self):
        _, receipt = self.run_child('import time;x=bytearray(64*1024**2);time.sleep(30)',
                                    rss_limit=psutil.Process().memory_info().rss+40*1024**2)
        self.assertEqual(receipt['outcome'], 'rss-limit')
        self.assertEqual(receipt['status'], 'settled')

    def test_no_launch_when_headroom_is_low_or_measurement_fails(self):
        for measurement in (type('Memory', (), {'available': 1024})(), OSError('unavailable')):
            with self.subTest(measurement=measurement), patch.object(worker.psutil, 'virtual_memory',
                    **({'side_effect': measurement} if isinstance(measurement, Exception) else {'return_value': measurement})), \
                    patch.object(worker.subprocess, 'Popen') as launch:
                _, receipt = self.run_child('print("must not run")')
                self.assertNotEqual(receipt['outcome'], 'passed')
                self.assertEqual(receipt['status'], 'settled')
                launch.assert_not_called()

    def test_default_deadline_leaves_cleanup_time_inside_host_cap(self):
        import inspect
        deadline = inspect.signature(worker.supervise).parameters['timeout_seconds'].default
        self.assertLessEqual(deadline+8, 145)

    def test_increased_limits_reject_before_launch(self):
        for limits in ({'timeout_seconds': 151}, {'rss_limit': 769*1024**2}, {'timeout_seconds': float('nan')}):
            with self.subTest(limits=limits), self.assertRaises(ValueError):
                self.run_child('print(1)', **limits)

    def test_existing_receipt_is_preserved_without_leaking_a_prelaunch_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            receipt = root/'resources.json'
            receipt.write_text('retained evidence')
            result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', 'inspect',
                '--input', str(root/'missing.json'), '--receipt', str(receipt)], capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(receipt.read_text(), 'retained evidence')
            self.assertFalse((root/'.scan-cpu.lock').exists())

    def test_cli_existing_lock_blocks_and_preserves_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            lock = root/'.scan-cpu.lock'
            lock.write_text('unsettled prior run')
            result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', 'inspect',
                '--input', str(root/'missing.json'), '--receipt', str(root/'resources.json')],
                capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root/'resources.json').exists())
            self.assertEqual(lock.read_text(), 'unsettled prior run')

    def test_actual_isolated_source_inspection(self):
        from test_scan_source import ScanSourceTests
        source = ScanSourceTests()
        source.setUp()
        self.addCleanup(source.doCleanups)
        manifest = source.acquire()
        receipt = source.root/'resources.json'
        result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', 'inspect',
            '--input', str(manifest), '--receipt', str(receipt)], capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'], 'inspection-only')
        self.assertEqual(json.loads(receipt.read_bytes())['outcome'], 'passed')

    def test_fetch_rejects_alternate_destination_inside_bounded_worker(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            plan = root/'plan.json'
            plan.write_text('{}')
            receipt = root/'resources.json'
            output = Path(worker.__file__).resolve().parents[2]/'.local/reconstruction'/('invalid-acquisition-'+root.name)
            result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', 'fetch',
                '--input', str(plan), '--output-dir', str(output), '--receipt', str(receipt)],
                capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())
            saved = json.loads(receipt.read_bytes())
            self.assertEqual(saved['status'], 'settled')
            self.assertEqual(saved['outcome'], 'worker-failed')
            self.assertFalse((root/'.scan-cpu.lock').exists())

    def test_rgbd_fetch_rejects_unapproved_plan_inside_bounded_worker(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            plan = root/'plan.json'
            plan.write_text('{}')
            receipt = root/'resources.json'
            output = Path(worker.__file__).resolve().parents[2]/'.local/reconstruction/arkitscenes/45261631/scan-rgbd-source-v1'
            result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', 'fetch-rgbd',
                '--input', str(plan), '--output-dir', str(output), '--receipt', str(receipt)],
                capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(receipt.exists(), 'RGB-D must run inside the resource supervisor')
            self.assertEqual(json.loads(receipt.read_bytes())['outcome'], 'worker-failed')
            self.assertFalse((root/'.scan-cpu.lock').exists())

    def test_fetch_arguments_are_not_accepted_by_other_operations(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for operation, output in [('inspect', ['--output-dir', str(root/'out')]), ('fetch', [])]:
                result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', operation,
                    '--input', str(root/'plan.json'), '--receipt', str(root/'resources.json'), *output],
                    capture_output=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((root/'resources.json').exists())
                self.assertFalse((root/'.scan-cpu.lock').exists())

    def test_rgbd_preparation_routes_run_fixed_isolated_worker(self):
        for operation in ('rgbd-directory', 'rgbd-prepare'):
            with self.subTest(operation=operation), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                receipt = root/'resources.json'
                result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', operation,
                    '--input', str(root/'missing.json'), '--output-dir', str(root/'out'),
                    '--receipt', str(receipt)], capture_output=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue(receipt.exists(), 'preparation stages must run within supervisor')
                self.assertEqual(json.loads(receipt.read_bytes())['outcome'], 'worker-failed')
                self.assertFalse((root/'out').exists())
                self.assertFalse((root/'.scan-cpu.lock').exists())

    def test_cli_rejects_arbitrary_entrypoint_without_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            receipt = Path(folder)/'resources.json'
            result = subprocess.run([sys.executable, '-I', worker.__file__, '--operation', 'exec',
                '--receipt', str(receipt)], capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(receipt.exists())


if __name__ == '__main__':
    unittest.main()
