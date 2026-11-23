#!/usr/bin/env python3
"""Derive stable island cells, exploration anchors and shore-to-site paths.

Run from the repository root. Optional authoring dependencies: Pillow, NumPy,
SciPy. The game consumes committed atlas.json and never runs this generator.
Connected components use four neighbours; single-cell sea stacks stay scenery.
Review identity/save migrations when changing the source macro map or ordering.
"""
from PIL import Image
import numpy as np,json,heapq,math
from scipy import ndimage
r=json.load(open('src/world/data/regions.json'));a=np.array(Image.open('public/assets/world/macro.png').convert('RGBA'));ids=[x['id'] for x in r['regions']]
names={
'azureIsles':['Crownspice','Longreef','Haven Isle','Glasswing','Gull Lantern'],
'emeraldIsles':['Great Fern','Heartwood','Raincall','Madder Key','Weavers Cay','Foxglove','Reedglass','Ternwatch','Bramblehook','Cove Isle','Driftseed'],
'shatteredIsles':['Gallows Crown','Blackwake','Ironhook','Stormbreak','Knifewake','Widows Tooth','Cinderhook','Gullet Key','Last Mercy','Rumrunner','Ragged Crown','Broken Oath','Marrow Rock','Crows Foot','Dead Reckon','Hanged Bell'],
'sunkenIsles':['First Turning','Coral Throne','Drowned Choir','Mourning Steps','Lamps Below','Spire Isle','Moonwash','Keepers Rest','Last Bell','Watchers Knuckle','Silent Wheel']}
ports={'azureIsles':(8084,-3786),'emeraldIsles':(6800,2690),'shatteredIsles':(4334,5132),'sunkenIsles':(9404,5948)}
x0=-r['originPx'][0]*r['metresPerPx'];z0=-r['originPx'][1]*r['metresPerPx']
world=lambda y,x:[round(x0+(x+.5)*60),round(z0+(y+.5)*60)]
height=lambda y,x:round(max(2.4,-80+int(a[y,x,2])*800/255),2)
out=[]
for region in names:
 mask=(a[:,:,0]==ids.index(region))&~np.isin(a[:,:,1],[0,1]);lab,n=ndimage.label(mask)
 comps=sorted([(int((lab==j).sum()),j) for j in range(1,n+1) if (lab==j).sum()>=2],reverse=True)
 assert len(comps)==len(names[region]), f'Update authored island names for {region}'
 for index,(size,j) in enumerate(comps):
  m=lab==j;d=ndimage.distance_transform_edt(m);cy,cx=np.unravel_index(d.argmax(),d.shape);centre=world(cy,cx);cells=list(zip(*np.where(m)));safe=[p for p in cells if d[p]>=min(1.5,d.max())];
  chosen=[(cy,cx)];count=5 if size>70 else 3 if size>15 else 2 if size>4 else 1
  for q in range(1,count):
   p=max(safe,key=lambda p:min(math.hypot(p[0]-v[0],p[1]-v[1]) for v in chosen))
   if p in chosen:break
   chosen.append(p)
  # A safe, exposed shore tile with an adjacent ocean tile, favouring the harbour's side.
  border=[]
  for y,x in cells:
   for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
    yy,xx=y+dy,x+dx
    if 0<=yy<a.shape[0] and 0<=xx<a.shape[1] and a[yy,xx,1] in [0,1]:
     border.append(((y,x),(yy,xx)))
  if not border:continue
  land,sea=min(border,key=lambda v:height(*v[0]) + math.hypot(world(*v[0])[0]-ports[region][0],world(*v[0])[1]-ports[region][1])*.003)
  def route(goal):
   start=(cy,cx);pq=[(0,start)];prev={start:None};cost={start:0}
   while pq:
    g,p=heapq.heappop(pq)
    if p==goal:break
    for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
     t=p[0]+dy,p[1]+dx
     if t not in cellset:continue
     c=g+60+abs(height(*p)-height(*t))*3
     if c<cost.get(t,1e9):cost[t]=c;prev[t]=p;heapq.heappush(pq,(c,t))
   if goal not in prev:return []
   v=[];p=goal
   while p is not None:v.append([*world(*p),height(*p)]);p=prev[p]
   return v[::-1]
  cellset=set(cells)
  # The reef tyrant belongs on the low coast, not the clifftop anchor.
  if region=='azureIsles' and index==0:chosen[1],chosen[2]=chosen[2],chosen[1]
  sites=[{'at':world(*p),'h':height(*p)} for p in chosen]
  paths=[route(p) for p in chosen[1:]+[land]]
  # Put a submerged find just seaward of every Sunken island and the Azure main isles.
  dive=None
  if region=='sunkenIsles' or region=='azureIsles' and size>50:
   sy,sx=sea;dy,dx=sy-land[0],sx-land[1]
   for k in range(1,5):
    yy,xx=sy+dy*k,sx+dx*k
    if 0<=yy<a.shape[0] and 0<=xx<a.shape[1] and a[yy,xx,1] in [0,1]:dive=world(yy,xx);break
  out.append({'id':region.replace('Isles','')+'-'+str(index+1),'name':names[region][index], 'region':region,'area':size*3600,'at':centre,'h':height(cy,cx),'extent':round(max(math.dist(centre,world(y,x)) for y,x in cells)+70),'landing':world(*land),'sea':world(*sea),'sites':sites,'paths':paths,'dive':dive,'cells':[int(y*a.shape[1]+x) for y,x in cells]})
json.dump(out,open('src/world/islands/atlas.json','w'),indent=2)
print('Generated',len(out),'islands,',sum(len(v['sites']) for v in out),'land sites and',sum(v['dive'] is not None for v in out),'dive sites')
