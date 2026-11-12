import type { Action, Input } from '../../core/input';
import type { SeaSettings } from './runtime';
export type SeaOption={label:string;run:()=>void};
export interface BridgeHost {
  name:string;status:string;settings:SeaSettings;input:Input;save():void;close():void;show(text:string,options:SeaOption[]):void;
  navigate():void;jobs():void;recover():void;stores():void;shipMenu():void;walk():void;helm():void;anchor():void;dive():void;cabin():void;atHelm:boolean;aboard:boolean;log:string[];
}
export function showBridge(h:BridgeHost){
  const back=()=>showBridge(h);
  const keys: [Action,string][]=[['forward','More sail / row forward'],['back','Less sail / stop rowing'],['left','Steer left'],['right','Steer right'],['interact','Board / helm / dock / ladder'],['seaOrders','Ship and navigation'],['seaAnchor','Anchor'],['seaReef','Reef sails'],['seaLash','Lash helm'],['seaCut','Cut harpoon line'],['seaSpyglass','Spyglass'],['seaShot','Change ammunition'],['seaMode','Assisted / advanced sailing'],['seaTrimIn','Trim in'],['seaTrimOut','Trim out'],['swimUp','Swim up / surface'],['swimDown','Dive / descend'],['sprint','Swim fast']];
  const bind=(page=0)=>h.show('Select an action, then press its new key. Escape cancels. Browser shortcuts are reserved.',[
    ...keys.slice(page*6,page*6+6).map(([a,label])=>({label:`${label}: ${h.input.bindings[a].join(' / ')}`,run:()=>{
      h.show(`Press a key for ${label}. Escape cancels.`,[]);
      const capture=(e:KeyboardEvent)=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;e.preventDefault();e.stopImmediatePropagation();window.removeEventListener('keydown',capture,true);h.input.releaseAll();if(e.code!=='Escape'){
        const seaContext:Action[]=['forward','back','left','right','interact','attack','offhand','seaOrders','seaAnchor','seaReef','seaLash','seaMode','seaTrimIn','seaTrimOut','seaCut','seaSpyglass','seaShot','seaRow'];
        const swimContext:Action[]=['forward','back','left','right','interact','sprint','swimUp','swimDown','seaOrders'];
        const context=a==='swimUp'||a==='swimDown'||a==='sprint'?swimContext:seaContext;
        const old=h.input.bindings[a][0];for(const other of context)if(other!==a&&h.input.bindings[other].includes(e.code))h.input.bindings[other]=[old];
        h.input.bindings[a]=[e.code];h.save();
      }bind(page);};window.addEventListener('keydown',capture,true);
    }})),
    ...(page*6+6<keys.length?[{label:'Next controls',run:()=>bind(page+1)}]:[]),{label:'Back',run:back},
  ]);
  const settings=()=>h.show('Choose the information and camera motion you prefer. Advanced sailing is available at the helm; basic navigation never requires a perk.',[
    {label:`Speed units: ${h.settings.units==='kmh'?'km/h':'knots'}`,run:()=>{h.settings.units=h.settings.units==='kmh'?'knots':'kmh';h.save();settings();}},
    {label:`Detailed instruments: ${h.settings.advanced?'shown':'hidden'}`,run:()=>{h.settings.advanced=!h.settings.advanced;h.save();settings();}},
    {label:`Camera motion: ${Math.round(h.settings.cameraMotion*100)}%`,run:()=>{h.settings.cameraMotion=h.settings.cameraMotion<.1?.35:h.settings.cameraMotion<.6?1:0;h.save();settings();}},
    {label:'Rebind sailing and swimming controls',run:()=>bind()}, {label:'Back',run:back},
  ]);
  h.show(h.status,[
    {label:'Chart a course to a harbour',run:h.navigate}, {label:'Coastal work and training',run:h.jobs},
    ...(h.aboard?[{label:h.atHelm?'Leave the wheel and walk the deck':'Take the helm',run:h.atHelm?h.walk:h.helm},{label:'Heave to / lower sail and anchor',run:h.anchor},{label:'Push clear of a shoal',run:h.recover},{label:'Provisions and wages',run:h.stores},{label:'Enter the captain’s cabin',run:h.cabin},{label:'Climb down into the water',run:h.dive},{label:'Hold, crew, repairs and ship records',run:h.shipMenu}]:[]),
    {label:'Sailing and swimming settings',run:settings},
    {label:'Read the voyage log',run:()=>h.show(h.log.join('\n')||'Your next voyage will write the first entry.',[{label:'Back',run:back}])},
    {label:'Return',run:h.close},
  ]);
}
