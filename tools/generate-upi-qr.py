"""Generate the static payment QR locally; no payment data leaves this machine."""
from pathlib import Path
from urllib.parse import urlencode, quote
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'qr'))
import qrcode

UPI_ID = 'srinathcse10-2@okicici'
PAYEE_NAME = 'Srinath Santhi'
PAYMENT_URI = 'upi://pay?' + urlencode({'pa': UPI_ID, 'pn': PAYEE_NAME, 'cu': 'INR'}, quote_via=quote)

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
qr.add_data(PAYMENT_URI)
qr.make(fit=True)
matrix = qr.get_matrix()
scale = 8
size = len(matrix) * scale
# Encode the library's QR matrix as a lossless 8-bit grayscale PNG.
rows = bytearray()
for row in matrix:
    pixels = bytes(0 if cell else 255 for cell in row for _ in range(scale))
    for _ in range(scale):
        rows.extend(b'\x00' + pixels)

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('!IIBBBBB', size, size, 8, 0, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(bytes(rows), 9))
png += chunk(b'IEND', b'')
output = ROOT / 'SKTS-netlify' / 'assets' / 'upi-payment-qr.png'
output.write_bytes(png)
print(f'Generated {size} x {size} QR: {output}')
print(PAYMENT_URI)
