import './legacy.css';
import type { Player } from '../player/player';
import { events } from '../core/events';
import { ORIGINS, RENOWN_LEVELS, type TreeTier } from './data';
import { legacyLevel } from './legacy';

// The Legacy family in the Skills screen (K): the Legendary Hero's card in the
// atlas and its page. The page shows your Renown and the deeds that earned it,
// your people's passives, and the five tiers of your legendary tree: which are
// open, what each does and costs, and buttons to put an active one on V or on
// the moves bar. There is nothing to buy: Renown comes only from deeds.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

const costText = (t: TreeTier) => {
  const c = t.cost ?? {};
  const bits = [c.stamina && `${c.stamina} stamina`, c.mana && `${c.mana} mana`, c.hpPct && `${c.hpPct}% health`, c.energy && `${c.energy} draconic energy`, t.cd && `${t.cd} s cooldown`].filter(Boolean);
  return bits.join(' · ');
};

/** The atlas card's info line and button area for the Legendary Hero. */
export function legacyCardInfo(player: Player) {
  const s = player.prog.legacy, L = legacyLevel(s.renown);
  const next = L < RENOWN_LEVELS.length ? `${RENOWN_LEVELS[L] - s.renown} Renown to level ${L + 1}` : 'A legend complete';
  return { info: `${ORIGINS[player.prog.origin].name} · ${next}`, btn: `<span class="sk-mchip">${s.renown} Renown</span>` };
}

/** Fill the Legendary Hero page. */
export function renderLegacy(body: HTMLElement, player: Player, toast: (m: string) => void) {
  const s = player.prog.legacy, L = legacyLevel(s.renown), def = ORIGINS[player.prog.origin];
  const look = player.prog.look;
  const lo = L > 0 ? RENOWN_LEVELS[L - 1] : 0, hi = RENOWN_LEVELS[Math.min(L, RENOWN_LEVELS.length - 1)];
  const pct = L >= RENOWN_LEVELS.length ? 100 : Math.round(((s.renown - lo) / (hi - lo)) * 100);
  const moves = player.equip.moves;
  const onV = (() => {
    const pick = s.slot;
    const idx = def.tree.findIndex((t) => t.id === pick);
    if (pick && idx >= 0 && idx < L && def.tree[idx].kind === 'active') return pick;
    for (let i = L - 1; i >= 0; i--) if (def.tree[i].kind === 'active') return def.tree[i].id;
    return def.innate.id;
  })();
  const actions = (t: TreeTier) => {
    const ref = `origin:${t.id}`, at = moves.indexOf(ref);
    return `<div class="lg-act"><button class="sk-btn${onV === t.id ? ' on' : ''}" type="button" data-v="${t.id}">${onV === t.id ? 'On V' : 'Put on V'}</button>
      <span>Moves bar:</span>${[0, 1, 2, 3, 4, 5].map((i) => `<button class="sk-slot${at === i ? ' on' : ''}" type="button" data-bar="${t.id}" data-i="${i}">${i + 1}</button>`).join('')}</div>`;
  };
  const tierCard = (t: TreeTier, i: number) => {
    const open = i < L;
    return `<div class="lg-tier${open ? ' open' : ''}">
      <div class="lg-num">${ROMAN[i]}</div>
      <div class="lg-body"><div class="lg-head"><b>${esc(t.name)}</b><span class="lg-kind">${t.kind === 'active' ? 'Active' : 'Passive'}</span>${open ? '' : `<span class="lg-lock">Legendary Hero ${i + 1} · ${RENOWN_LEVELS[i]} Renown</span>`}</div>
        <p>${esc(t.text)}</p>${t.kind === 'active' && costText(t) ? `<small>${costText(t)}</small>` : ''}${open && t.kind === 'active' ? actions(t) : ''}</div></div>`;
  };
  const deeds = Object.entries(s.deeds).map(([, v]) => `<li><span>+${v.r}</span>${esc(v.label)}</li>`).reverse();
  const view = body.querySelector<HTMLElement>('.sk-legacy') ?? body;
  view.innerHTML = `<div class="lg-cols">
    <div class="lg-left">
      <div class="lg-who"><h3>${esc(look?.name ?? 'Hero')}</h3><span>${def.name}${look ? ` · ${look.height.toFixed(2)} m` : ''}</span><p>${esc(def.line)}</p></div>
      <div class="sk-meter"><div class="top"><span>RENOWN ${s.renown} · LEGENDARY HERO ${L}</span><span>${L >= RENOWN_LEVELS.length ? 'MAX' : `${hi - s.renown} to level ${L + 1}`}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <p class="sk-note">Renown comes only from great deeds: named bosses and great beasts (2), chapters of the story (3), new regions, first landfalls, relit lighthouses, regattas won and guild ranks (1). No XP can buy it.</p>
      <div class="lg-sub">YOUR PEOPLE</div>
      <ul class="lg-pass">${def.passives.map((p) => `<li><b>${esc(p.name)}</b> ${esc(p.text)}</li>`).join('')}</ul>
      <div class="lg-sub">BIRTHRIGHT</div>
      <div class="lg-tier open innate"><div class="lg-num">·</div><div class="lg-body"><div class="lg-head"><b>${esc(def.innate.name)}</b><span class="lg-kind">Active</span></div><p>${esc(def.innate.text)}</p><small>${costText(def.innate)}</small>${actions(def.innate)}</div></div>
      <div class="lg-sub">DEEDS</div>
      <ul class="lg-deeds">${deeds.length ? deeds.join('') : '<li><span>·</span>No great deeds yet. The world is waiting.</li>'}</ul>
      <p class="sk-note">Homeland: ${esc(def.homeland)}</p>
    </div>
    <div class="lg-tree">${def.tree.map(tierCard).join('')}</div></div>`;
  view.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => b.addEventListener('click', () => {
    s.slot = b.dataset.v!;
    toast(`V now uses ${[def.innate, ...def.tree].find((t) => t.id === s.slot)?.name}`);
    renderLegacy(body, player, toast);
  }));
  view.querySelectorAll<HTMLElement>('[data-bar]').forEach((b) => b.addEventListener('click', () => {
    const ref = `origin:${b.dataset.bar}`, i = Number(b.dataset.i), was = player.equip.moves[i] === ref;
    player.equip.moves = player.equip.moves.map((m) => (m === ref ? null : m));
    if (!was) player.equip.moves[i] = ref;
    events.emit('equipmentChanged', {});
    toast(was ? 'Removed from the moves bar' : `On key ${i + 1} of the moves bar (Tab)`);
    renderLegacy(body, player, toast);
  }));
}
