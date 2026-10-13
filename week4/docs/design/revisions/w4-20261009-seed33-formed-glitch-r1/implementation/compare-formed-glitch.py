# Compare actual before/after screenshots; no synthetic application frames.
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import json
import sys

rev = Path(sys.argv[1])
manifest = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
before = rev/'implementation/before/formed'
candidate = sys.argv[3] if len(sys.argv) > 3 else 'formed'
after = rev/'implementation/after'/candidate
checks = json.loads((after/'checks.json').read_text(encoding='utf-8'))
results = []
strongest = None
for entry in checks['captures']:
    name = entry['file']
    a = Image.open(before/name).convert('RGB')
    b = Image.open(after/name).convert('RGB')
    diff = ImageChops.difference(a,b)
    channels = diff.split()
    any_diff = ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]).point(lambda v: 255 if v else 0)
    count = any_diff.histogram()[255]
    w,h = a.size
    aspect = manifest['background']['size'][0]/manifest['background']['size'][1]
    fw = min(w,h*aspect); fh = fw/aspect
    fx=(w-fw)/2; fy=(h-fh)/2
    mask = Image.new('L',a.size,0)
    draw=ImageDraw.Draw(mask)
    for tile in manifest['tiles']['regions']:
        x,y,tw,th = tile['rect']
        # Union of declared anchors with 24px allowance for existing drift plus bounded glitches.
        draw.rectangle((fx+x*fw-24,fy+y*fh-24,fx+(x+tw)*fw+24,fy+(y+th)*fh+24),fill=255)
    outside=ImageChops.multiply(any_diff,ImageChops.invert(mask)).histogram()[255]
    result={'file':name,'backend':entry['backend'],'timeMs':entry['t'],'mode':entry['mode'],'changedPixels':count,'outsideOverlayBoundsChangedPixels':outside,'identical':count==0}
    results.append(result)
    if entry['mode']=='normal' and entry['backend']=='webgl2' and (strongest is None or count>strongest['changedPixels']):strongest=result
normal=[x for x in results if x['mode']=='normal']
special=[x for x in results if x['mode']!='normal']
report={'mask':'Union of manifest tile rectangles expanded by24 screenshot pixels for existing drift and bounded glitches; not an exact per-frame silhouette','results':results,'outsideTilesUnchanged':all(x['outsideOverlayBoundsChangedPixels']==0 for x in results),'reducedAndHiddenUnchanged':all(x['identical'] for x in special),'normalChangedFrames':sum(not x['identical'] for x in normal),'normalFrames':len(normal),'representative':strongest}
report['ok']=report['outsideTilesUnchanged'] and report['reducedAndHiddenUnchanged'] and report['normalChangedFrames']>0
with (after/'pixel-comparisons.json').open('x',encoding='utf-8') as f:json.dump(report,f,indent=2);f.write('\n')
if strongest:
    sheet=Image.new('RGB',(1920,1120),'#211610'); draw=ImageDraw.Draw(sheet)
    for col,folder in enumerate([before,after]):
        im=Image.open(folder/strongest['file']).convert('RGB')
        thumb=im.resize((960,540));sheet.paste(thumb,(col*960,40))
        crop=im.crop((1280,0,1920,500));crop.thumbnail((960,500));sheet.paste(crop,(col*960,610))
        draw.text((col*960+12,12),f"{'Before' if col==0 else 'After'} | {strongest['timeMs']}ms | strongest captured glitch state",fill='#f4e4cf')
    sheet.save(rev/'implementation'/f'compare-{candidate}-glitch.png')
print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2))
if not report['ok']:sys.exit(1)
