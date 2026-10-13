from pathlib import Path
import cv2,json
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent
video=root/'references/videos/vid-01-away-walk-tile-breakup.mp4'
cap=cv2.VideoCapture(str(video)); fps=cap.get(5); count=int(cap.get(7)); width=int(cap.get(3)); height=int(cap.get(4))
def frame(t):
 cap.set(cv2.CAP_PROP_POS_MSEC,t*1000); ok,bgr=cap.read()
 if not ok: raise RuntimeError(f'Cannot read {t}s')
 return Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB))
def sheet(items,dest,w=400,cols=4):
 h=round(items[0][1].height*w/items[0][1].width); out=Image.new('RGB',(cols*w,((len(items)+cols-1)//cols)*(h+24)),'#222')
 d=ImageDraw.Draw(out)
 for i,(name,img) in enumerate(items):
  x,y=i%cols*w,i//cols*(h+24); d.text((x+5,y+5),name,fill='white');out.paste(img.resize((w,h)),(x,y+24))
 out.save(dest)
sheet([(f'{i/2:.1f}s',frame(i/2)) for i in range(20)],root/'references/videos/temporal-overview.jpg',400)
sheet([(f'{1+i/10:.1f}s',frame(1+i/10).crop((0,200,650,680))) for i in range(20)],root/'references/videos/gait-detail.jpg',400)
frame(2).save(root/'references/videos/frame-02s.png');frame(8).save(root/'references/videos/frame-08s.png')
im=Image.open(root/'references/images/img-01-tile-corruption-away.png')
sheet([('Image 01: geometry/texture reference',im),('Video 01: motion reference at2s',frame(2))],root/'references/contact-sheet.png',700,2)
(root/'references/video-metadata.json').write_text(json.dumps({'fps':fps,'frames':count,'durationSeconds':count/fps,'width':width,'height':height,'inspection':'500ms overview and100ms gait detail; not full-speed playback'},indent=2)+'\n')
cap.release()
