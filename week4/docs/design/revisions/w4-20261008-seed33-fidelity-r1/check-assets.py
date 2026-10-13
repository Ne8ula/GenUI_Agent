"""Verify retained source/runtime hashes and compose a NON-APP asset diagnostic."""
import hashlib
import json
from pathlib import Path
from PIL import Image

HERE=Path(__file__).resolve().parent
WEEK4=HERE.parents[3]
ASSETS=WEEK4/'app/public/assets/seed33'
man=json.loads((ASSETS/'manifest.json').read_text(encoding='utf-8'))
checks=[]
for key in ('background','figure','foreground','tiles'):
    entry=man[key]; path=ASSETS/entry['file']; img=Image.open(path)
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],key+' hash'
    assert list(img.size)==entry['size'],key+' dimensions'
    checks.append(key+' hash/dimensions passed')
w,h=man['background']['size']
for r in man['tiles']['regions']:
    x0,y0,x1,y1=r['sourceBoxPx']
    assert 0<=x0<x1<=w and 0<=y0<y1<=h,r['id']
    expected=[x0/w,y0/h,(x1-x0)/w,(y1-y0)/h]
    assert max(abs(a-b) for a,b in zip(r['rect'],expected))<1e-9,r['id']
checks.append(f"{len(man['tiles']['regions'])} tile bounds/normalizations passed")
source=WEEK4.parent/man['sourceStill']['path']
assert hashlib.sha256(source.read_bytes()).hexdigest()==man['sourceStill']['sha256']
checks.append('Original selected source hash unchanged')
base=Image.open(ASSETS/'background.png').convert('RGBA')
figure=Image.open(ASSETS/'figure-woman.png').convert('RGBA')
x0,y0,x1,y1=man['figure']['cropBoxInBackgroundPx']
assert figure.size==(x1-x0,y1-y0)
base.alpha_composite(figure,(x0,y0))
base=Image.alpha_composite(base,Image.open(ASSETS/'foreground.png').convert('RGBA'))
base=Image.alpha_composite(base,Image.open(ASSETS/'tiles.png').convert('RGBA'))
out=HERE/'implementation/asset-inspection'
out.mkdir(parents=True,exist_ok=True)
destination=out/'source-layer-composite-not-app.png'
if destination.exists(): raise SystemExit('Use a new inspection output; do not overwrite evidence.')
base.convert('RGB').save(destination)
(out/'checks.json').write_text(json.dumps({'checks':checks,'diagnostic':'CPU composition of runtime layers in source pose; NOT an app screenshot, not motion or runtime validation'},indent=2)+'\n',encoding='utf-8')
print('\n'.join(checks))
