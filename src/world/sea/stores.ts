import type { CrewMember } from './crew';
export interface StoresSave { rations:number; water:number; hour:number; wageDebt:number; }
export class ShipStores {
  state:StoresSave={rations:30,water:40,hour:-1,wageDebt:0};
  fromJSON(s?:StoresSave){this.state=s?{...s}:{rations:30,water:40,hour:-1,wageDebt:0};}
  update(hour:number,crew:CrewMember[],inPort:boolean){
    const old=this.state.hour;this.state.hour=hour;if(old<0||hour<=old)return;
    const hands=crew.filter(c=>c.status==='aboard');const use=(hour-old)*(hands.length+1)/24;
    this.state.rations=Math.max(0,this.state.rations-use);this.state.water=Math.max(0,this.state.water-use);
    if(this.state.rations===0||this.state.water===0)for(const c of hands)c.morale=Math.max(.05,c.morale-Math.min(.15,(hour-old)*.015));
  }
  days(crew:CrewMember[]){return Math.min(this.state.rations,this.state.water)/Math.max(1,crew.filter(c=>c.status==='aboard').length+1);}
}
