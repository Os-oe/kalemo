#!/usr/bin/env python3
"""DoodleNet-Gewichte float32 → float16 (tfjs-Quantisierung, 2,2 MB → 1,1 MB). Idempotent.
Aufruf: python3 tools/quantize-f16.py   (danach Genauigkeits-Gate erneut: python3 tools/accuracy.py)"""
import json, os, struct
from array import array

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'models/v1/doodlenet')
mj = json.load(open(os.path.join(D, 'model.json')))
man = mj['weightsManifest'][0]
if any(w.get('quantization') for w in man['weights']):
    print('bereits quantisiert'); raise SystemExit
src = open(os.path.join(D, man['paths'][0]), 'rb').read()
f32 = array('f'); f32.frombytes(src)
assert f32.itemsize == 4


def half(v):
    return struct.unpack('<H', struct.pack('<e', max(-65504.0, min(65504.0, v))))[0]


out = array('H', (half(v) for v in f32))
for w in man['weights']:
    w['quantization'] = {'dtype': 'float16', 'original_dtype': 'float32'}
man['paths'] = ['group1-shard1of1.bin']
open(os.path.join(D, 'group1-shard1of1.bin'), 'wb').write(out.tobytes())
json.dump(mj, open(os.path.join(D, 'model.json'), 'w'))
print('float16:', len(src), '→', len(out.tobytes()), 'Bytes')
