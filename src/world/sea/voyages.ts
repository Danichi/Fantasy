import * as THREE from 'three';
import type { Ship } from './ship';
import { formatDistance } from './runtime';
export const TRAINING_MARKS: [number,number][] = [[3055,245],[3150,155],[3070,65]];
export const COASTAL_JOBS = [
  {id:'keeper',name:'Keeper’s supply run',brief:'Take a sealed supply crate to the lighthouse tender, then return to Aurelle.',at:[3050,-100],pay:85,xp:90},
  {id:'rescue',name:'A fisherman overdue',brief:'Search the coastal marker for a stranded fisherman. Bring him home.',at:[3330,390],pay:120,xp:130},
  {id:'survey',name:'Chart the outer shoal',brief:'Take a sounding at the chart buoy north of the harbour. Return with the survey.',at:[3370,-240],pay:100,xp:110},
] as const;
export interface VoyageSave { training:number; active?:{id:string;collected:boolean}; paid:Record<string,number>; log:string[]; }
export class SeaVoyages {
  state:VoyageSave={training:0,paid:{},log:[]};
  readonly marker=new THREE.Group();
  private phase=0;
  constructor(scene:THREE.Scene,private signal:(id:string)=>void,private toast:(s:string)=>void,private reward:(gold:number,xp:number)=>void){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(7,.2,6,40),new THREE.MeshBasicMaterial({color:0xefcc7b}));ring.rotation.x=Math.PI/2;this.marker.add(ring);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,4,6),new THREE.MeshStandardMaterial({color:0x68533e}));mast.position.y=2;this.marker.add(mast);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1),new THREE.MeshBasicMaterial({color:0x70cbd0,side:THREE.DoubleSide}));flag.position.set(.8,3,0);this.marker.add(flag);
    this.marker.visible=false;scene.add(this.marker);
  }
  start(id:string){if(this.state.active)return false;const job=COASTAL_JOBS.find(j=>j.id===id);if(!job)return false;this.state.active={id,collected:false};this.record('Accepted: '+job.name);return true;}
  target(training:boolean){
    if(training && this.state.training<TRAINING_MARKS.length){const at=TRAINING_MARKS[this.state.training];return {x:at[0],z:at[1],label:`Training mark ${this.state.training+1} / ${TRAINING_MARKS.length}`};}
    const a=this.state.active,j=COASTAL_JOBS.find(j=>j.id===a?.id);return a&&!a.collected&&j?{x:j.at[0],z:j.at[1],label:j.name}:null;
  }
  update(dt:number,ship:Ship|null,training:boolean){
    this.phase+=dt;const t=this.target(training);this.marker.visible=!!t;
    if(t){this.marker.position.set(t.x,.5+Math.sin(this.phase)*.12,t.z);this.marker.rotation.y=this.phase*.15;}
    if(!ship||!training||!t||this.state.training>=3)return;
    if(Math.hypot(ship.pos.x-t.x,ship.pos.z-t.z)<22){this.state.training++;this.toast(`Training mark ${this.state.training} cleared.`);if(this.state.training===3){this.signal('sea-course');this.record('Completed the harbour training course.');this.toast('Course complete. Slow down and dock at Aurelle.');}}
  }
  canCollect(ship:Ship|null){const a=this.state.active,j=COASTAL_JOBS.find(j=>j.id===a?.id);return !!ship&&!!a&&!a.collected&&!!j&&Math.abs(ship.speed)<2.5&&Math.hypot(ship.pos.x-j.at[0],ship.pos.z-j.at[1])<22;}
  collect(){const a=this.state.active;if(!a||a.collected)return;a.collected=true;this.toast(a.id==='rescue'?'The fisherman climbs aboard. Take him home to Aurelle.':'Coastal task complete. Return to Aurelle for payment.');}
  dock(port:string,day:number){const a=this.state.active,j=COASTAL_JOBS.find(j=>j.id===a?.id);if(port!=='portAurelle'||!a?.collected||!j)return;if(this.state.paid[j.id]!==day){this.state.paid[j.id]=day;this.reward(j.pay,j.xp);this.record(`${j.name}: completed for ${j.pay}g.`);}delete this.state.active;}
  description(ship:Ship,training:boolean){const t=this.target(training);if(t)return `${t.label} · ${formatDistance(Math.hypot(ship.pos.x-t.x,ship.pos.z-t.z))} · slow down at the marker`;return this.state.active?.collected?'Return to Port Aurelle to complete the coastal job.':null;}
  record(line:string){this.state.log.unshift(line);this.state.log=this.state.log.slice(0,24);}
  fromJSON(s?:VoyageSave){this.state=s?structuredClone(s):{training:0,paid:{},log:[]};this.state.training=Math.max(0,Math.min(3,this.state.training??0));this.state.paid??={};this.state.log??=[];}
}
