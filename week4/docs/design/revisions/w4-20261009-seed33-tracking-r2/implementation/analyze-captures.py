"""Reproducible sampling/comparison of actual browser captures. No renderer synthesis."""
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw

base = Path(__file__).resolve().parent
out = base / 'after' / 'candidate-2'
def sheet(items, dest, width=480, columns=3):
    height = round(items[0][1].height * width / items[0][1].width)
    image = Image.new('RGB', (width * columns, ((len(items)+columns-1)//columns)*(height+26)), '#202020')
    draw = ImageDraw.Draw(image)
    for i, (label, frame) in enumerate(items):
        x, y = i % columns * width, i // columns * (height+26)
        draw.text((x+6,y+6), label, fill='white')
        image.paste(frame.resize((width,height)), (x,y+26))
    image.save(dest)

def sample(movie, times):
    cap = cv2.VideoCapture(str(movie))
    result = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t*1000)
        ok, frame = cap.read()
        if not ok: raise RuntimeError(f'Cannot decode {movie} at {t}s')
        result.append((f'host {12+t:.2f}s | clip {t:.2f}s', Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))))
    cap.release()
    return result

sheet(sample(out/'webgl2-post-formation-stepped-11s.mp4', [0,2,4,6,8,10]),out/'motion-full-samples.jpg',640)
sheet(sample(out/'webgl2-post-formation-closeup-11s.mp4', [5+i/5 for i in range(12)]),out/'motion-closeup-samples.jpg',400,4)
items=[]
for label, file in [('Before: rejected effect',base/'before/matching/webgl2-formed-17000.png'),('After: candidate 2',out/'webgl2-formed-17000.png')]:
    items.append((label,Image.open(file).convert('RGB')))
sheet(items,out/'before-after-17000.jpg',960,2)

movie=out/'webgl2-post-formation-stepped-11s.mp4'
cap=cv2.VideoCapture(str(movie)); fps=cap.get(cv2.CAP_PROP_FPS); expected=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
frames=0; previous=None; mean_changes=[]; broad_changes=[]
while True:
    ok, bgr=cap.read()
    if not ok: break
    gray=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    if previous is not None:
        delta=np.abs(gray-previous)
        mean_changes.append(float(delta.mean())); broad_changes.append(float(np.mean(delta>0.25)))
    previous=gray; frames+=1
cap.release()
report={'recording':{'decodedFrames':frames,'reportedFrames':expected,'fps':fps,'durationSeconds':frames/fps,'allFramesDecoded':frames==expected,'meanAbsoluteLumaChange':{'mean':float(np.mean(mean_changes)),'max':max(mean_changes)},'pixelFractionChangingByOverQuarterLuma':{'mean':float(np.mean(broad_changes)),'max':max(broad_changes)},'limitation':'Decoded video frame differences, not a photosensitivity certification or performance benchmark.'},'backendComparisons':[],'preservation':[]}
for name in ['formed-17000','formed-17200','formed-17500','formed-17800','reduced-17000','hidden-17000']:
    a=np.asarray(Image.open(out/f'webgl2-{name}.png').convert('RGB'),dtype=np.int16); b=np.asarray(Image.open(out/f'canvas2d-{name}.png').convert('RGB'),dtype=np.int16)
    delta=np.abs(a-b)
    report['backendComparisons'].append({'fixture':name,'identical':bool(np.array_equal(a,b)),'meanAbsoluteChannelDifference_0_255':float(delta.mean()),'fractionPixelsDifferingOver16':float(np.mean(delta.max(axis=2)>16))})
for f in (base/'before/construction').glob('*build-*pct.png'):
    other=base/'after/construction'/f.name
    if other.exists() and '100pct' not in f.name:
        a=np.asarray(Image.open(f)); b=np.asarray(Image.open(other))
        report['preservation'].append({'file':f.name,'identical':bool(np.array_equal(a,b))})
(out/'pixel-analysis.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))
