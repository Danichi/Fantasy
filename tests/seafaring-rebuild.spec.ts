import { test, expect, SLOW } from './fixtures';

test('every hired boat has a readable HUD and the legacy rowboat controller cannot own a ship helm', async ({ game }) => {
  const r=await game.page.evaluate(async()=>{
    const g=(window as any).__game,s=g.sailing;
    g.player.prog.addGold(1000);s.hireRowboat();
    const boat=s.current;g.input.press('KeyW');g.stepSim(180);g.input.release('KeyW');s.frame(1);
    const start=boat.pos.clone(),old=g.boats.state.pos.clone();
    g.input.press('KeyX');g.stepSim(2);g.input.release('KeyX');g.boats.update(1);
    return {hull:boat.hull,mode:s.travelMode,hud:(document.querySelector('.sea-hud') as HTMLElement).innerText,visible:getComputedStyle(document.querySelector('.sea-hud')!).display,legacy:g.boats.active,oldMoved:g.boats.state.pos.distanceTo(old),speed:boat.speed,same:s.current===boat,position:boat.pos.distanceTo(start)};
  });
  expect(r.hull).toBe('rowboat');expect(r.mode).toBe('rowing');expect(r.visible).toBe('block');expect(r.hud).toMatch(/km\/h/);expect(r.hud).toMatch(/Heading/i);expect(r.hud).toMatch(/P ship/);expect(r.legacy).toBe(false);expect(r.oldMoved).toBe(0);expect(r.speed).toBeGreaterThan(.5);expect(r.same).toBe(true);expect(r.position).toBeLessThan(2);expect(game.errors).toEqual([]);
});

test('water controls allow fast swimming, descent, ascent and surface recovery without land attacks', async ({game})=>{
  test.setTimeout(300_000*SLOW);
  const r=await game.page.evaluate(async()=>{
    const g=(window as any).__game,s=g.sailing,T=g.THREE;
    g.player.prog.addGold(1000);const boat=s.rent('sloop');s.board(boat);s.enterWater();
    await new Promise(r=>setTimeout(r,1500));g.stepSim(30);
    const start=g.player.pos.clone();g.input.press('KeyW');g.input.press('ShiftLeft');g.stepSim(90);
    const fast=g.player.sprinting,moved=g.player.pos.distanceTo(start);g.input.releaseAll();
    g.input.press('KeyC');g.stepSim(90);g.input.releaseAll();const deep=g.player.diveDepth;
    g.input.press('Space');g.stepSim(100);g.input.releaseAll();const surfaced=g.player.diveDepth;
    g.player.stamina=30;g.stepSim(120);s.frame(1);
    return {fast,moved,deep,surfaced,swimming:g.player.swimming,stamina:g.player.stamina,act:g.player.act?.def.id??null,hud:(document.querySelector('.sea-hud') as HTMLElement).innerText,finite:g.player.pos.toArray().every(Number.isFinite)};
  });
  expect(r.fast).toBe(true);expect(r.moved).toBeGreaterThan(3);expect(r.deep).toBeGreaterThan(1);expect(r.surfaced).toBeLessThan(.2);expect(r.swimming).toBe(true);expect(r.stamina).toBeGreaterThan(30);expect(r.act).toBeNull();expect(r.hud).toMatch(/Breath/i);expect(r.hud).toMatch(/rise/);expect(r.finite).toBe(true);expect(game.errors).toEqual([]);
});

test('sea input does not open the herbalism codex or alter a second vehicle',async({game})=>{
  const r=await game.page.evaluate(()=>{
    const g=(window as any).__game,s=g.sailing;
    const boat=s.rent('skiff');s.board(boat);g.input.press('KeyO');g.stepSim(2);g.input.release('KeyO');
    const atHelm=s.atHelm,mode=s.travelMode;
    g.input.press('KeyP');g.stepSim();g.input.release('KeyP');
    return {atHelm,mode,herbs:g.herbalism.isOpen,dialogue:g.dialogue.open,menu:g.dialogue.options.map((o:any)=>o.label)};
  });
  expect(r.atHelm).toBe(true);expect(r.mode).toBe('helm');expect(r.herbs).toBe(false);expect(r.dialogue).toBe(true);expect(r.menu).toContain('Chart a course to a harbour');expect(game.errors).toEqual([]);
});

test('helm and deck resumes preserve cargo, motion, sail orders, settings and crew',async({game})=>{
  const r=await game.page.evaluate(()=>{
    const g=(window as any).__game,s=g.sailing,T=g.THREE;
    const r=s.buy('cutter'),ship=s.ships.get(r.id);r.cargo={spices:8};ship.pos.set(3600,0,450);ship.yaw=1;ship.place();ship.place();s.board(ship);s.takeHelm();
    s.ctl.sail=.6;s.ctl.anchor=false;ship.anchored=false;ship.sailSet=.6;ship.speed=4;s.settings.advanced=true;s.settings.units='knots';s.windCd=22;
    const save=structuredClone(s.toJSON());s.reset();s.fromJSON(save);s.restoreVoyage();const a=s.current;
    const helm={id:s.current&&s.records.find((r:any)=>s.ships.get(r.id)===s.current).id,speed:a.speed,sail:s.ctl.sail,anchor:s.ctl.anchor,mode:s.travelMode,cargo:s.records[0].cargo,units:s.settings.units,wind:s.windCd};
    s.leaveHelm();s.player.teleport(a.toWorld(new T.Vector3(.3,a.def.deckY+.3,0)));const local=a.toLocal(s.player.pos).toArray();const saved=structuredClone(s.toJSON());s.reset();s.fromJSON(saved);s.restoreVoyage();
    return{helm,deck:{mode:s.travelMode,local:s.current.toLocal(g.player.pos).toArray(),vehicle:g.player.vehicle,hasDeck:s.current.hasDeck},local};
  });
  expect(r.helm).toMatchObject({speed:4,sail:.6,anchor:false,mode:'helm',cargo:{spices:8},units:'knots',wind:22});expect(r.deck.mode).toBe('deck');expect(r.deck.vehicle).toBeNull();expect(r.deck.hasDeck).toBe(true);for(let i=0;i<3;i++)expect(r.deck.local[i]).toBeCloseTo(r.local[i],2);expect(game.errors).toEqual([]);
});

test('Sea Legs uses visible course markers and a coastal job pays once on its return',async({game})=>{
  const r=await game.page.evaluate(async()=>{
    const g=(window as any).__game,s=g.sailing;
    const{TRAINING_MARKS,COASTAL_JOBS}=await import('/src/world/sea/voyages.ts' as string);
    g.quests.accept('sea-legs');const ship=s.rent('skiff');s.board(ship);
    for(const[x,z]of TRAINING_MARKS){ship.pos.set(x,0,z);s.voyages.update(1/60,ship,true);}
    const stage=g.quests.state['sea-legs'].stage;
    s.voyages.start('rescue');const j=COASTAL_JOBS.find((j:any)=>j.id==='rescue');ship.pos.set(...[j.at[0],0,j.at[1]]);ship.speed=0;
    const canCollect=s.voyages.canCollect(ship);s.voyages.collect();const gold=g.player.prog.gold;s.voyages.dock('portAurelle',g.time.day);s.voyages.dock('portAurelle',g.time.day);
    return{stage,training:s.voyages.state.training,canCollect,paid:g.player.prog.gold-gold,log:s.voyages.state.log,active:s.voyages.state.active};
  });
  expect(r.stage).toBe(1);expect(r.training).toBe(3);expect(r.canCollect).toBe(true);expect(r.paid).toBe(120);expect(r.active).toBeUndefined();expect(r.log.length).toBeGreaterThan(0);expect(game.errors).toEqual([]);
});

test('a large ship has a walkable cabin and returns to its own deck',async({game})=>{
  test.setTimeout(300_000*SLOW);
  const r=await game.page.evaluate(async()=>{
    const g=(window as any).__game,s=g.sailing;
    const rec=s.buy('cutter'),ship=s.ships.get(rec.id);ship.pos.set(3500,0,500);ship.place();ship.place();s.board(ship);
    s.enterCabin();for(let i=0;i<200&&(g.realm.mode!=='interior'||g.realm.busy);i++)await new Promise(r=>setTimeout(r,30));
    const kind=g.realm.interior?.kind,spots=Object.keys(g.realm.interior?.spots??{});await g.realm.leaveInterior();
    return {kind,spots,mode:g.realm.mode,deck:ship.onDeck(g.player.pos),cabin:s.inCabin,same:s.current===ship};
  });
  expect(r.kind).toBe('cabin');expect(r.spots).toContain('cabinChart');expect(r.mode).toBe('overworld');expect(r.deck).toBe(true);expect(r.cabin).toBe(false);expect(r.same).toBe(true);expect(game.errors).toEqual([]);
});
