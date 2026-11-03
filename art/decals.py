# Era decals for the building kit: posters, bills, signs, stains — one 1024² atlas, 256 px cells.
import numpy as np, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S=1024; C=256; R=random.Random(11); rng=np.random.default_rng(11)
SERIF='/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'; SERIFC='/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed-Bold.ttf'
BASK='/usr/share/fonts/truetype/baskerville/GFSBaskerville.otf'; FS='/usr/share/fonts/truetype/freefont/FreeSerif.ttf'
atlas=Image.new('RGBA',(S,S),(0,0,0,0))
def font(p,sz):
    try: return ImageFont.truetype(p,sz)
    except Exception: return ImageFont.truetype(SERIF,sz)
def paper(w,h,tint=(222,205,165),torn=0.0,seed=0):
    r=np.random.default_rng(seed); yy,xx=np.mgrid[0:h,0:w]
    base=np.array(tint,np.float32)[None,None,:]*(0.92+0.08*r.random((h,w,1)))
    # foxing and water stains
    for _ in range(6):
        cx,cy,rad=r.uniform(0,w),r.uniform(0,h),r.uniform(8,40); d=np.hypot(xx-cx,yy-cy)
        base*=1-0.12*np.exp(-(d/rad)**2)[...,None]
    edge=np.minimum(np.minimum(xx,w-1-xx),np.minimum(yy,h-1-yy)); base*=(0.75+0.25*np.clip(edge/14,0,1))[...,None]
    a=np.full((h,w),255,np.uint8)
    # ragged edge
    jag=(r.random((h,w))<0.5)&(edge<2); a[jag]=0
    if torn>0:   # a torn-off corner
        m=(xx/w+ (h-yy)/h) > (2-torn)+0.05*np.sin(xx*0.3+yy*0.2); a[m]=0
    im=Image.fromarray(np.dstack([np.clip(base,0,255).astype(np.uint8),a]),'RGBA'); return im
def centred(d,box,text,f,fill):
    x0,y0,x1,y1=box; tw=d.textlength(text,font=f); d.text(((x0+x1-tw)/2,y0),text,font=f,fill=fill)
def put(im,cx,cy,cw=1,ch=1):
    atlas.alpha_composite(im.resize((C*cw,C*ch)),(cx*C,cy*C))
ink=(38,28,22,255)
# 0,0 wanted poster
im=paper(200,250,seed=1); d=ImageDraw.Draw(im)
centred(d,(0,10,200,0),'WANTED',font(SERIFC,40),ink); centred(d,(0,55,200,0),'DEAD OR ALIVE',font(SERIF,14),ink)
d.rectangle((40,78,160,170),outline=ink,width=2)
for k in range(9): d.line((60+R.uniform(-5,5),95+k*7,140+R.uniform(-5,5),95+k*7+R.uniform(-4,4)),fill=(60,48,40,200),width=1)
d.ellipse((80,88,120,135),outline=(50,40,34,255),width=2)
centred(d,(0,180,200,0),'REWARD',font(SERIFC,26),ink); centred(d,(0,212,200,0),'500 CROWNS',font(SERIF,16),(120,30,22,255))
put(im,0,0)
# 1,0 public notice handbill
im=paper(200,260,tint=(230,222,200),seed=2); d=ImageDraw.Draw(im)
centred(d,(0,12,200,0),'PUBLIC',font(SERIFC,30),ink); centred(d,(0,46,200,0),'NOTICE',font(SERIFC,30),ink)
d.line((30,84,170,84),fill=ink,width=2); centred(d,(0,90,200,0),'By Order of the Council',font(FS,13),ink); centred(d,(0,106,200,0),'of Eldermere',font(FS,13),ink)
for k in range(9): w=R.uniform(90,150); d.line((100-w/2,136+k*11,100+w/2,136+k*11),fill=(70,60,50,210),width=3)
put(im,1,0)
# 2,0 theatre playbill
im=paper(200,260,tint=(214,190,150),seed=3); d=ImageDraw.Draw(im)
d.rectangle((6,6,194,254),outline=(130,40,30,255),width=4)
centred(d,(0,16,200,0),'THE CRYSTAL',font(SERIFC,22),(130,40,30,255)); centred(d,(0,42,200,0),'THEATRE',font(SERIFC,30),ink)
for i in range(5): x=40+i*30; d.polygon([(x,90),(x+5,103),(x+18,103),(x+8,111),(x+12,124),(x,116),(x-12,124),(x-8,111),(x-18,103),(x-5,103)],fill=(170,120,40,255))
centred(d,(0,135,200,0),'TONIGHT',font(SERIFC,28),ink); centred(d,(0,172,200,0),'The Lantern Bearer',font(FS,16),ink); centred(d,(0,196,200,0),'A Tragedy in Three Acts',font(FS,12),ink)
centred(d,(0,222,200,0),'Doors at Seven',font(FS,12),(130,40,30,255))
put(im,2,0)
# 3,0 torn, faded poster
im=paper(200,250,tint=(200,186,160),torn=0.55,seed=4); d=ImageDraw.Draw(im)
centred(d,(0,20,200,0),'GRAND',font(SERIFC,34),(90,70,60,220)); centred(d,(0,62,200,0),'AUCTION',font(SERIFC,34),(90,70,60,220))
for k in range(8): w=R.uniform(80,150); d.line((100-w/2,120+k*12,100+w/2,120+k*12),fill=(110,95,80,170),width=3)
im=Image.fromarray(np.dstack([np.array(im)[...,:3],np.array(im)[...,3]]).astype(np.uint8),'RGBA'); put(im,3,0)
# 0,1 + 1,1 painted ghost sign (on brick): faded paint, soft alpha
im=Image.new('RGBA',(512,256),(0,0,0,0)); d=ImageDraw.Draw(im)
d.rectangle((8,20,504,236),fill=(30,40,34,200)); d.rectangle((20,32,492,224),outline=(205,190,150,220),width=5)
centred(d,(0,50,512,0),'ELDERMERE',font(SERIFC,70),(222,206,160,235)); centred(d,(0,135,512,0),'COAL & COKE CO.',font(SERIF,40),(222,206,160,235))
centred(d,(0,186,512,0),'Deliveries Daily',font(FS,22),(200,170,90,230))
a=np.array(im).astype(np.float32); n=rng.random(a.shape[:2]); blot=np.array(Image.fromarray((rng.random((32,64))*255).astype(np.uint8)).resize((512,256),Image.BICUBIC))/255
a[...,3]*=np.clip(0.35+0.75*blot-0.25*n,0,1)   # weathered, patchy paint
im=Image.fromarray(a.astype(np.uint8),'RGBA'); put(im,0,1,2,1)
# 2,1 enamel street nameplate
im=Image.new('RGBA',(256,256),(0,0,0,0)); d=ImageDraw.Draw(im)
d.rounded_rectangle((8,78,248,178),18,fill=(225,222,212,255)); d.rounded_rectangle((16,86,240,170),12,fill=(28,44,92,255)); d.rounded_rectangle((22,92,234,164),9,outline=(230,228,220,255),width=3)
centred(d,(0,108,256,0),'GUILD ROW',font(SERIFC,32),(240,238,230,255))
for (x,y) in ((14,128),(242,128)): d.ellipse((x-4,y-4,x+4,y+4),fill=(90,90,90,255))
put(im,2,1)
# 3,1 guild notice: "ADVENTURERS WANTED" pinned paper
im=paper(200,240,tint=(236,226,196),seed=6); d=ImageDraw.Draw(im)
centred(d,(0,18,200,0),'ADVENTURERS',font(SERIFC,21),ink); centred(d,(0,44,200,0),'WANTED',font(SERIFC,32),(120,30,22,255))
d.line((30,86,170,86),fill=ink,width=2)
for k in range(8): w=R.uniform(90,150); d.line((100-w/2,104+k*12,100+w/2,104+k*12),fill=(70,60,50,210),width=3)
centred(d,(0,206,200,0),'Enquire within',font(FS,14),ink); d.ellipse((94,4,106,16),fill=(140,30,25,255))
put(im,3,1)
# 0,2 soot streak · 1,2 damp stain · 2,2 moss patch · 3,2 plaster fallen away (brick showing)
yy,xx=np.mgrid[0:C,0:C]/C
def soft(col,alpha):
    return Image.fromarray(np.dstack([np.broadcast_to(np.array(col,np.uint8),(C,C,3)),np.clip(alpha*255,0,255).astype(np.uint8)]),'RGBA')
noi=np.array(Image.fromarray((rng.random((24,24))*255).astype(np.uint8)).resize((C,C),Image.BICUBIC))/255
streak=np.exp(-((xx-0.5)/(0.12+0.18*yy))**2)*(1-yy)**0.6*(0.6+0.4*noi)
put(soft((18,15,13),streak*0.85),0,2)
damp=np.exp(-((xx-0.5)/0.35)**2)*np.clip(yy*1.4,0,1)**1.5*(0.5+0.5*noi); ring=np.abs(damp-0.35)<0.03
put(soft((40,38,30),damp*0.55+ring*0.25),1,2)
moss=np.clip((noi-0.35)*2.5,0,1)*np.exp(-((xx-0.5)**2+(yy-0.6)**2)/0.09)
mc=np.dstack([40+40*noi,62+40*noi,18+14*noi]).astype(np.uint8)
put(Image.fromarray(np.dstack([mc,np.clip(moss*255,0,255).astype(np.uint8)]),'RGBA'),2,2)
# exposed brick under fallen plaster: an irregular hole with brick courses and a broken lip
hole=np.clip((0.55-np.hypot((xx-0.5)*1.3,(yy-0.5))+0.12*(noi-0.5))*14,0,1)
bc=np.zeros((C,C,3),np.float32)
row=(yy*C//18).astype(int); off=(row%2)*0.5; brk=((xx*C/34+off)%1)
mort=((yy*C%18)<2.5)|(brk<0.07)
tone=rng.random((40,40))[row%40,(xx*C/34+off).astype(int)%40]
bc[...]=np.dstack([120+60*tone,48+22*tone,32+14*tone]); bc[mort]=(150,140,125)
lip=np.clip((hole-0.0)*1,0,1); edge=(hole>0.02)&(hole<0.35)
bc[edge]=bc[edge]*0.55
put(Image.fromarray(np.dstack([bc.astype(np.uint8),(hole*255).astype(np.uint8)]),'RGBA'),3,2)
# 0,3 + 1,3 painted shop lettering board: APOTHECARY
im=Image.new('RGBA',(512,256),(0,0,0,0)); d=ImageDraw.Draw(im)
d.rectangle((6,64,506,192),fill=(26,52,36,255)); d.rectangle((16,74,496,182),outline=(196,160,80,255),width=4)
centred(d,(0,88,512,0),'APOTHECARY',font(SERIFC,72),(214,180,96,255))
put(im,0,3,2,1)
# 2,3 chalk tally marks and a guild rune scratched on a wall
im=Image.new('RGBA',(256,256),(0,0,0,0)); d=ImageDraw.Draw(im)
for g in range(3):
    for k in range(4): x=40+g*60+k*10; d.line((x,90+R.uniform(-3,3),x+R.uniform(-3,3),140),fill=(235,232,222,200),width=4)
    d.line((34+g*60,128,82+g*60,98),fill=(235,232,222,200),width=4)
d.line((90,170,128,206,166,170,128,150,90,170),fill=(235,232,222,180),width=4)
put(im,2,3)
# 3,3 cast-iron coal-hole cover (for floors and pavements)
im=Image.new('RGBA',(256,256),(0,0,0,0)); d=ImageDraw.Draw(im)
d.ellipse((24,24,232,232),fill=(36,36,38,255)); d.ellipse((34,34,222,222),outline=(70,70,72,255),width=4)
for k in range(12):
    import math; a=k/12*math.pi*2; d.line((128,128,128+90*math.cos(a),128+90*math.sin(a)),fill=(60,60,62,255),width=5)
d.ellipse((96,96,160,160),fill=(40,40,42,255)); centred(d,(0,113,256,0),'COAL',font(SERIF,18),(90,90,92,255))
put(im,3,3)
# bleed colour into transparent texels so mips don't fringe
rgb=atlas.convert('RGB').filter(ImageFilter.MaxFilter(5)); al=atlas.getchannel('A')
out=Image.composite(atlas.convert('RGB'),rgb,al).convert('RGBA'); out.putalpha(al); out.save('data/buildkit/decals.png')
bg=Image.new('RGBA',out.size,(150,110,90,255)); bg.alpha_composite(out); bg.resize((512,512)).save('/tmp/claude-0/-home-claude/494cfac4-bacd-5739-91d2-3fd1922fe553/scratchpad/decals_prev.png')
