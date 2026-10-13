"""Promote existing chair pixels to the foreground for the new away route; no invented chair texture."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib
root=Path(__file__).resolve().parents[3]
a=root/'week4/app/public/assets/seed33'
out=a/'foreground-away.png'; manifest=a/'manifest-walk-away-v2.json'
if out.exists() or manifest.exists(): raise RuntimeError('Refuse to overwrite retained occlusion candidate')
bg=Image.open(a/'background.png').convert('RGBA'); fg=Image.open(a/'foreground.png').convert('RGBA')
# Authored outer chair-back silhouette, traced from current source pixels. The table/cup retain priority.
poly=[(0,.503),(.040,.492),(.087,.500),(.131,.535),(.168,.596),(.195,.682),(.214,.785),(.220,.870),(.204,.945),(0,1)]
mask=Image.new('L',bg.size);ImageDraw.Draw(mask).polygon([(round(x*bg.width),round(y*bg.height)) for x,y in poly],fill=255)
bg.putalpha(mask); bg.alpha_composite(fg); bg.save(out)
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((a/'manifest-walk-away.json').read_text())
m['settledForeground']={'file':out.name,'sha256':hashfile(out),'size':list(bg.size),'note':'Original chair pixels promoted from background, original foreground composited above them; settled path only, construction still uses the unchanged original foreground.'}
manifest.write_text(json.dumps(m,indent=2)+'\n',encoding='utf8')
record={'sourceBackgroundSha256':hashfile(a/'background.png'),'sourceForegroundSha256':hashfile(a/'foreground.png'),'output':str(out.relative_to(root)),'sha256':hashfile(out),'chairOcclusionPolygonNorm':poly,'limitation':'Authored opaque outer chair-back matte, not per-rattan-strand depth. Original table/cup alpha stays above chair.'}
(root/'week4/docs/design/revisions/w4-20261009-seed33-walk-away-r3/runtime-assets-occlusion.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print('Created',out.name,'and',manifest.name)
