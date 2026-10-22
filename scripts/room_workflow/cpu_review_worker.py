"""Sampled CPU limits for fixed, reviewed scan acquisition/verification/inspection entrypoints."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

import psutil

RSS_LIMIT = 768*1024**2
MEMORY_FLOOR = 2*1024**3
REPORT_LIMIT = 65536
THREAD_KEYS = ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS')


def supervise(command, *, timeout_seconds=135, rss_limit=RSS_LIMIT):
    if (not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 150
            or type(rss_limit) is not int or not 0 < rss_limit <= RSS_LIMIT):
        raise ValueError('Invalid CPU review limits')
    started = time.monotonic()
    receipt = {'status': 'settled', 'outcome': 'measurement-failed', 'peak_rss_bytes': 0,
               'min_available_bytes': None, 'elapsed_seconds': 0}
    child, owned, readers, output = None, set(), [], bytearray()
    overflow = threading.Event()

    def drain(pipe, retain):
        try:
            count = 0
            while chunk := pipe.read(4096):
                count += len(chunk)
                if count > REPORT_LIMIT:
                    overflow.set()
                elif retain:
                    output.extend(chunk)
        finally:
            pipe.close()

    try:
        available = psutil.virtual_memory().available
        receipt['min_available_bytes'] = available
        if available < MEMORY_FLOOR:
            receipt['outcome'] = 'memory-floor'
            return bytes(output), receipt
        child = subprocess.Popen(command, cwd=Path(__file__).resolve().parents[2],
            env={**os.environ, **dict.fromkeys(THREAD_KEYS, '1')}, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False)
        process = psutil.Process(child.pid)
        owned.add(process)
        for pipe, retain in ((child.stdout, True), (child.stderr, False)):
            reader = threading.Thread(target=drain, args=(pipe, retain), daemon=True)
            reader.start()
            readers.append(reader)
        while True:
            try:
                owned.update(process.children(recursive=True))
            except psutil.NoSuchProcess:
                pass
            rss = psutil.Process().memory_info().rss
            for member in tuple(owned):
                try:
                    if member.is_running():
                        rss += member.memory_info().rss
                except psutil.NoSuchProcess:
                    pass
            available = psutil.virtual_memory().available
            receipt['peak_rss_bytes'] = max(receipt['peak_rss_bytes'], rss)
            receipt['min_available_bytes'] = min(receipt['min_available_bytes'], available)
            if rss > rss_limit:
                receipt['outcome'] = 'rss-limit'
                break
            if available < MEMORY_FLOOR:
                receipt['outcome'] = 'memory-floor'
                break
            if overflow.is_set():
                receipt['outcome'] = 'report-limit'
                break
            if time.monotonic()-started >= timeout_seconds:
                receipt['outcome'] = 'deadline'
                break
            if child.poll() is not None and not any(reader.is_alive() for reader in readers):
                receipt['outcome'] = 'passed' if child.returncode == 0 else 'worker-failed'
                break
            time.sleep(.05)
    except (OSError, psutil.Error):
        receipt['outcome'] = 'measurement-failed'
    finally:
        # Reviewed workers do not detach descendants; this is not an arbitrary-code sandbox.
        cleanup_ok = True
        for member in reversed(tuple(owned)):
            try:
                if member.is_running() and member.status() != psutil.STATUS_ZOMBIE:
                    if receipt['outcome'] == 'passed':
                        receipt['outcome'] = 'descendant-live'
                    member.kill()
            except psutil.NoSuchProcess:
                pass
            except psutil.Error:
                cleanup_ok = False
        if child is not None:
            try:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=5)
                _, alive = psutil.wait_procs(list(owned), timeout=2)
                cleanup_ok = cleanup_ok and not alive
            except (OSError, psutil.Error, subprocess.TimeoutExpired):
                cleanup_ok = False
        for reader in readers:
            reader.join(timeout=.2)
            cleanup_ok = cleanup_ok and not reader.is_alive()
        if not cleanup_ok:
            receipt['status'] = 'termination-unconfirmed'
        receipt['elapsed_seconds'] = time.monotonic()-started
    return bytes(output), receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation', required=True, choices=('verify', 'inspect', 'fetch', 'fetch-rgbd', 'rgbd-directory', 'rgbd-prepare'))
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--expected', type=Path)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--receipt', required=True, type=Path)
    args = parser.parse_args()
    if (args.operation == 'verify') != (args.expected is not None):
        parser.error('Only verify requires --expected')
    if (args.operation in ('fetch', 'fetch-rgbd', 'rgbd-directory', 'rgbd-prepare')) != (args.output_dir is not None):
        parser.error('Only acquisition and RGB-D preparation require --output-dir')
    folder = Path(__file__).resolve().parent
    if args.operation == 'verify':
        command = [sys.executable, '-I', str(folder/'scan_room.py'), '--input', str(args.expected),
                   '--verify', str(args.input)]
    elif args.operation == 'fetch':
        command = [sys.executable, '-I', str(folder/'scan_source.py'), 'fetch', '--plan', str(args.input),
                   '--output-dir', str(args.output_dir)]
    elif args.operation == 'fetch-rgbd':
        command = [sys.executable, '-I', str(folder/'scan_rgbd_source.py'), '--plan', str(args.input),
                   '--output-dir', str(args.output_dir)]
    elif args.operation in ('rgbd-directory', 'rgbd-prepare'):
        command = [sys.executable, '-I', str(folder/'scan_rgbd_prepare.py'), args.operation.removeprefix('rgbd-'),
                   '--input', str(args.input), '--output-dir', str(args.output_dir)]
    else:
        command = [sys.executable, '-I', str(folder/'scan_source.py'), 'inspect', '--manifest', str(args.input)]
    # One trusted host root per operator; killed supervisors leave the lock for verified cleanup.
    lock = args.receipt.parent/'.scan-cpu.lock'
    identity = {'pid': os.getpid(), 'created': psutil.Process().create_time(), 'receipt': str(args.receipt)}
    handle = lock.open('x', encoding='utf-8')
    try:
        with handle:
            json.dump(identity, handle)
            handle.flush()
            os.fsync(handle.fileno())
        # The host supplies private paths; exclusive receipts preserve interruption evidence.
        with args.receipt.open('x', encoding='utf-8') as handle:
            json.dump({'status': 'running', 'pid': os.getpid()}, handle)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        lock.unlink()
        raise
    output, receipt = supervise(command)
    receipt['report_sha256'] = hashlib.sha256(output).hexdigest()
    partial = args.receipt.with_name(args.receipt.name+'.part')
    with partial.open('x', encoding='utf-8') as handle:
        json.dump(receipt, handle, allow_nan=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(partial, args.receipt)
    if receipt['status'] == 'settled':
        lock.unlink()
    if receipt['status'] != 'settled' or receipt['outcome'] != 'passed':
        parser.error('CPU review rejected: '+receipt['outcome']+'; '+receipt['status'])
    sys.stdout.buffer.write(output)


if __name__ == '__main__':
    main()
