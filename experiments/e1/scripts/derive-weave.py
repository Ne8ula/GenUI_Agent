"""Historical extraction utility for the rejected frame-playback experiment.
Not part of the procedural renderer or normal build. Outputs remain quarantined.
No generation, network calls, background reconstruction or video retiming.
"""
from pathlib import Path
import json, subprocess, hashlib
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy.ndimage import binary_fill_holes

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'quarantine/weave-derived'
OUTPUT.mkdir(parents=True, exist_ok=True)

# Remove generated words/numbers, not callout lines/brackets. Live React text is
# bound to the validated fixture and never interpolates 22 -> 18 -> 16 degrees.
LABELS = {
    'sun': [(0.201,.133,.283,.163),(.649,.142,.721,.184),(.674,.362,.769,.433),(.461,.625,.550,.653)],
    'rain':[(.180,.078,.276,.108),(.636,.103,.708,.140),(.694,.235,.780,.290)],
}

def matte(rgb, eye=False, labels=None):
    values=np.asarray(rgb).astype(np.int16)
    r,g,b=values[:,:,0],values[:,:,1],values[:,:,2]
    red=(r-np.maximum(g,b)>14)&(r>55)&(r>np.maximum(g,b)*1.28)&((g-b)<(r-g)*.20+2)
    # The wallpaper/taskbar are not EVA; only retain red foreground above it.
    h,w=red.shape
    water=np.zeros_like(red);water[int(h*.67):int(h*.95),int(w*.25):int(w*.77)]=True
    red |= water & (r-np.maximum(g,b)>6) & ((g-b)<(r-g)*.20+2)
    red[int(h*.952):,:]=False
    alpha=Image.fromarray((red*255).astype(np.uint8))
    if eye:
        # Preserve black iris/lid/socket enclosed by the red original eye rather
        # than turning its pupil into a transparent hole. Work only on the eye.
        closed=alpha.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))
        filled=binary_fill_holes(np.asarray(closed)>0)
        target=np.asarray(alpha).copy()
        pigment=(np.maximum.reduce([r,g,b])<45)|(r>np.maximum(g,b)*1.1)
        target=np.maximum(target,(filled & pigment).astype(np.uint8)*255)
        alpha=Image.fromarray(target)
    rgba=rgb.convert('RGBA');rgba.putalpha(alpha)
    if labels:
        a=rgba.getchannel('A');draw=ImageDraw.Draw(a)
        for x0,y0,x1,y1 in labels:draw.rectangle((int(x0*w),int(y0*h),int(x1*w),int(y1*h)),fill=0)
        rgba.putalpha(a)
    pixels=np.asarray(rgba).copy()
    pixels[pixels[:,:,3]==0,:3]=0
    return Image.fromarray(pixels)

sources=[]
for kind,pattern in [('sun','*K1*.png'),('rain','*K2*.png')]:
    file=next((ROOT/'weave/keyframes').glob(pattern));image=Image.open(file).convert('RGB')
    result=matte(image,labels=LABELS[kind]);result.save(OUTPUT/f'{kind}.png',optimize=True)
    sources.append({'path':str(file.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})

sequences={}
for name,pattern in [('v1','*V1*.mp4'),('v2','*V2*.mp4'),('v3','*V3*.mp4')]:
    file=next((ROOT/'weave/animations').glob(pattern));target=OUTPUT/name;target.mkdir(exist_ok=True)
    meta=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_streams','-of','json',str(file)]))['streams'][0]
    w,h=meta['width'],meta['height'];fps=24
    pipe=subprocess.Popen(['ffmpeg','-v','error','-i',str(file),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
    count=0
    while True:
        data=pipe.stdout.read(w*h*3)
        if len(data)!=w*h*3:break
        t=count/fps
        image=Image.frombytes('RGB',(w,h),data)
        eye=(name=='v1' and t<2.5) or (name=='v3' and t>=2.5)
        labels=None
        if name=='v1' and t>3.6:labels=LABELS['sun']
        elif name=='v2':
            u=min(1,t/1.5)
            labels=[tuple(a*(1-u)+b*u for a,b in zip(start,end)) for start,end in zip(LABELS['sun'][:3],LABELS['rain'])]
            if t<1.0:labels.append(LABELS['sun'][3])
        elif name=='v3' and t<.8:labels=LABELS['rain']
        matte(image,eye=eye,labels=labels).save(target/f'{count:04d}.png',compress_level=3)
        count+=1
    if pipe.wait()!=0:raise RuntimeError('FFmpeg extraction failed')
    sequences[name]={'width':w,'height':h,'fps':fps,'frames':count,'durationMs':count/fps*1000,'pattern':f'{name}/{{frame:04}}.png'}
    sources.append({'path':str(file.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    print(name,count,flush=True)
manifest={'version':1,'kind':'source-derived-foreground','sequences':sequences,'keyframes':{'sun':'sun.png','rain':'rain.png'},'sources':sources,'limitations':['RGB values retained from original pixels selected by a red chroma matte; these opaque exports contain no source alpha.','Generated factual text is removed for immediate fixture-bound native labels.','Background, camera drift and wallpaper animation are deliberately excluded.']}
(OUTPUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
