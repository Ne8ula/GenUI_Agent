"""Extract a retained, manually traced rear figure from this pass's inspected Weave still.
No reference video frames are used. Old figure and manifest files are never overwritten.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib,json

root=Path(__file__).resolve().parents[3]
revision=root/'week4/docs/design/revisions/w4-20261009-seed33-walk-away-r3'
source=revision/'references/images/img-01-tile-corruption-away.png'
assets=root/'week4/app/public/assets/seed33'
figure=assets/'figure-away.png'
manifest=assets/'manifest-walk-away.json'
if figure.exists() or manifest.exists(): raise RuntimeError('Refuse to overwrite retained asset derivative')
im=Image.open(source).convert('RGB')
box=(860,520,1130,1190)
crop=im.crop(box)
# Outline traced against the inspected2x crop, in its540x1340 coordinate system.
outline=[(279,73),(335,85),(385,125),(383,159),(364,197),(365,218),(402,256),(408,342),(413,399),(425,460),(443,530),(448,645),(443,747),(445,955),(398,960),(396,1129),(369,1178),(382,1200),(414,1221),(409,1248),(365,1251),(340,1238),(308,1200),(316,1162),(320,1050),(317,959),(289,961),(261,1019),(223,1118),(198,1152),(183,1170),(181,1235),(171,1299),(142,1292),(97,1250),(89,1206),(96,1151),(102,1122),(132,1099),(142,1007),(170,956),(115,951),(91,944),(100,887),(111,821),(132,694),(142,602),(109,565),(86,530),(70,485),(77,447),(111,350),(141,276),(193,250),(205,223),(193,185),(199,139),(221,102),(250,82)]
mask=Image.new('L',(540,1340)); ImageDraw.Draw(mask).polygon(outline,fill=255)
mask=mask.resize(crop.size,Image.Resampling.LANCZOS)
rgba=crop.convert('RGBA');rgba.putalpha(mask);rgba.save(figure)
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
data=json.loads((assets/'manifest.json').read_text())
data['figure']={**data['figure'],'file':figure.name,'size':list(rgba.size),'sha256':hashfile(figure),'cropBoxPx':list(box),'cropBoxInBackgroundFrac':[box[0]/im.width,box[1]/im.height,box[2]/im.width,box[3]/im.height],'sourceReference':'w4-20261009-seed33-walk-away-r3/image01','sourceSha256':hashfile(source),'matte':'Manual silhouette trace; script extract-away-figure.py; no animation frames'}
data['walkAwayRevision']={'id':'w4-20261009-seed33-walk-away-r3','modelId':'fal-ai/nano-banana-2/edit','predictionId':'b233ae7a-cca2-402b-b542-916f90b5437d','scope':'Figure-only static material for live articulated triangle mesh; environment/tile source bitmaps unchanged','rights':'Generated via Weave; provider terms apply, redistribution rights not independently verified. No third-party source animation used at runtime.'}
manifest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
record={'source':str(source.relative_to(root)),'sourceSha256':hashfile(source),'sourceCropBoxPx':box,'output':str(figure.relative_to(root)),'outputSha256':hashfile(figure),'size':rgba.size,'manifest':str(manifest.relative_to(root)),'animation':'Authored live joint/foot-contact geometry, not generated video playback','rights':data['walkAwayRevision']['rights']}
(revision/'runtime-assets.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print(json.dumps(record,indent=2))
