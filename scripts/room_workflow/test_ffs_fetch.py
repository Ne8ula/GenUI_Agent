import io
import unittest
from unittest.mock import patch
import zipfile

from ffs_fetch import RangeFile, member_range, select, stream_member


def fixture():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("th/IPC/IPC_ENG/IPC_Th_0001.xlsx", b"evidence" * 100)
        archive.writestr("th/IPC/IPC_ENG/._IPC_Th_0001.xlsx", b"mac")
        archive.writestr("th/scan/th_0001_coul.las", b"x" * 5000)
    return buffer.getvalue()


class RangeFileTests(unittest.TestCase):
    def test_reads_selected_member_through_ranges(self):
        data = fixture()
        remote = RangeFile("https://example.test/a.zip", len(data), budget=10**6)
        with patch("ffs_fetch.urllib.request.urlopen", side_effect=AssertionError("no network")), \
                patch.object(RangeFile, "_fetch", lambda self, s, e: data[s:e]):
            with zipfile.ZipFile(remote) as archive:
                chosen = select(archive.infolist(), ["*/IPC/IPC_ENG/IPC_*.xlsx"], 10**4, 10**4)
                self.assertEqual([i.filename for i in chosen], ["th/IPC/IPC_ENG/IPC_Th_0001.xlsx"])
                self.assertEqual(archive.read(chosen[0]), b"evidence" * 100)

    def test_streams_one_stored_member_and_checks_crc(self):
        data = fixture()
        remote = RangeFile("https://example.test/a.zip", len(data), budget=10**6)
        with patch.object(RangeFile, "_fetch", lambda self, s, e: data[s:e]), zipfile.ZipFile(remote) as archive:
            info = archive.getinfo("th/scan/th_0001_coul.las")
            start, end = member_range(remote, info)
        self.assertEqual(data[start:end], b"x" * 5000)

        def response(crc_ok):
            body = io.BytesIO(data[start:end] if crc_ok else b"y" * 5000)
            body.status = 206
            body.headers = {"Content-Range": f"bytes {start}-{end - 1}/{len(data)}"}
            return body
        for crc_ok in (True, False):
            output = io.BytesIO()
            fake = response(crc_ok)
            with patch("ffs_fetch.urllib.request.urlopen", return_value=type("R", (), {
                    "__enter__": lambda s: fake, "__exit__": lambda s, *a: None})()):
                if crc_ok:
                    self.assertEqual(stream_member("https://example.test/a.zip", len(data), start, end, info.CRC, output, chunk=999), 5000)
                    self.assertEqual(output.getvalue(), b"x" * 5000)
                else:
                    with self.assertRaises(ValueError):
                        stream_member("https://example.test/a.zip", len(data), start, end, info.CRC, output)

    def test_budget_and_size_caps_fail_closed(self):
        data = fixture()
        with patch("ffs_fetch.urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.status = 206
            with self.assertRaises(ValueError):
                RangeFile("https://example.test/a.zip", len(data), budget=10).read(64)
            urlopen.assert_not_called()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            with self.assertRaises(ValueError):
                select(archive.infolist(), ["*.las"], 1000, 10**6)


if __name__ == "__main__":
    unittest.main()
