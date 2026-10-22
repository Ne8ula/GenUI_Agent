import io
import zipfile
from unittest.mock import patch
from vga_rgb_range import directory
import binascii
import struct
import unittest
import zlib
from vga_rgb_range import decode_payload, member, RangeSource, MEMBER_CAP, TOTAL_CAP, ARCHIVE_BYTES, URL, ETAG


class Source:
    def __init__(self,data):
        self.data=data
    def read(self,offset,length):
        return self.data[offset:offset+length]


class VGARangeTests(unittest.TestCase):
    def fixture(self):
        data=b"bounded RGB fixture"*50
        compressor=zlib.compressobj(wbits=-15)
        payload=compressor.compress(data)+compressor.flush()
        entry=dict(name="vga_wide/42445021_48894.304.png",flags=0,method=8,
                   crc32=binascii.crc32(data)&0xffffffff,compressed_bytes=len(payload),
                   expanded_bytes=len(data),header_offset=0)
        name=entry["name"].encode()
        header=struct.pack("<4s5H3L2H",b"PK\x03\x04",20,0,8,0,0,entry["crc32"],len(payload),len(data),len(name),0)
        raw=header+name+payload;entry["next_header_offset"]=len(raw)
        return data,payload,entry,raw

    def test_range_source_preserves_old_default_and_rejects_foreign_members(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('vga_wide/45261631_10000.000.png', b'fixture')
        data = buffer.getvalue()
        descriptor = {'video_id': '45261631', 'split': 'Validation',
                      'url': URL.replace('42445021', '45261631'), 'bytes': len(data), 'etag': '"new"'}
        class Response(io.BytesIO):
            status = 200
            def __init__(self, request):
                super().__init__(b'')
                self.url = request.full_url
                old = self.url == URL
                self.headers = {'Content-Length': str(ARCHIVE_BYTES if old else len(data)),
                                'ETag': ETAG if old else '"new"'}
            def geturl(self): return self.url
        with patch('urllib.request.OpenerDirector.open', side_effect=lambda r, **k: Response(r)):
            old, new = RangeSource(), RangeSource(descriptor)
            self.assertEqual(old.archive_bytes, ARCHIVE_BYTES)
            self.assertEqual(new.archive_bytes, len(data))
            self.assertEqual(old.url, URL)
            self.assertEqual(new.url, descriptor['url'])
            descriptor['url'] = 'https://example.org/replaced.zip'
            self.assertNotEqual(new.url, descriptor['url'])
            with self.assertRaises(ValueError):
                RangeSource(descriptor)
        new.read = lambda offset, length: data[offset:offset+length]
        entries, _ = directory(new)
        self.assertEqual(list(entries), ['vga_wide/45261631_10000.000.png'])
        new.read = lambda offset, length: data.replace(b'45261631', b'42445021')[offset:offset+length]
        with self.assertRaises(ValueError):
            directory(new)

    def test_validated_member(self):
        data,_,entry,raw=self.fixture()
        self.assertEqual(member(Source(raw),entry),data)

    def test_crc_size_bomb_and_trailing_stream_rejected(self):
        _,payload,entry,_=self.fixture()
        for changed in [dict(entry,crc32=0),dict(entry,expanded_bytes=1),dict(entry,expanded_bytes=MEMBER_CAP+1)]:
            with self.assertRaises(ValueError):
                decode_payload(payload,changed)
        with self.assertRaises(ValueError):
            decode_payload(payload+b"x",dict(entry,compressed_bytes=len(payload)+1))

    def test_local_header_mismatch_or_overlap_rejected(self):
        _,_,entry,raw=self.fixture()
        for changed in [dict(entry,crc32=0),dict(entry,next_header_offset=len(raw)-1)]:
            with self.assertRaises(ValueError):
                member(Source(raw),changed)
        altered=bytearray(raw);altered[30]=ord("x")
        with self.assertRaises(ValueError):
            member(Source(altered),entry)

    def test_ignored_range_rejected_before_body_read(self):
        class Response:
            status=200
            headers={}
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def geturl(self): return URL
            def read(self,*args): raise AssertionError("Full archive body must not be read")
        class Opener:
            def open(self,*args,**kwargs): return Response()
        source=RangeSource.__new__(RangeSource);source.bytes=0;source.opener=Opener()
        with self.assertRaises(ValueError):
            source.read(0,30)

    def test_network_and_archive_bounds_before_request(self):
        source=RangeSource.__new__(RangeSource);source.bytes=TOTAL_CAP-10
        for offset,length in [(0,11),(-1,1),(ARCHIVE_BYTES,1),(0,0)]:
            with self.assertRaises(ValueError):
                source.read(offset,length)

    def test_mismatched_content_range_or_etag_rejected_without_read(self):
        class Response:
            status=206
            def __init__(self,headers): self.headers=headers
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def geturl(self): return URL
            def read(self,*args): raise AssertionError("Invalid range response must not be read")
        class Opener:
            def __init__(self,headers): self.headers=headers
            def open(self,*args,**kwargs): return Response(self.headers)
        correct={"Content-Range":f"bytes 0-29/{ARCHIVE_BYTES}","Content-Length":"30","ETag":ETAG}
        for changed in [dict(correct,ETag="changed"),dict(correct,**{"Content-Range":"bytes 1-30/999"})]:
            source=RangeSource.__new__(RangeSource);source.bytes=0;source.opener=Opener(changed)
            with self.assertRaises(ValueError):
                source.read(0,30)


if __name__=="__main__":
    unittest.main()
