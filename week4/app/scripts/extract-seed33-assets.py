#!/usr/bin/env python3
"""Build local seed-33 layers from the owner's selected still, never video frames.

Owner authorization and limits: w4-20261008-seed33-fidelity-r1/REVIEW.md.
The polygon below is traced against img13 itself, NOT the rejected run4 model.
Hidden surfaces are texture-cloned approximations, not recovered geometry.
Pillow, NumPy and OpenCV are used offline; runtime has no image-processing dependency.
"""
from pathlib import Path
import hashlib
import json
import cv2
import numpy as np
from PIL import Image

APP = Path(__file__).resolve().parent.parent
ROOT = APP.parent.parent
SOURCE = ROOT / 'week4/docs/design/revisions/w4-20261008-paris-c-hybrid/references/images/img-13-bwa3c-seed33.png'
OUT = APP / 'public/assets/seed33'
# Source coordinates traced on the 2000 x 1116 inspection rendition of img13.
FIGURE = [(734,393),(719,394),(705,401),(699,411),(694,428),(693,444),(690,458),
 (678,466),(664,472),(658,484),(657,503),(654,522),(650,539),(648,557),(653,579),
 (661,591),(665,603),(666,627),(669,651),(668,683),(670,710),(674,724),
 (690,730),(699,727),(700,748),(706,769),(714,790),(719,810),(728,830),
 (738,838),(749,831),(752,816),(750,801),(746,782),(747,760),(746,743),
 (752,722),(768,727),(782,726),(788,714),(786,689),(786,665),(787,642),
 (788,619),(790,603),(796,589),(803,579),(806,563),(803,545),(798,530),
 (794,512),(793,494),(791,481),(784,473),(771,466),(767,452),(766,435),
 (759,419),(750,404),(741,397)]
# Independently living original tile regions. Their RGB stays the selected artwork;
# no rejected checkerboard patterns are generated over them. Small separated slots
# allow texture swaps/translation without moving architectural pixels as large plates.
TILES = [
 ('left-coral',(188,111,317,221),'left'),('left-dither',(317,0,399,221),'left'),
 ('left-cream',(205,330,311,440),'left'),
 ('right-tall-dither',(1471,133,1567,318),'right'),
 ('right-dither-top',(1567,111,1667,221),'right'),
 ('right-dot-cream',(1667,111,1772,221),'right'),
 ('right-dither-low',(1567,221,1667,331),'right'),
 ('right-coral',(1667,221,1772,331),'right'),
 ('right-dot-dark',(1772,221,1949,331),'right'),
 ('right-edge-cream',(1949,111,2000,221),'right'),
 ('right-honey',(1775,366,1877,476),'right'),
 ('right-small-honey',(1471,318,1543,365),'right'),
 ('right-scanlines',(1471,365,1567,414),'right'),
 ('right-sage',(1471,414,1543,447),'right'),
 ('right-mini-cream',(1471,447,1501,475),'right'),
 ('right-mini-grey',(1501,447,1543,475),'right'),
 ('right-mini-dots',(1543,447,1570,475),'right'),
 ('table-left-grey',(432,919,475,1002),'table'),
 ('table-left-dots',(476,838,600,931),'table'),
 ('table-cream-dots',(805,838,900,1026),'table'),
 ('table-dark-dither',(900,838,1001,1044),'table'),
 ('table-honey',(1001,877,1076,1044),'table'),
 ('table-dither',(1076,945,1132,1044),'table'),
 ('table-cream',(1132,945,1235,1026),'table'),
 ('table-middle-strip',(1132,1026,1235,1044),'table'),
 ('table-bottom',(1076,1044,1235,1116),'table'),
 ('table-right-coral',(1708,904,1819,983),'table'),
 ('table-right-glass',(1708,1001,1774,1116),'table'),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    original = Image.open(SOURCE).convert('RGB')
    ow, h = original.size
    w = round(h * 16 / 9)
    left = (ow - w) // 2
    source = np.array(original.crop((left,0,left+w,h)))
    def point(x,y): return (round(x*ow/2000-left),round(y*h/1116))
    def box(bounds):
        x0,y0 = point(*bounds[:2]); x1,y1 = point(*bounds[2:])
        return [max(0,x0),max(0,y0),min(w,x1),min(h,y1)]
    OUT.mkdir(parents=True,exist_ok=True)
    mask = np.zeros((h,w),np.uint8)
    cv2.fillPoly(mask,[np.array([point(x,y) for x,y in FIGURE],np.int32)],255)
    # Preserve the narrow luminous fringe, not neighbouring window columns.
    alpha = cv2.GaussianBlur(mask,(0,0),1.2)
    hole = cv2.dilate(mask,np.ones((27,27),np.uint8))
    # Repair the occluded facade as a plane, not a person-shaped fill.
    hole[:] = 0
    rx0,ry0,rx1,ry1 = box((638,391,820,858))
    hole[ry0:ry1,rx0:rx1] = 255
    clean = source.copy()
    sx0,_,sx1,_ = box((826,0,904,1116))
    street = np.median(source[:,sx0:sx1],axis=1)
    for x in range(rx0,rx1):
        xref = (x+left)*2000/ow
        base_y = (1080 - .53*xref)*h/1116
        strip0, strip1 = round(348*h/1116),round(391*h/1116)
        # Retain column stripes without repeating diagonal lintels down the wall.
        facade = source[strip0:strip1,x].mean(axis=0)
        for y in range(ry0,ry1):
            bead = .94 + .06*np.cos(y*2.2)
            fade = np.clip((base_y-y)/8+.5,0,1)
            clean[y,x] = np.clip(facade*bead*fade+street[min(y,round(810*h/1116))]*(1-fade),0,255)
    repair_alpha = cv2.GaussianBlur(hole,(0,0),3).astype(float)/255
    clean = (clean*repair_alpha[:,:,None]+source*(1-repair_alpha[:,:,None])).astype(np.uint8)

    tile_mask = np.zeros((h,w),np.uint8)
    tile_records=[]
    for name,bounds,group in TILES:
        x0,y0,x1,y1=box(bounds)
        tile_mask[y0:y1,x0:x1]=255
        tile_records.append({'id':name,'group':group,'sourceBoxPx':[x0,y0,x1,y1],
                             'rect':[x0/w,y0/h,(x1-x0)/w,(y1-y0)/h]})
    # Recover hidden strips with nearby source-column texture on facades and
    # projectively sampled lower-table bead texture. Generic inpainting produced
    # broad coloured triangles, so it is not used in the runtime.
    for rec in tile_records:
        x0,y0,x1,y1=rec['sourceBoxPx']
        xx,yy=np.meshgrid(np.arange(x0,x1),np.arange(y0,y1))
        if rec['group']=='table':
            xr=(xx+left)*2000/ow; yr=yy*1116/h
            top=858+260*((xr-1000)/1000)**2
            radius=np.sqrt((xr-1000)**2+((yr-640)*1.3)**2)
            tx=1000+(xr-1000)*460/np.maximum(210,yr-650)
            tx=np.clip(tx,85,1910)
            blocked=((tx>=1070)&(tx<=1240))|((tx>=1700)&(tx<=1780))
            tx=np.where(blocked,2000-tx,tx)
            ty=1090+(radius%25)
            sx=np.clip(np.rint(tx*ow/2000-left).astype(int),0,w-1)
            sy=np.clip(np.rint(ty*h/1116).astype(int),0,h-1)
            texture=source[sy,sx].astype(float)
            surface=np.clip((yr-top+2)/4,0,1)
            patch=texture*surface[:,:,None]+np.array([22,12,8])*(1-surface[:,:,None])
        else:
            # Clone the same x-columns from a nearby tile-free region, retaining
            # fine source beading. Upper-left tags sit over a dark awning/window.
            if rec['group']=='left':
                sy0,sy1=point(0,235)[1],point(0,315)[1]
                if rec['id']=='left-cream': sy0,sy1=point(0,470)[1],point(0,550)[1]
            else:
                sy0,sy1=point(0,510)[1],point(0,690)[1]
            sy=sy0+(yy-y0)%(sy1-sy0)
            patch=source[sy,xx]
        clean[y0:y1,x0:x1]=np.clip(patch,0,255).astype(np.uint8)
    Image.fromarray(clean).save(OUT/'background.png',optimize=True)

    ys,xs=np.where(alpha>0)
    x0,y0,x1,y1=max(0,int(xs.min())-2),max(0,int(ys.min())-2),min(w,int(xs.max())+3),min(h,int(ys.max())+3)
    rgba=np.dstack([source[y0:y1,x0:x1],alpha[y0:y1,x0:x1]])
    Image.fromarray(rgba).save(OUT/'figure-woman.png',optimize=True)
    figure_box=[x0,y0,x1,y1]

    # The visible foreground is traced from the selected artwork: table rim plus
    # cup, not the rejected renderer's ellipse constants. Tiles are NOT baked here.
    fg_mask=np.zeros((h,w),np.uint8)
    rim=[(0,1116),(81,1116),(145,1070),(250,1016),(370,967),(513,920),(650,888),
         (804,864),(977,858),(1114,868),(1254,894),(1395,930),(1538,969),
         (1710,1030),(1872,1090),(1940,1116),(2000,1116)]
    cv2.fillPoly(fg_mask,[np.array([point(x,y) for x,y in rim],np.int32)],255)
    cup=[(1258,1008),(1280,832),(1330,820),(1415,817),(1495,834),(1518,886),
         (1564,866),(1587,886),(1584,922),(1542,942),(1515,1027),(1431,1056),(1320,1045)]
    cv2.fillPoly(fg_mask,[np.array([point(x,y) for x,y in cup],np.int32)],255)
    fg_alpha=cv2.GaussianBlur(fg_mask,(0,0),1)
    # Full-frame transparent foreground keeps the UV contract simple.
    Image.fromarray(np.dstack([clean,fg_alpha])).save(OUT/'foreground.png',optimize=True)

    atlas=np.zeros((h,w,4),np.uint8)
    atlas[:,:,:3]=source
    atlas[:,:,3]=tile_mask
    Image.fromarray(atlas).save(OUT/'tiles.png',optimize=True)
    asset=lambda name:{'file':name,'sha256':digest(OUT/name),'size':list(Image.open(OUT/name).size)}
    manifest={
      'revision':'w4-20261008-seed33-fidelity-r1','sourceStill':{'path':str(SOURCE.relative_to(ROOT)).replace('\\','/'),'sha256':digest(SOURCE),'nativeSize':[ow,h]},
      'generatedBy':'week4/app/scripts/extract-seed33-assets.py','ownerAuthorization':'See revision REVIEW.md; seed33-derived assets allowed for this bounded local browser pass; no video pixels',
      'aspectHandling':{'mode':'crop','nativeSize':[ow,h],'outputSize':[w,h],'cropLeftPx':left,'cropRightPx':ow-w-left},
      'background':asset('background.png'),
      'figure':{**asset('figure-woman.png'),'cropBoxInBackgroundPx':figure_box,'cropBoxInBackgroundFrac':[x0/w,y0/h,x1/w,y1/h],
                'method':'Manually traced actual img13 silhouette,1.2px alpha feather; not run4 silhouette geometry'},
      'foreground':{**asset('foreground.png'),'cropBoxInBackgroundPx':[0,0,w,h],'method':'Source-traced foreground rim/cup; tile regions removed'},
      'tiles':{**asset('tiles.png'),'regions':tile_records,'method':'Original source rectangles separated into independently rendered textured quads'},
      'limitations':['The hidden facade uses source-column texture reconstruction; behind tiles uses neighbouring facade strips or projectively sampled lower-table texture. Neither is recovered unseen geometry.',
                      'Figure remains a2D matte for a fixed camera, with live mesh articulation; no3D or head-coupling claim.',
                      'Original third-party input rights not independently cleared; see RUNTIME_ASSETS.md.'],
      'vb2Measurement':{'method':'Direct visual reference guides only, no automated tracking measurement or video pixels claimed','approachSamples':[
        {'tMs':0,'centerX':.3646,'headTopY':.3558,'height':.3933},
        {'tMs':1250,'centerX':.371,'headTopY':.345,'height':.421},
        {'tMs':2500,'centerX':.383,'headTopY':.323,'height':.463},
        {'tMs':3750,'centerX':.407,'headTopY':.281,'height':.540},
        {'tMs':4960,'centerX':.461,'headTopY':.215,'height':.721}]}}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    # Scratch inspection: true alpha compositing, not the viewer's RGB-only PNG view.
    preview=Image.new('RGB',(rgba.shape[1],rgba.shape[0]),(25,14,10))
    preview.paste(Image.fromarray(rgba[:,:,:3]),(0,0),Image.fromarray(rgba[:,:,3]))
    preview.save(OUT/'figure-matte-preview.png')
    print(json.dumps({'size':[w,h],'figureBox':figure_box,'tiles':len(tile_records),'sourceHash':digest(SOURCE)},indent=2))

if __name__=='__main__': main()
