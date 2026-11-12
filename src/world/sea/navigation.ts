import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { SEA_LEVEL } from '../worldMap';
import { currentAt, cellStormAt } from './seaState';
export interface SeaRoute { destination:string; points:[number,number][]; length:number; sheltered:boolean; }
/** A charted water route, checked for draft. The player still sails every leg. */
export function chartRoute(from:THREE.Vector3,to:THREE.Vector3,draft:number,destination:string):SeaRoute|null {
  const clear=(ax:number,az:number,bx:number,bz:number)=>{const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/55));for(let i=1;i<=n;i++){const t=i/n;if(SEA_LEVEL-heightAt(ax+(bx-ax)*t,az+(bz-az)*t)<draft+.25)return false;}return true;};
  let points:[number,number][];
  if(clear(from.x,from.z,to.x,to.z))points=[[from.x,from.z],[to.x,to.z]];
  else {
    const step=180,pad=1800,x0=Math.min(from.x,to.x)-pad,z0=Math.min(from.z,to.z)-pad;
    const cell=(x:number,z:number)=>[Math.round((x-x0)/step),Math.round((z-z0)/step)] as [number,number];
    const start=cell(from.x,from.z),key=(x:number,z:number)=>`${x},${z}`;
    const world=(x:number,z:number)=>[x0+x*step,z0+z*step] as [number,number];
    const open=[{x:start[0],z:start[1],g:0,f:0}],cost=new Map([[key(...start),0]]),prev=new Map<string,string>(),closed=new Set<string>();let found='';
    for(let tries=0;open.length&&tries<4500;tries++){
      open.sort((a,b)=>b.f-a.f);const c=open.pop()!,ck=key(c.x,c.z);if(closed.has(ck))continue;closed.add(ck);
      const [wx,wz]=world(c.x,c.z);if(Math.hypot(wx-to.x,wz-to.z)<step*1.5&&clear(wx,wz,to.x,to.z)){found=ck;break;}
      for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const x=c.x+dx,z=c.z+dz,[nx,nz]=world(x,z),nk=key(x,z);
        if(closed.has(nk)||nx<x0||nz<z0||nx>Math.max(from.x,to.x)+pad||nz>Math.max(from.z,to.z)+pad||!clear(wx,wz,nx,nz))continue;
        const flow=currentAt(nx,nz),along=(flow.x*dx+flow.z*dz)/Math.hypot(dx,dz);
        const g=c.g+Math.hypot(dx,dz)*step*(1+cellStormAt(nx,nz)*.8-Math.min(.15,along*.04));
        if(g>=(cost.get(nk)??Infinity))continue;cost.set(nk,g);prev.set(nk,ck);open.push({x,z,g,f:g+Math.hypot(nx-to.x,nz-to.z)*.85});
      }
    }
    if(!found)return null;const rev:[number,number][]=[[to.x,to.z]];for(let k:string|undefined=found;k;k=prev.get(k)){const [x,z]=k.split(',').map(Number);rev.push(world(x,z));}points=[[from.x,from.z],...rev.reverse().slice(1)];
    const simplified:[number,number][]=[points[0]];for(let i=1;i<points.length;){let j=points.length-1;while(j>i&&!clear(...simplified[simplified.length-1],...points[j]))j--;simplified.push(points[j]);i=j+1;}points=simplified;
  }
  const length=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
  return {destination,points,length,sheltered:length<1600};
}
export class RouteGuide {
  route:SeaRoute|null=null;next=1;
  readonly line:THREE.Line;
  constructor(scene:THREE.Scene){this.line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xdcc27f,transparent:true,opacity:.5}));this.line.visible=false;scene.add(this.line);}
  set(route:SeaRoute|null){this.route=route;this.next=1;this.line.geometry.dispose();this.line.geometry=new THREE.BufferGeometry().setFromPoints((route?.points??[]).map(([x,z])=>new THREE.Vector3(x,.7,z)));this.line.visible=!!route;}
  update(pos:THREE.Vector3){const r=this.route;if(!r)return;while(this.next<r.points.length-1&&Math.hypot(pos.x-r.points[this.next][0],pos.z-r.points[this.next][1])<90)this.next++;}
  target(){return this.route?.points[this.next]??null;}
  remaining(pos:THREE.Vector3){const r=this.route,t=this.target();if(!r||!t)return 0;return Math.hypot(pos.x-t[0],pos.z-t[1])+r.points.slice(this.next+1).reduce((n,p,i)=>n+Math.hypot(p[0]-r.points[this.next+i][0],p[1]-r.points[this.next+i][1]),0);}
}
