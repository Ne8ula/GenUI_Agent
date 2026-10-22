import unittest
import base64
import hashlib
import io
import zipfile
from unittest.mock import patch
import numpy as np
from prediction_fields import pack, unpack


class NumericalFieldsTests(unittest.TestCase):
    def setUp(self):
        shape = (5, 518, 518)
        self.prediction = {"depth": np.ones(shape), "confidence": np.ones(shape)*2,
                           "rgb": np.zeros((*shape, 3)),
                           "image_valid": np.ones(shape, bool), "valid": np.ones(shape, bool)}
        self.ids = ["p"+str(i) for i in range(5)]

    def test_roundtrip_preserves_predictions_and_masks(self):
        self.prediction["valid"][0, 10:20] = False
        values = unpack(pack(self.prediction, self.ids))
        self.assertEqual(values["depth"].dtype, np.float32)
        self.assertTrue((values["depth"] == 1).all())
        self.assertFalse(values["selected_valid"][0, 10:20].any())

    def test_hash_shape_and_validity_rejection(self):
        record = pack(self.prediction, self.ids)
        for mutation in ({"sha256": "0"*64}, {"shape": [5, 1, 1]}, {"bytes": 1}):
            with self.assertRaises(ValueError):
                unpack({**record, **mutation})
        self.prediction["image_valid"][:] = 0
        with self.assertRaises(ValueError):
            unpack(pack(self.prediction, self.ids))

    def test_forged_array_header_rejected_before_numpy_allocation(self):
        record = pack(self.prediction, self.ids)
        original = base64.b64decode(record["data_base64"])
        output = io.BytesIO()
        header = io.BytesIO()
        np.lib.format.write_array_header_1_0(header, {
            "descr": "<f4", "fortran_order": False,
            "shape": (5, 518, 10**12),
        })
        with zipfile.ZipFile(io.BytesIO(original)) as source:
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
                for entry in source.infolist():
                    target.writestr(entry.filename, header.getvalue()
                                    if entry.filename == "depth.npy" else source.read(entry))
        data = output.getvalue()
        record.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                      data_base64=base64.b64encode(data).decode())
        with patch("prediction_fields.np.load", side_effect=AssertionError("must not allocate")):
            with self.assertRaisesRegex(ValueError, "header"):
                unpack(record)


if __name__ == "__main__":
    unittest.main()
