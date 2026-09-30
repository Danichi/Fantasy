// Fonts are bundled so the game works offline (desktop build).
import './render/stylize';
import { initCompressedGltf } from './core/gltf';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import * as THREE from 'three';
import { Renderer, SUN_DIR } from './render/renderer';
import { physics, PhysicsDebug } from './physics/physics';
import { Terrain, initTerrainData, heightAt, riverX } from './world/terrain';
import { loadWorldMap } from './world/worldMap';
import { Input } from './core/input';
import { Player } from './player/player';
import { ThirdPersonCamera } from './player/camera';
import { DEBUG, TEST_MODE, LEAN_TEST } from './core/settings';
import { setupLoadout } from './items/loadout';
import { FX } from './fx/particles';
import { BeastSpawner } from './enemies/beastSpawner';
import { Spells } from './magic/spells';
import { buildIcons, pumpIcons, setOnIconsReady, loadBakedIcons, exportAllIcons } from './ui/icons';
import { HUD } from './ui/hud';
import { InventoryUI, buildOverlays } from './ui/inventory';
import { Music } from './audio/music';
import { Ambient } from './world/ambient';
import { WorldTime } from './world/worldTime';
import { Fauna } from './world/fauna';
import { buildFarmstead } from './world/farmstead';
import { buildCrops } from './world/crops';
import { FarmLife } from './world/farmLife';
import { buildRoadFurniture } from './world/roadNetwork';
import { Foraging } from './world/foraging';
import { buildKingsRoad, WAYSTONES } from './world/kingsRoad';
import { buildTiles, prefetchTiles } from './world/tilePool';
import { Horses } from './world/horses';
import { Encounters } from './world/encounters';
import { Caravans } from './world/caravans';
import { setupRoadQuests } from './quests/roadQuests';
import { buildPortAurelle, PORT_SPOTS } from './world/portAurelle';
import { Fishing, type FishingSpot } from './world/fishing';
import { Duel } from './combat/duel';
import type { Look } from './npc/charBuilder';
import { setupAcademy } from './quests/academy';
import { setupLowerCity } from './quests/lowerCity';
import { Boats } from './world/boats';
import { RiverLife } from './world/riverLife';
import { PORT_QUESTS } from './quests/portQuests';
import { RIVER_LEVEL } from './world/terrainHeight';
import { road, distanceAlong } from './world/roadNetwork';
import { buildGlenLandmarks, LANDMARK_CLEARINGS } from './world/glenLandmarks';
import { QuestLog } from './quests/questLog';
import { setupElderGlenQuests } from './quests/elderGlenQuests';
import { QuestUI } from './ui/questUI';
import { glenNamedFolk } from './npc/glenNamed';
import { ITEMS } from './items/itemDefs';
import { buildGlenDressing, MARKET_SPOTS, NOTICEBOARD, WELL } from './world/glenDressing';
import { Weather } from './world/weather';
import { Precipitation } from './world/precipitation';
import { Ambience } from './audio/ambience';
import { NpcManager } from './npc/npcManager';
import { elderGlenFolk } from './npc/elderGlenFolk';
import { REGIONS } from './world/regionDefinitions';
import { Discovery } from './world/discovery';
import { WorldMapUI } from './ui/worldMap';
import { PerfOverlay } from './ui/perfOverlay';
import { regionAt, reliefAt, RELIEF } from './world/worldMap';
import { targets } from './combat/targets';
import { Ocean } from './world/sea/ocean';
import { GroundWindow } from './world/groundWindow';
import { SkillsUI } from './ui/skills';
import { DISC } from './paths/data';
import { mentorOptions } from './paths/mentors';
import { SkillRuntime } from './paths/skills';
import { skillIcon } from './ui/skillTree';
import { CharPreview } from './ui/charPreview';
import { events } from './core/events';
import { buildWorld } from './world/props';
import { FrontierRegion } from './world/frontier';
import { Grass } from './world/grass';
import { River } from './world/water';
import { Foliage } from './world/foliage';
import { StylizedNature } from './world/stylizedNature';
import { Flowers } from './world/flowers';
import { Rewards, XP_FOR_KIND } from './progression/progression';
import { DungeonMapUI } from './ui/dungeonMap';
import { Realm } from './dungeon/realm';
import { Town, NPCS } from './npc/town';
import { DialogueUI } from './ui/dialogue';
import { loadArmourKit } from './enemies/armourKit';
import { loadSave, writeSave, applySave, hasSave, clearSave } from './save';

const STEP = 1 / 60;

const bootTimes: Record<string, number> = {};
let bootLast = performance.now();
const mark = (k: string) => {
  const n = performance.now();
  bootTimes[k] = Math.round(n - bootLast);
  bootLast = n;
};
(window as any).__boot = bootTimes;

async function boot() {
  const container = document.getElementById('game')!;
  const r = new Renderer(container);
  initCompressedGltf(r.renderer);
  const input = new Input(r.renderer.domElement);
  await physics.init();
  r.useStylizedSky();
  mark('sky');
  await loadWorldMap();
  mark('worldmap');
  initTerrainData();
  mark('heights');
  const terrain = new Terrain(r.scene, r.renderer);
  mark('terrain');

  const player = new Player();
  const spawn = new THREE.Vector3(0, heightAt(0, 10), 10);
  terrain.warm(spawn);
  await player.init(r.scene, spawn);
  mark('player');
  const saveData = TEST_MODE && !location.search.includes('save') ? null : loadSave();
  if (saveData) applySave(player, saveData);
  else {
    setupLoadout(player.equip);
    // A new character starts full (max health depends on level and attributes).
    player.hp = player.maxHp;
    player.stamina = player.maxStamina;
    player.mana = player.maxMana;
  }

  const fx = new FX(r.scene, heightAt);
  const slimes = new BeastSpawner(r.scene, fx);
  if (TEST_MODE) slimes.enabled = false;
  const spells = new Spells(r.scene, fx, player);
  const skillRt = new SkillRuntime(r.scene, player, fx, spells);
  // The village leaves NPC spots, the guild and the stables open.
  const keepClear = [...NPCS.map((n) => new THREE.Vector2(n.pos[0], n.pos[1])), new THREE.Vector2(22, -12), new THREE.Vector2(48, -39)];
  const world = await buildWorld(r.scene, r.renderer, fx, keepClear);
  mark('world');
  const ground = new GroundWindow(terrain.splat);
  ground.prime(spawn);
  const grass = new Grass(r.scene, ground);
  grass.setSunDir(SUN_DIR);
  mark('grass');
  const river = new River(r.scene);
  mark('river');
  // Heights along the roads and across the port, computed in parallel first.
  await prefetchTiles(buildTiles());
  mark('tilePrefetch');
  const farm = buildFarmstead(r.scene, world.mats);
  mark('farmstead');
  const crops = buildCrops(r.scene);
  mark('crops');
  buildGlenDressing(r.scene, world.mats);
  mark('dressing');
  const kingsRoad = buildKingsRoad(r.scene, world.mats, fx);
  mark('kingsRoad');
  const port = buildPortAurelle(r.scene, world.mats, fx);
  mark('port');
  const stylizedNature = new StylizedNature(r.scene, r.renderer, world.village);
  stylizedNature.clearings = [...farm.clearings, ...crops.clearings, ...LANDMARK_CLEARINGS, ...kingsRoad.clearings, ...port.clearings];
  await stylizedNature.ready;
  mark('natureLoad');
  stylizedNature.warm(spawn, spawn);
  const foliage = stylizedNature.loaded ? null : new Foliage(r.scene, r.renderer);
  mark('foliage');
  mark('stylizedNature');
  const flowers = new Flowers(r.scene, ground);
  const ambient = new Ambient(r.scene, world.village.flowerSpots);
  const ocean = new Ocean(r.scene, SUN_DIR);
  // Living world: clock, weather, rain and snow, ambience, townsfolk.
  const time = new WorldTime();
  time.fromJSON(saveData?.world?.time);
  const weather = new Weather(20260929);
  weather.fromJSON(saveData?.world?.weather);
  const precip = new Precipitation(r.scene);
  const ambience = new Ambience();
  events.on('footstep', ({ at, surface }) => {
    if (realm?.mode === 'dungeon') return ambience.footstep('stone', false);
    const rel = reliefAt(at.x, at.z);
    ambience.footstep(surface, rel === RELIEF.snow || weather.p.snow > 0.5);
  });
  weather.onLightning = (s) => {
    r.lightning(s);
    ambience.thunderClap(s);
  };
  const npcs = new NpcManager(r.scene, time, r.renderer);
  {
    const folk = elderGlenFolk(world.village.houses);
    // Work spots from the farmstead and market square.
    const pl = folk.settlement.places;
    pl.set('market', { id: 'market', spots: MARKET_SPOTS, yaw: 0 });
    pl.set('mill', { id: 'mill', spots: farm.spots.mill });
    pl.set('pasture', { id: 'pasture', spots: farm.spots.pasture });
    // Quest givers and the guild's adventurers keep posts by day.
    const named = glenNamedFolk(farm.spots.mill[0]);
    for (const place of named.places) pl.set(place.id, place);
    npcs.addSettlement(folk.settlement);
    for (const rec of folk.records) npcs.add(rec);
    for (const rec of named.records) npcs.add(rec);
    // The King's Road: the Wayfarer's Rest, Millbrook, the chapel and the Lantern Camp.
    npcs.addSettlement(port.settlement);
    for (const rec of port.records) npcs.add(rec);
    for (const k of kingsRoad.settlements) {
      npcs.addSettlement(k.settlement);
      for (const rec of k.records) npcs.add(rec);
    }
  }
  // Livestock in their pens and pastures; wild deer and foxes stream per tile.
  const fauna = new Fauna(r.scene);
  fauna.addHerd('cow', 7, farm.ranges.cows);
  fauna.addHerd('bull', 1, farm.ranges.cows);
  fauna.addHerd('sheep', 12, farm.ranges.sheep);
  fauna.addHerd('alpaca', 2, farm.ranges.sheep);
  fauna.addHerd('horse', 3, farm.ranges.horses);
  fauna.addHerd('horse_white', 1, farm.ranges.horses);
  fauna.addHerd('donkey', 1, farm.ranges.horses);
  fauna.addHerd('pig', 5, farm.ranges.pigs);
  fauna.addHerd('chicken', 7, farm.ranges.chickens);
  fauna.addHerd('chick', 4, farm.ranges.chickens);
  fauna.addHerd('dog', 2, farm.ranges.dogs);
  fauna.addHerd('shiba', 1, farm.ranges.dogs);
  fauna.addHerd('horse', 3, kingsRoad.paddock);
  fauna.addHerd('horse_white', 1, kingsRoad.paddock);
  fauna.addHerd('sheep', 6, { center: new THREE.Vector3(600, 0, 34), radius: 22 });
  fauna.addHerd('cat', 3, { center: new THREE.Vector3(0, 0, -4), radius: 45 });
  fauna.addHerd('pigeon', 8, { center: new THREE.Vector3(0, 0, -4), radius: 14 });
  void ocean;
  mark('flowers');
  const rewards = new Rewards(r.scene, player.prog);
  events.on('enemyDied', ({ at, kind }) => {
    const [xp, gold] = XP_FOR_KIND[kind] ?? [10, 2];
    rewards.spawn(at, xp, gold);
  });
  events.on('bossSlam', ({ at }) => cam.shake(Math.max(0.15, 0.6 - at.distanceTo(player.pos) * 0.04)));
  events.on('levelUp', () => {
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    player.stamina = player.maxStamina;
    fx.add.spawn({ pos: player.center, spread: 3, count: 60, life: [0.6, 1.3], size: [0.1, 0.01], color: 0xcfe8ff, color2: 0x5a9cff, upBias: 1.5, drag: 1.5, jitter: 0.6 });
    save();
  });
  const physDebug = new URLSearchParams(location.search).get('debug') === 'physics' ? new PhysicsDebug(r.scene) : null;

  const cam = new ThirdPersonCamera(r.camera, input);
  cam.snapTo(player.pos);
  player.onShake = (a) => cam.shake(a);
  player.onPlungeLand = (at) => {
    fx.dust(at, 3);
    fx.add.spawn({ pos: at.clone().setY(at.y + 0.2), spread: 7, count: 30, life: [0.2, 0.5], size: [0.12, 0.02], color: 0xfff1c8, color2: 0xff9a3a, gravity: 6, upBias: 0.3 });
  };

  // ---- UI ------------------------------------------------------------------
  const hud = new HUD(player, r.camera);
  hud.resource = () => skillRt.resource();
  hud.skillSlot = (ref) => {
    const sk = SkillRuntime.parse(ref);
    if (!sk?.def) return null;
    const v = player.paths.node(sk.d.id, sk.n.id);
    const def = sk.def;
    const cost = def.mana ? `${skillRt.manaCost(def)}` : def.flow ? `${def.flow}F` : def.stamina ? `${def.stamina}` : '';
    const why = skillRt.blocked(ref);
    return {
      svg: skillIcon(sk.d.id, sk.d.color, sk.n.name, v?.r ?? 0),
      name: `${sk.n.name} (${sk.d.name})`,
      cost,
      cd: def.cd > 0 ? skillRt.cooldown(sk.key) / def.cd : 0,
      ready: !why || why === 'busy',
    };
  };
  events.on('pathsChanged', () => hud.markHotbarDirty());
  const preview = new CharPreview(r.renderer, r.scene, player, [r.sun, r.hemi]);
  const inv = new InventoryUI(player, preview);
  const skills = new SkillsUI(player);
  skills.runtime = skillRt;
  const mapUI = new DungeonMapUI();
  let frontier!: FrontierRegion;
  const realm = new Realm(r, player, cam, fx, hud, mapUI, {
    hide: (h) => {
      terrain.group.visible = !h;
      grass.mesh.visible = !h;
      ambient.setVisible(!h);
      ocean.setVisible(!h);
      precip.setVisible(!h);
      npcs.setVisible(!h);
      fauna.setVisible(!h);
      questUI?.setVisible(!h);
      foraging?.setVisible(!h);
      horses?.setVisible(!h);
      riverLife?.setVisible(!h);
      caravans?.setVisible(!h);
      encounters?.setVisible(!h);
      flowers.mesh.visible = !h;
      river.mesh.visible = !h;
      foliage?.setVisible(!h);
      stylizedNature.setVisible(!h && stylizedNature.loaded);
      town.setVisible(!h);
    },
    clearEnemies: () => { slimes.clear(); frontier?.dispose(); encounters?.clear(); },
    enemiesEnabled: (on) => (slimes.enabled = on && !TEST_MODE),
  }, rewards, world.crypt.door);
  const dialogue = new DialogueUI();
  const town = new Town(r.scene, r.camera, dialogue, player);
  town.mentorOptions = (spec, say) => mentorOptions(player.paths, spec, say, (m) => hud.toast(m));
  frontier = new FrontierRegion(
    r.scene, player, fx, dialogue, world.mats,
    (msg) => hud.toast(msg),
    () => town.guild.open('board'),
  );
  realm.overworldInteractables.push(...town.interactables(), ...frontier.interactables);
  realm.overworldInteractables.push(
    { pos: NOTICEBOARD, radius: 2.2, label: () => 'Read the noticeboard', enabled: () => true, action: () => town.guild.open('board') },
    {
      pos: WELL, radius: 2.2, label: () => 'Drink from the well', enabled: () => true,
      action: () => {
        player.stamina = player.maxStamina;
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.1);
        hud.toast('Cold, clear well water');
      },
    },
  );
  // Services offered by townsfolk (beds, shops, stables), keyed by NPC id.
  type FolkShow = (t: string, opts: { label: string; run: () => void }[]) => void;
  const folkServices = new Map<string, (show: FolkShow, back: () => void) => { label: string; run: () => void }[]>();
  folkServices.set('hester', (show, back) => [
    {
      label: 'Rent a bed until morning — 12g',
      run: () => {
        if (player.prog.gold < 12) return show('Twelve silver for a bed, love. Come back with coin.', [{ label: 'Back.', run: back }]);
        player.prog.addGold(-12);
        time.skipTo(7);
        player.hp = player.maxHp;
        player.mana = player.maxMana;
        player.stamina = player.maxStamina;
        save();
        show('You sleep like a stone and wake to birdsong and the smell of bacon. It is seven in the morning.', [{ label: 'Good morning.', run: () => dialogue.close() }]);
      },
    },
    {
      label: 'A bowl of hot stew — 4g',
      run: () => {
        if (player.prog.gold < 4) return show('Four coppers for the stew.', [{ label: 'Back.', run: back }]);
        player.prog.addGold(-4);
        player.hp = Math.min(player.maxHp, player.hp + 45);
        player.stamina = player.maxStamina;
        show('Thick with barley and Millbrook lamb. You feel it all the way down.', [{ label: 'Thanks.', run: back }]);
      },
    },
  ]);
  folkServices.set('zarek', () => [{
    label: 'Browse exotic wares',
    run: () => town.showShop('Zarek the Wanderer', 'Travelling Merchant', 'From the dunes of the Golden Expanse to the vineyards of Valoria: everything has a price, and my prices are fair.', [
      ['healthPotion', 22], ['manaPotion', 26], ['honeycomb', 14], ['duskbloom', 40], ['emberroot', 20], ['silverthistle', 16], ['pumpkinSeed', 5], ['ringSage', 230],
    ]),
  }]);
  // Townsfolk: one interactable that follows whoever is nearest.
  const folkTalk = {
    pos: new THREE.Vector3(0, -999, 0),
    radius: 2.4,
    npc: null as ReturnType<typeof npcs.nearest>,
    label() {
      return this.npc ? `Talk to ${this.npc.rec.name}` : '';
    },
    enabled() {
      return !!this.npc;
    },
    action() {
      const n = this.npc;
      if (!n) return;
      const title = n.rec.title ?? n.rec.job.charAt(0).toUpperCase() + n.rec.job.slice(1) + ' of Elder Glen';
      const back = () => folkTalk.action();
      const show = (t: string, opts: { label: string; run: () => void }[]) => dialogue.show(n.rec.name, title, t, opts);
      show(npcs.lineFor(n), [
        ...quests.options(n.rec.id, show, back),
        ...(folkServices.get(n.rec.id)?.(show, back) ?? []),
        ...town.sellOptions(n.rec.id, n.rec.name, title, back),
        { label: 'Farewell.', run: () => dialogue.close() },
      ]);
    },
  };
  realm.overworldInteractables.push(folkTalk);
  // ---- Farm life, landmarks and quests (World Expansion phase 3) ----------------------
  const countItem = (id: string) => player.equip.items.filter((i) => i.def.id === id).reduce((n, i) => n + i.qty, 0);
  const takeItem = (id: string, n: number) => {
    for (const it of [...player.equip.items]) {
      if (n <= 0) break;
      if (it.def.id !== id) continue;
      const k = Math.min(n, it.qty);
      it.qty -= k;
      n -= k;
      if (it.qty <= 0) player.equip.items.splice(player.equip.items.indexOf(it), 1);
    }
    events.emit('equipmentChanged', {});
  };
  const giveItem = (id: string, n: number) => {
    player.equip.add(id, n);
    hud.toast(`+${n} ${ITEMS[id].name}`);
    events.emit('equipmentChanged', {});
  };
  const gameHours = () => time.day * 24 + time.hour;
  const farmLife = new FarmLife(r.scene, player, time, fauna, fx, (m) => hud.toast(m), world.mats, crops.orchards,
    [[4, 150, 72, 38], [-48, 211, 72, 46], [145, 208, 76, 44]]);
  const livestock = farmLife.livestockInteractable();
  const landmarks = buildGlenLandmarks(r.scene, world.mats, giveItem, gameHours);
  town.guild.inventory = { count: countItem, take: takeItem };
  // ---- The road network and foraging (phase 4) ----------------------------------------
  const roads = buildRoadFurniture(r.scene, world.mats, (who, title, text) => dialogue.show(who, title, text, [{ label: 'Turn back.', run: () => dialogue.close() }]));
  const foraging = new Foraging(r.scene, giveItem, gameHours, () => time.hour);
  foraging.fromJSON(saveData?.world?.forage);
  const serviceNpc = (id: string) => town.npcs.find((n) => n.spec.id === id) ?? null;
  const quests = new QuestLog({
    count: countItem,
    take: takeItem,
    give: giveItem,
    gold: (n) => player.prog.addGold(n),
    xp: (n) => player.prog.addXp(n),
    guildRep: (n) => town.guild.addRep(n),
    toast: (m) => hud.toast(m),
    npcPos: (id) => serviceNpc(id)?.pos ?? npcs.find(id)?.pos ?? null,
    hour: () => time.hour,
  });
  const glenQuests = setupElderGlenQuests({
    quests, scene: r.scene, fx, player, time, fauna, cowRange: farm.ranges.cows, farm, npcs, beasts: slimes,
    count: countItem, take: takeItem, give: giveItem, toast: (m) => hud.toast(m),
  });
  town.questOptions = (id, show, back) => quests.options(id, show, back);
  // ---- Road encounters, caravans and the King's Road quests (phase 4) ------------------
  const encounters = new Encounters(r.scene, player, slimes, fx);
  encounters.enabled = !TEST_MODE;
  encounters.onTalk = (name, title, text, shop) => dialogue.show(name, title, text, [
    ...(shop ? [{ label: 'Browse wares', run: () => town.showShop(name, title, 'Rope, rations and remedies. Road prices, but honest ones.', [['healthPotion', 24], ['manaPotion', 28], ['brambleBerries', 4], ['wheatSeed', 4], ['carrotSeed', 4]]) }] : []),
    { label: 'Safe travels.', run: () => dialogue.close() },
  ]);
  const caravans = new Caravans(r.scene, world.mats, time);
  // ---- Port Aurelle: fishing, the Academy's duels, the expedition, services (phase 5) ----
  const fishing = new Fishing(r.scene, player, () => time.hour, () => weather.p);
  fishing.fromJSON(saveData?.world?.fishing);
  fishing.onMessage = (m) => hud.toast(m);
  fishing.onCatch = (c) => {
    player.equip.add(c.id, 1);
    events.emit('equipmentChanged', {});
    quests.signal('fish-caught');
    save();
  };
  fishing.onToggle = (on) => { if (on && player.mounted) horses.dismount(); };
  const sellFish = () => {
    const gold = fishing.sellAll(countItem, takeItem);
    if (gold) player.prog.addGold(gold);
    return gold;
  };
  const riverSpots: FishingSpot[] = [-150, -60, 60, 200, 300].map((z) => {
    const rx = riverX(z);
    return { pos: new THREE.Vector3(rx - 9, heightAt(rx - 9, z), z), water: new THREE.Vector3(rx - 2, RIVER_LEVEL, z), kind: 'river' as const, name: 'The Elder Glen river' };
  });
  const fishingSpots = [...port.fishingSpots, ...riverSpots];
  realm.overworldInteractables.push(...fishingSpots.map((spot) => ({
    pos: spot.pos, radius: 2.2,
    label: () => (fishing.active ? '' : countItem('fishingRod') ? `Fish here (${spot.name})` : 'A good fishing spot — you need a rod (Dockmaster Mira)'),
    enabled: () => !fishing.active && countItem('fishingRod') > 0,
    action: () => fishing.start(spot),
  })));
  const duel = new Duel(r.scene, encounters.bolts, player);
  let duelWin: (() => void) | null = null;
  const ringAt = PORT_SPOTS.academyRing.clone().setY(heightAt(PORT_SPOTS.academyRing.x, PORT_SPOTS.academyRing.z));
  /** A sparring bout in the Academy ring; `onWin` runs if the player wins. */
  const bout = (spec: { name: string; look: Look; hp: number; damage?: number; pace?: number }, onWin: () => void) => {
    if (player.mounted) horses.dismount();
    duelWin = onWin;
    duel.start({ ...spec, ring: ringAt, radius: 9 });
    hud.toast(`${spec.name}: "Blades up. Begin!"`);
  };
  const startDuel = (who: 'hadrik' | 'dorian') => {
    const rec = npcs.find(who)?.rec;
    bout({ name: rec?.name ?? (who === 'hadrik' ? 'Ser Hadrik Vane' : 'Cadet Dorian Vale'), look: rec!.look, hp: who === 'hadrik' ? 260 : 220 }, () => quests.signal(who === 'hadrik' ? 'trial-won' : 'rival-won'));
  };
  duel.onEnd = (won, reason) => {
    hud.toast(reason);
    const f = duelWin;
    duelWin = null;
    if (won) f?.();
  };
  quests.add(...PORT_QUESTS);
  quests.hooks.set('duel:hadrik', () => startDuel('hadrik'));
  quests.hooks.set('duel:dorian', () => startDuel('dorian'));
  quests.hooks.set('fishing:rod', () => {
    if (!countItem('fishingRod')) giveItem('fishingRod', 1);
  });
  quests.hooks.set('dwarves:sailing', () => {
    const d = Number(worldFlags.expeditionDay ?? 0);
    if (d < time.day + 1) worldFlags.expeditionDay = time.day + 3;
    hud.toast(`The Iron Kettle sails on day ${worldFlags.expeditionDay} at 8:00.`);
  });
  realm.overworldInteractables.push(
    {
      pos: ringAt, radius: 10,
      label: () => {
        if (duel.active) return '';
        if (quests.wants('trial-won')) return 'Step into the ring (Ser Hadrik)';
        if (quests.wants('rival-won')) return 'Step into the ring (Dorian Vale)';
        const b = academy.nextBout();
        return b.ok ? `Ladder bout: ${b.rung!.name}` : '';
      },
      enabled: () => !duel.active && (quests.wants('trial-won') || quests.wants('rival-won') || academy.nextBout().ok),
      action: () => (quests.wants('trial-won') ? startDuel('hadrik') : quests.wants('rival-won') ? startDuel('dorian') : academy.fight()),
    },
    {
      pos: PORT_SPOTS.berth.clone().setY(1), radius: 5,
      label: () => {
        if (!quests.wants('expedition-sails')) return '';
        const d = Number(worldFlags.expeditionDay);
        return time.day === d && time.hour >= 7.5 && time.hour < 10.5 ? 'Board the Iron Kettle' : `The Iron Kettle sails on day ${d} at 8:00 (today is day ${time.day})`;
      },
      enabled: () => quests.wants('expedition-sails') && time.day === Number(worldFlags.expeditionDay) && time.hour >= 7.5 && time.hour < 10.5,
      action: () => {
        quests.signal('expedition-sails');
        dialogue.show('Bruni Stonevein', 'Dwarven Expedition Leader', 'There you are! Stow your pack below and grab a rope. North to the White Mountains — and may the stone be kind to us.', [{ label: 'Cast off.', run: () => dialogue.close() }]);
      },
    },
  );
  // Port services.
  const shop = (id: string, intro: string, stock: [string, number][]) => {
    const rec = npcs.find(id)?.rec;
    town.showShop(rec?.name ?? id, rec?.title ?? '', intro, stock);
  };
  folkServices.set('nell', () => [{
    label: 'Sell my fish (by weight)',
    run: () => {
      const g = sellFish();
      dialogue.show('Old Nell Crabbe', 'Fish Market', g ? `Lovely fat fish. ${g} gold, and not a copper less.` : 'You\'ve nothing I can sell, dearie. Catch something first!', [{ label: 'Farewell.', run: () => dialogue.close() }]);
    },
  }]);
  folkServices.set('guildmaster', () => [{ label: 'See the guild board', run: () => { dialogue.close(); town.guild.open('board'); } }]);
  const riverLife = new RiverLife(r.scene, fx);
  const boats = new Boats(r.scene, player);
  boats.onFish = (spot) => fishing.start(spot);
  realm.overworldInteractables.push(...boats.interactables);
  folkServices.set('mira', () => [
    { label: 'Buy a fishing rod — 20g', run: () => { if (player.prog.gold >= 20) { player.prog.addGold(-20); giveItem('fishingRod', 1); } dialogue.close(); } },
    {
      label: 'Hire a rowing boat — 5g',
      run: () => {
        if (player.prog.gold < 5) return dialogue.close();
        player.prog.addGold(-5);
        dialogue.close();
        if (player.mounted) horses.dismount();
        boats.launch(new THREE.Vector3(2998, 0, 292), Math.PI / 2);
        hud.toast('WASD to row, Shift to pull hard. E near land to step ashore; E in deep water to fish.');
      },
    },
  ]);
  folkServices.set('ragna', () => [{ label: 'Browse Port steel', run: () => shop('ragna', 'Aurelle-folded steel. Heavier purse, lighter grave.', [['knightSword', 110], ['kiteShield', 90], ['armingSword', 55], ['roundShield', 50]]) }]);
  folkServices.set('quill', () => [{ label: 'Browse fine draughts', run: () => shop('quill', 'Twice the strength of a village draught. Half the taste.', [['healthPotion', 18], ['manaPotion', 22], ['greaterHealthPotion', 55], ['greaterManaPotion', 60]]) }]);
  folkServices.set('sabeth', () => [{ label: 'Browse rings and charms', run: () => shop('sabeth', 'Every ring is a promise. Choose yours.', [['ringSage', 200]]) }]);
  folkServices.set('bruni', () => [{ label: "Buy a miner's lantern — 35g", run: () => { if (player.prog.gold >= 35) { player.prog.addGold(-35); giveItem('minersLantern', 1); } dialogue.close(); } }]);
  folkServices.set('bess', (show, back) => [{
    label: 'A room for the night — 15g',
    run: () => {
      if (player.prog.gold < 15) return show('Fifteen, sailor. The rats are free, the bed is not.', [{ label: 'Back.', run: back }]);
      player.prog.addGold(-15);
      time.skipTo(7);
      player.hp = player.maxHp;
      player.mana = player.maxMana;
      player.stamina = player.maxStamina;
      save();
      show('You sleep to the creak of ropes and the cry of gulls. It is seven in the morning.', [{ label: 'Good morning.', run: () => dialogue.close() }]);
    },
  }]);
  const roadQuests = setupRoadQuests({
    quests, scene: r.scene, player, mats: world.mats, encounters, beasts: slimes, toast: (m) => hud.toast(m),
    talk: (who, title, text, opts) => dialogue.show(who, title, text, opts), close: () => dialogue.close(),
  });
  // ---- Horses and coaches -------------------------------------------------------------
  const horses = new Horses(r.scene, player, (m) => hud.toast(m));
  horses.fromJSON(saveData?.world?.horses, new THREE.Vector3(52, 0, -34));
  horses.onChange = () => save();
  const glenYard = new THREE.Vector3(52, 0, -34);
  const kr = road('kings');
  const stops = [
    { id: 'elderGlen', name: 'Elder Glen', pos: glenYard, along: 0 },
    { id: 'waystation', name: "The Wayfarer's Rest", pos: kingsRoad.stableYard, along: distanceAlong(kr, kingsRoad.stableYard.x, kingsRoad.stableYard.z) },
    { id: 'portAurelle', name: 'Port Aurelle (West Gate)', pos: PORT_SPOTS.stable, along: distanceAlong(kr, 2690, 150) },
  ];
  const coachOptions = (here: string, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) => {
    const from = stops.find((s) => s.id === here)!;
    const known = stops.filter((s) => s.id !== here && (s.id === 'elderGlen' || discovery.places.get(s.id) === 'visited'));
    if (!known.length) return [];
    return [{
      label: 'Take the coach',
      run: () => show('The coach leaves on the hour. Where to?', [
        ...known.map((to) => {
          const dist = Math.abs(to.along - from.along);
          const fare = Math.max(5, Math.round(dist / 90));
          const hours = dist / 6 / 120; // six metres a second; one game hour is two real minutes
          return {
            label: `${to.name} — ${fare}g, about ${Math.max(1, Math.round(hours * 2) / 2)} hours`,
            run: () => {
              if (player.prog.gold < fare) return show(`That's ${fare} gold, friend.`, [{ label: 'Back.', run: back }]);
              player.prog.addGold(-fare);
              if (player.mounted) horses.dismount();
              dialogue.close();
              const h = (time.hour + hours) % 24;
              time.skipTo(h);
              player.teleport(to.pos.clone().setY(heightAt(to.pos.x, to.pos.z) + 0.5));
              hud.toast(`The coach rattles into ${to.name}.`);
              save();
            },
          };
        }),
        { label: 'Not now.', run: back },
      ]),
    }];
  };
  const stableFor = (id: string, yard: THREE.Vector3, stop: string) => (show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) =>
    [...horses.stableOptions(yard, show, back, () => player.prog.gold, (n) => player.prog.addGold(-n)), ...coachOptions(stop, show, back)];
  town.serviceOptions = (id, show, back) => (id === 'stablemaster' ? stableFor(id, glenYard, 'elderGlen')(show, back) : []);
  folkServices.set('dunmore', stableFor('dunmore', kingsRoad.stableYard, 'waystation'));
  folkServices.set('hobbs', stableFor('hobbs', PORT_SPOTS.stable, 'portAurelle'));
  realm.overworldInteractables.push(encounters.interactable, ...roadQuests.interactables, horses.interactable, ...roads.interactables, foraging.interactable, ...farmLife.interactables, livestock, ...landmarks.interactables, ...glenQuests.interactables);
  const questNpcIds = [...town.npcs.map((n) => n.spec.id), ...npcs.npcs.filter((n) => n.rec.named).map((n) => n.rec.id)];
  const questUI = new QuestUI(quests, hud, r.camera, (id) => {
    const svc = serviceNpc(id);
    if (svc) return svc.root.visible ? svc.head : null;
    const f = npcs.find(id);
    return f && !f.hidden ? f.pos.clone().setY(f.pos.y + (f.rec.look.height ?? 1.75)) : null;
  }, () => questNpcIds);
  questUI.onToggle = (open) => {
    input.uiMode = open || inv.open || mapUI.open || dialogue.open;
    if (open) input.exitLock();
    else if (!inv.open && !mapUI.open && !dialogue.open) input.requestLock();
  };
  events.on('questChanged', () => save());
  events.on('equipmentChanged', () => questUI.refresh());
  farmLife.fromJSON(saveData?.world?.farm);
  landmarks.fromJSON(saveData?.world?.landmarks);
  ground.prime(player.pos); // pick up the new grass masks (plot, coop, quarry)
  player.onTeleport = (p) => {
    if (realm.mode === 'dungeon') return;
    terrain.warm(p);
    ground.prime(p);
    stylizedNature.warm(p, p);
  };
  // Resume where the player left off in the overworld (v6 saves).
  const resume = saveData?.world?.pos;
  if (resume && !TEST_MODE) player.teleport(new THREE.Vector3(resume[0], Math.max(resume[1], heightAt(resume[0], resume[2])) + 0.2, resume[2]));
  dialogue.onToggle = (open) => {
    input.uiMode = open || inv.open || skills.open || mapUI.open;
    if (open) input.exitLock();
    else input.requestLock();
  };
  if (saveData) {
    realm.progress = saveData.dungeon;
    realm.maps = saveData.maps;
  }
  // Exploration: fog of war, regions and places (saved), the world map and minimap.
  const discovery = new Discovery();
  if (saveData) discovery.fromJSON(saveData.world?.discovery);
  const worldMap = new WorldMapUI(discovery);
  worldMap.questMarkers = () => quests.markers().map((m) => ({ x: m.x, z: m.z, kind: 'quest' as const, label: m.label }));
  const worldFlags: Record<string, boolean | number | string> = saveData?.world?.flags ?? {};
  // Waystones: touching one attunes it; once Magus Orren has explained the Sunwheel
  // (The Sunwheel quest), attuned stones carry you between each other.
  realm.overworldInteractables.push(...WAYSTONES.map((w) => ({
    pos: w.pos, radius: 2.4,
    label: () => (quests.isDone('the-sunwheel') ? 'Travel by waystone' : worldFlags['way:' + w.id] ? 'The waystone hums under your hand' : 'Touch the waystone'),
    enabled: () => true,
    action: () => {
      const first = !worldFlags['way:' + w.id];
      worldFlags['way:' + w.id] = true;
      if (!quests.isDone('the-sunwheel')) {
        dialogue.show('A Waystone', w.name, first
          ? 'A grey stone older than the road, carved on both faces with the Sunwheel. As your palm touches it the carving warms and glows faintly blue, as if it has remembered you. Magus Orren in Elder Glen might know what these are.'
          : 'The Sunwheel glows at your touch, but nothing more happens. Something is still missing.', [{ label: 'Step back.', run: () => dialogue.close() }]);
        save();
        return;
      }
      const others = WAYSTONES.filter((o) => o.id !== w.id && worldFlags['way:' + o.id]);
      dialogue.show('A Waystone', w.name, others.length ? 'The Sunwheel blazes blue. Other stones you have touched answer from far away.' : 'The Sunwheel blazes blue, but no other stone you have touched answers yet.', [
        ...others.map((o) => ({
          label: `Travel to ${o.name}`,
          run: () => {
            dialogue.close();
            if (player.mounted) horses.dismount();
            fx.add.spawn({ pos: player.center, spread: 1.2, count: 60, life: [0.4, 0.9], size: [0.1, 0.02], color: 0xbfe8ff, color2: 0x5a9cff, upBias: 1.4 });
            const to = o.pos.clone().add(new THREE.Vector3(2.2, 0.5, 0));
            player.teleport(to.setY(heightAt(to.x, to.z) + 0.5));
            time.skipTo((time.hour + 0.25) % 24);
            hud.toast(`The waystone at ${o.name} lets you go.`);
            save();
          },
        })),
        { label: 'Not now.', run: () => dialogue.close() },
      ]);
    },
  })));
  // ---- The Academy's ranks, ladder, examination and dormitory; the Quiet Hands' den ----
  const academy = setupAcademy({
    quests, player, time, flags: worldFlags, lookOf: (id) => npcs.find(id)?.rec.look,
    close: () => dialogue.close(), toast: (m) => hud.toast(m), save: () => save(), bout,
    dormitory: PORT_SPOTS.dormitory.clone().setY(heightAt(PORT_SPOTS.dormitory.x, PORT_SPOTS.dormitory.z)),
  });
  for (const [id, opts] of academy.services) folkServices.set(id, opts);
  const lowerCity = setupLowerCity({
    quests, player, flags: worldFlags,
    door: PORT_SPOTS.thievesDoor.clone().setY(heightAt(PORT_SPOTS.thievesDoor.x, PORT_SPOTS.thievesDoor.z)),
    talk: (who, title, text, opts) => dialogue.show(who, title, text, opts), close: () => dialogue.close(),
    shop: (who, title, intro, stock) => town.showShop(who, title, intro, stock),
    sell: (back) => town.sellOptions('nix', 'Nix the Fence', 'Black Market of the Quiet Hands', back),
    save: () => save(),
  });
  realm.overworldInteractables.push(...academy.interactables, ...lowerCity.interactables);
  // Restore quests only now: every quest (Elder Glen, the road, the port) is registered
  // and the world their stage hooks touch (flags, NPCs, spawners) exists.
  quests.fromJSON(saveData?.world?.quests);
  events.on('mapRevealed', () => worldMap.markFogDirty());
  events.on('regionEntered', ({ name, subtitle, first }) => {
    regionName = name;
    if (started) hud.regionCard(name, subtitle, first);
    if (first) save();
  });
  events.on('placeDiscovered', ({ name }) => {
    hud.toast('Discovered: ' + name);
    player.prog.addXp(25);
    save();
  });
  let regionName = 'Elder Glen';
  const perfOverlay = new URLSearchParams(location.search).has('perf')
    ? new PerfOverlay({
      renderer: r.renderer,
      terrainTiles: () => terrain.tileCount,
      vegetationTiles: () => stylizedNature.tileCount,
      physicsBodies: () => physics.world.bodies.len(),
      actors: () => targets.size,
      region: () => (realm.mode === 'dungeon' ? 'dungeon' : regionAt(player.pos.x, player.pos.z)),
      position: () => player.pos,
    })
    : null;
  worldMap.onToggle = (open) => {
    input.uiMode = open || inv.open || mapUI.open || dialogue.open;
    if (open) input.exitLock();
    else if (!inv.open && !mapUI.open && !dialogue.open) input.requestLock();
  };
  const save = () => {
    if (TEST_MODE && !location.search.includes('save')) return;
    const pos = realm.mode === 'overworld' ? ([+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)] as [number, number, number]) : saveData?.world?.pos;
    writeSave(player, realm.seed, realm.maps, realm.progress, town.guild.toJSON(), { discovery: discovery.toJSON(), flags: worldFlags, pos, time: time.toJSON(), weather: weather.toJSON(), quests: quests.toJSON(), farm: farmLife.toJSON(), landmarks: landmarks.toJSON(), forage: foraging.toJSON(), horses: horses.toJSON(), fishing: fishing.toJSON() });
  };
  if (saveData) town.guild.fromJSON(saveData.guild);
  realm.onSave = save;
  town.guild.onSave = save;
  town.guild.onToggle = (open) => {
    input.uiMode = open || inv.open || mapUI.open || dialogue.open;
    if (open) input.exitLock();
    else if (!inv.open && !mapUI.open && !dialogue.open) input.requestLock();
  };
  mapUI.onChange = save;
  events.on('progressChanged', save);
  window.addEventListener('beforeunload', save);
  setInterval(save, 30000);
  mapUI.onToggle = (open) => {
    input.uiMode = open || inv.open || skills.open;
    if (open) input.exitLock();
    else input.requestLock();
  };
  inv.onQuickDrop = (slot, uid) => hud.onSlotDrop?.('items', slot, uid);
  let started = TEST_MODE;
  // Paused only when the player releases the mouse with Esc; the pause
  // overlay is always visible while paused, so the game never freezes silently.
  let pausedByUser = false;
  let hadLock = false;
  const music = new Music();
  const overlays = buildOverlays((origin) => {
    if (origin) player.prog.origin = origin;
    started = true;
    music.start();
    ambience.start();
    pausedByUser = false;
    input.fallbackLook = true;
    input.requestLock();
  }, player.prog.origin, music);
  input.onLockFailed = () => hud.toast('Mouse not captured: click the game to capture it');
  if (TEST_MODE) overlays.start.classList.add('hidden');
  hud.onSlotDrop = (mode, slot, ref) => {
    const eq = player.equip;
    const uid = typeof ref === 'number' ? ref : 0;
    const it = typeof ref === 'number' ? eq.get(ref) : undefined;
    if (typeof ref === 'number' && !it) return;
    // Quick items take consumables; the moveset takes spells and learned martial moves.
    if (mode === 'items' && typeof ref === 'number' && it?.def.kind === 'consumable' && slot < eq.quick.length) {
      eq.quick = eq.quick.map((u) => (u === uid ? null : u));
      eq.quick[slot] = uid;
    } else if (mode === 'moves' && typeof ref === 'number' && it?.def.kind === 'spell') {
      eq.moves = eq.moves.map((u) => (u === ref ? null : u));
      eq.moves[slot] = ref;
    } else if (mode === 'moves' && typeof ref === 'string' && ref.startsWith('skill:')) {
      eq.moves = eq.moves.map((u) => (u === ref ? null : u));
      eq.moves[slot] = ref;
    } else hud.toast(mode === 'items' ? 'Quick slots take potions and other usables' : 'The moveset takes spells and learned martial moves');
    hud.markHotbarDirty();
  };
  inv.onToggle = (open) => {
    if (open) skills.toggle(false);
    document.body.classList.toggle('inv-open', open);
    input.uiMode = open || skills.open;
    if (open) input.exitLock();
    else if (!skills.open) input.requestLock();
  };
  skills.onToggle = (open) => {
    if (open) inv.toggle(false);
    document.body.classList.toggle('inv-open', open);
    input.uiMode = open || inv.open;
    if (open) input.exitLock();
    else if (!inv.open) input.requestLock();
    if (!open) save();
  };
  const pause = () => {
    if (!started || TEST_MODE || inv.open || skills.open) return;
    pausedByUser = true;
    overlays.showPaused(true);
  };
  if (!TEST_MODE && hasSave()) {
    overlays.lockOrigin();
    const cta = overlays.start.querySelector('.cta')!;
    cta.textContent = 'CLICK TO CONTINUE';
    const nw = document.createElement('button');
    nw.className = 'newgame';
    nw.textContent = 'Start a new game';
    nw.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Start over? Your progress and drawn maps will be erased.')) return;
      window.removeEventListener('beforeunload', save);
      clearSave();
      location.reload();
    });
    cta.after(nw);
  }
  document.addEventListener('pointerlockchange', () => {
    if (input.locked) hadLock = true;
    // Losing a lock we had (Esc, alt-tab) pauses; a lock that never took doesn't.
    else if (hadLock && !input.uiMode && !inv.open && !mapUI.open && !dialogue.open) {
      hadLock = false;
      pause();
    }
  });
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Escape' || e.code === 'KeyM') && worldMap.open) {
      worldMap.toggle(false);
      // This press must not reach the simulation and reopen the map. (Input's
      // own listener was registered first, so the press is already queued.)
      input.consume(e.code);
      return;
    }
    if (e.code === 'Escape' && (dialogue.open || mapUI.open || inv.open || skills.open)) return;
    if (e.code === 'Escape' && !input.locked && !inv.open && !skills.open && !mapUI.open && !dialogue.open && !pausedByUser) pause();
  });

  const useHotbar = (i: number) => {
    const eq = player.equip;
    if (player.dead) return;
    if (hud.mode === 'items') {
      const it = eq.get(eq.quick[i]);
      if (!it) return;
      hud.pulseSlot(i);
      if (it.def.kind === 'consumable') player.useConsumable(it.uid);
      hud.markHotbarDirty();
    } else {
      const ref = eq.moves[i];
      if (typeof ref === 'string') {
        const why = skillRt.use(ref);
        if (why && why !== 'busy') hud.toast(why);
        else if (!why) hud.pulseSlot(i);
        return;
      }
      if (ref == null) return;
      const it = eq.get(ref);
      if (!it) return;
      hud.pulseSlot(i);
      player.useMove(ref);
      hud.markHotbarDirty();
    }
  };

  events.on('playerDied', () => {
    setTimeout(() => {
      const at = realm.respawnPoint;
      player.respawn(at);
      cam.snapTo(at);
    }, 4200);
  });

  // Nudge the player when they can afford their active class's next level.
  let couldLevel = player.paths.canInvest(player.paths.active);
  events.on('progressChanged', () => {
    const P = player.paths, can = P.canInvest(P.active);
    if (can && !couldLevel && !skills.open) hud.toast(`Enough XP to raise ${DISC[P.active].name} · press K`);
    couldLevel = can;
  });

  // ---- loop -----------------------------------------------------------------
  let hitStop = 0;
  let paused = false;
  let simSteps = 0;
  player.onHitStop = (s) => (hitStop = Math.max(hitStop, s));

  let acc = 0;
  let last = performance.now();
  // Test runs on a software rasteriser (headless CI) can stall for seconds while
  // the GPU process draws, and the tests measure the world in real seconds.
  // There, draw only a few frames a second and let the simulation catch up
  // across long frames instead of slowing down.
  const CATCH_UP = LEAN_TEST;
  const MAX_FRAME_MS = CATCH_UP ? 8000 : 100;
  const MAX_STEPS = CATCH_UP ? 480 : 5;
  let lastDraw = -1e9;
  let fpsAcc = 0, fpsFrames = 0;
  const renderPos = new THREE.Vector3();
  const slotActions = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'] as const;

  /** One fixed simulation step (tests can also drive it directly: __game.stepSim). */
  const simStep = () => {
    simSteps++;
    if (input.wasPressed('inventory')) inv.toggle();
    if (input.wasPressed('skills')) skills.toggle();
    if (input.wasPressed('help')) overlays.toggleHelp();
    if (input.wasPressed('toggleBar')) hud.setMode(hud.mode === 'items' ? 'moves' : 'items');
    if (input.wasPressed('map')) {
      if (realm.mode === 'dungeon') mapUI.toggle();
      else worldMap.toggle();
    }
    slotActions.forEach((a, i) => input.wasPressed(a) && useHotbar(i));
    player.update(STEP, input, cam);
    skillRt.update(STEP);
    if (realm.mode === 'overworld') {
      slimes.update(STEP, player);
      frontier.update(STEP);
      encounters.update(STEP, time.hour, weather.p.rain);
      duel.update(STEP);
    }
    realm.update(STEP);
    rewards.update(STEP, player.center);
    // Interaction: nearest enabled thing in reach.
    let best: (typeof realm.interactables)[number] | null = null;
    let bestD = Infinity;
    if (!player.dead && !player.act) {
      for (const it of realm.interactables) {
        if (!it.enabled()) continue;
        const d = it.pos.distanceTo(player.pos.clone().setY(it.pos.y));
        if (d < it.radius && d < bestD) {
          bestD = d;
          best = it;
        }
      }
    }
    hud.prompt(best ? best.label() : null);
    if (dialogue.open) hud.prompt(null);
    else if (best && input.wasPressed('interact')) best.action();
    spells.update(STEP);
    world.update(STEP);
    river.update(STEP);
    fx.update(STEP, r.renderer.domElement.height, r.camera.fov);
    physics.step(STEP);
    input.endStep();
  };
  const perf = { sim: 0, render: 0, frame: 0 };
  const frame = (now: number) => {
    // Ask for the next frame first: an exception in one system is reported but
    // does not stop the game loop.
    requestAnimationFrame(frame);
    const t0 = performance.now();
    // rAF timestamps can precede `last` after a long stall (shader compiles), so
    // clamp at 0 as well as capping big gaps.
    const dtMs = Math.max(0, Math.min(MAX_FRAME_MS, now - last));
    last = now;
    const dt = dtMs / 1000;
    music.setZone(realm.mode === 'dungeon' ? 'crypt' : 'village');
    music.update(dt);
    // Pause the world while the title/pause overlay is up (never in tests).
    const overlayUp = !TEST_MODE && (!started || pausedByUser);
    // Hit-stop is a brief slow-motion rather than a hard freeze.
    const timeScale = hitStop > 0 ? 0.1 : 1;
    hitStop = Math.max(0, hitStop - dt);
    const simDt = dt * timeScale;
    acc += simDt;
    let steps = 0;
    if (paused || overlayUp || mapUI.open || worldMap.open) acc = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      acc -= STEP;
      steps++;
      simStep();
    }
    if (steps >= MAX_STEPS) acc = 0;
    const t1 = performance.now();

    const alpha = acc / STEP;
    if (!paused) player.present(alpha, overlayUp ? 0 : simDt);
    renderPos.copy(player.char.root.position);
    if (!paused) realm.present(alpha, overlayUp || mapUI.open ? 0 : simDt);
    cam.update(dt, renderPos, player.sprinting);
    r.camera.getWorldDirection(player.aimDir);
    ground.update(r.camera.position);
    grass.update(dt, r.camera.position, renderPos);
    ambient.update(dt, r.camera.position, now / 1000);
    ocean.update(dt, r.camera.position);
    // Time of day and weather drive the sky, light, water, grass and sound.
    const worldRunning = !(paused || overlayUp || mapUI.open || worldMap.open || questUI.open);
    if (worldRunning) time.update(dt);
    const here = realm.mode === 'dungeon' ? 'cresha' : regionAt(player.pos.x, player.pos.z);
    weather.update(worldRunning ? dt : 0, here === 'ocean' ? 'portAurelle' : here);
    const ts = time.state, wp = weather.p;
    if (realm.mode === 'overworld') {
      r.applyTime(dt, ts, wp);
      precip.update(dt, r.camera.position, wp);
      ocean.setConditions(wp.wind, ts.zenith, ts.horizon, wp.cloud, ts.night);
      grass.setWind(0.45 + wp.wind * 1.35);
      terrain.setWet(wp.wet);
      ambient.setNight(ts.night);
      world.mats.glass instanceof THREE.MeshStandardMaterial && (world.mats.glass.emissiveIntensity = 0.28 + ts.night * 2.4);
      world.village.lanternMat.emissiveIntensity = 0.6 + ts.night * 2.6;
      npcs.raining = wp.rain > 0.45;
      if (worldRunning) npcs.update(dt, player.pos, r.camera.position, ts.night);
      if (worldRunning) fauna.update(dt, player.pos, ts.night);
      farm.update(dt, wp.wind);
      crops.setWind(wp.wind);
      crops.update(dt);
      farmLife.update(worldRunning ? dt : 0);
      livestock.update(player.pos);
      landmarks.update(dt, ts.night, gameHours());
      foraging.update(dt, player.pos);
      kingsRoad.update(dt, ts.night);
      horses.update(dt);
      caravans.update(dt, player.pos);
      port.update(dt, ts.night);
      boats.update(dt);
      if (worldRunning) riverLife.update(dt, player.pos, player.sprinting, ts.night);
      fishing.update(dt);
      // The expedition waits a week if you miss the tide.
      if (quests.wants('expedition-sails') && (time.day > Number(worldFlags.expeditionDay) || (time.day === Number(worldFlags.expeditionDay) && time.hour >= 10.5))) {
        worldFlags.expeditionDay = time.day + 7;
        hud.toast('You missed the Iron Kettle. Bruni will sail again in a week.');
      }
      if (worldRunning) roadQuests.update(dt);
      if (worldRunning) {
        quests.update(dt, player.pos);
        glenQuests.update(dt);
      }
      questUI.update();
      folkTalk.npc = npcs.nearest(player.pos);
      if (folkTalk.npc) folkTalk.pos.copy(folkTalk.npc.pos);
      else folkTalk.pos.set(0, -999, 0);
    }
    const riverNear = Math.max(0, 1 - Math.abs(player.pos.x - riverX(player.pos.z)) / 40) * (Math.abs(player.pos.z) < 420 ? 1 : 0);
    const def = REGIONS[here];
    ambience.update(dt, def?.ambience ?? 'meadow', ts.night, wp, { river: riverNear * 0.7 }, realm.mode === 'dungeon');
    worldMap.setRegionLabel(`${regionName} · ${time.label.split(', ')[1]}`);
    flowers.update(dt, r.camera.position);
    if (realm.mode === 'overworld') terrain.update(r.camera.position, player.pos);
    foliage?.update(dt, r.camera.position);
    if (realm.mode === 'overworld') stylizedNature.update(dt, r.camera.position, player.pos);
    input.endFrame();
    hud.update(dt, player.lock?.id ?? null);
    mapUI.update();
    if (realm.mode === 'overworld') discovery.update(player.pos);
    worldMap.update(dt, player.pos, player.yaw, realm.mode === 'overworld' && !overlayUp);
    dialogue.update(dt);
    if (realm.mode === 'overworld') town.update(dt, player.pos);
    physDebug?.update();
    r.followShadow(renderPos);
    if (!CATCH_UP || now - lastDraw > 250) {
      lastDraw = now;
      r.render(dt);
      pumpIcons(inv.open ? 12 : 3);
    }
    perfOverlay?.update(dtMs);
    if (inv.open) preview.render();
    const t2 = performance.now();
    perf.sim = perf.sim * 0.9 + (t1 - t0) * 0.1;
    perf.render = perf.render * 0.9 + (t2 - t1) * 0.1;
    perf.frame = perf.frame * 0.9 + dtMs * 0.1;
    r.trackFrame(dtMs, now);

    fpsAcc += dtMs;
    fpsFrames++;
    if (fpsAcc > 1000) {
      (window as any).__fps = Math.round((fpsFrames * 1000) / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }
  };
  await Promise.all([town.ready, loadArmourKit()]);
  mark('npcs');
  // Compile every material's shaders up front, in parallel where the
  // browser supports it, instead of stalling the first frames one by one.
  r.followShadow(player.pos);
  cam.update(0, player.pos, false);
  await r.renderer.compileAsync(r.scene, r.camera);
  mark('shaders');
  last = performance.now();
  requestAnimationFrame(frame);
  // Item icons render off-screen; do it once the world is up (it's behind
  // the title screen in normal play) so boot isn't held up by it.
  setOnIconsReady(() => {
    hud.markHotbarDirty();
    if (inv.open) inv.render();
  });
  await loadBakedIcons();
  buildIcons(r.renderer, r.scene.environment, player.equip.items.map((i) => i.def.id));

  if (DEBUG || TEST_MODE) {
    (window as any).__game = {
      THREE, r, input, player, cam, physics, fx, slimes, spells, skillRt, hud, inv, skills, realm, rewards, mapUI, save, town, dialogue, stylizedNature, grass, world, discovery, worldMap, terrain, ocean, events, npcs, time, weather, fauna, farm, quests, farmLife, landmarks, questUI, foraging, roads, kingsRoad, horses, encounters, caravans, port: { ...port, berth: PORT_SPOTS.berth }, fishing, duel, academy, lowerCity, riverLife, stepSim: (n = 1) => { for (let i = 0; i < n; i++) simStep(); }, sellFish, worldFlags, boats, exportIcons: exportAllIcons,
      perf,
      pause: (p: boolean) => (paused = p),
      get steps() {
        return simSteps;
      },
      useHotbar,
      /** freeze the player in an action at time t (seconds) for inspection */
      pose: (id: string, t: number) => {
        paused = true;
        player.debugPose(id, t);
      },
    };
  }
  (window as any).__ready = true;
}

boot();
