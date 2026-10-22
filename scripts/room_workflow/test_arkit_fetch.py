from email.message import Message
import io
from unittest.mock import patch
import tempfile
import unittest
from pathlib import Path
import zipfile

from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
import urllib.error

from arkit_fetch import download, extract


class DownloadTests(unittest.TestCase):
    def test_frozen_transfer_rejects_ambiguous_or_transformed_headers(self):
        for key, value in [('Content-Length', '7'), ('ETag', '"fixture"'),
                           ('Content-Encoding', 'gzip'), ('Transfer-Encoding', 'chunked')]:
            with self.subTest(header=key), tempfile.TemporaryDirectory() as folder:
                response = io.BytesIO(b'fixture')
                response.status = 200
                response.geturl = lambda: 'https://example.test/fixture'
                response.headers = Message()
                response.headers['Content-Length'] = '7'
                response.headers['ETag'] = '"fixture"'
                response.headers[key] = value
                target = Path(folder)/'source'
                with patch('arkit_fetch._opener.open', return_value=response), self.assertRaises(ValueError):
                    download('https://example.test/fixture', target, 7,
                             expected={'bytes': 7, 'etag': '"fixture"'})
                self.assertFalse(target.exists())
                self.assertFalse(target.with_suffix('.part').exists())

    def test_frozen_transfer_never_requests_more_than_remaining_body_budget(self):
        class BoundedResponse(io.BytesIO):
            def read(self, size=-1):
                if not 0 < size <= 7-self.tell():
                    raise AssertionError('Read exceeds frozen remaining budget')
                return super().read(size)
        response = BoundedResponse(b'fixture')
        response.status = 200
        response.geturl = lambda: 'https://example.test/fixture'
        response.headers = Message()
        response.headers['Content-Length'] = '7'
        response.headers['ETag'] = '"fixture"'
        with tempfile.TemporaryDirectory() as folder, patch('arkit_fetch._opener.open', return_value=response):
            target = Path(folder)/'source'
            saved = download('https://example.test/fixture', target, 7,
                             expected={'bytes': 7, 'etag': '"fixture"'})
            self.assertEqual(target.read_bytes(), b'fixture')
            self.assertEqual(saved['bytes'], 7)

    def test_redirect_is_rejected_before_contacting_destination(self):
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                requests.append(self.path)
                if self.path == '/start':
                    self.send_response(302)
                    self.send_header('Location', '/other')
                    self.end_headers()
                else:
                    self.send_response(200)
                    self.send_header('Content-Length', '7')
                    self.end_headers()
                    self.wfile.write(b'fixture')
        server = HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as folder:
                target = Path(folder)/'source'
                with self.assertRaises((ValueError, urllib.error.HTTPError)):
                    download(f'http://127.0.0.1:{server.server_port}/start', target, 7)
                self.assertEqual(requests, ['/start'])
                self.assertFalse(target.exists())
                self.assertFalse(target.with_suffix('.part').exists())
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()


class ExtractionTests(unittest.TestCase):
    def attempt(self, names):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        archive = root / "capture.zip"
        with zipfile.ZipFile(archive, "w") as handle:
            for name in names:
                handle.writestr(name, b"fixture")
        return archive, root / "output"

    def test_nested_asset(self):
        archive, output = self.attempt(["color/frame.png"])
        extract(archive, output)
        self.assertEqual((output / "color/frame.png").read_bytes(), b"fixture")
        with self.assertRaises(ValueError):
            extract(archive, output)

    def test_reject_unsafe_before_writing(self):
        for name in ("../escape", "/absolute", "C:/drive"):
            with self.subTest(name=name):
                archive, output = self.attempt(["color/frame.png", name])
                with self.assertRaises(ValueError):
                    extract(archive, output)
                self.assertFalse(output.exists())

    def test_backslash_member(self):
        archive, output = self.attempt(["color/escape"])
        # Windows ZipInfo normalizes separators on writing; simulate an external ZIP.
        archive.write_bytes(archive.read_bytes().replace(b"color/escape", b"color\\escape"))
        with self.assertRaises(ValueError):
            extract(archive, output)

    def test_case_collision(self):
        archive, output = self.attempt(["Color/frame.png", "color/FRAME.png"])
        with self.assertRaises(ValueError):
            extract(archive, output)


if __name__ == "__main__":
    unittest.main()
