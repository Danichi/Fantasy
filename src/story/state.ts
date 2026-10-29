import { AGES, CHAMPIONS, POWERS, type PowerId } from './champions';
import { AGE_NAME } from './ui';

// What the story remembers: its flags and choices, the "story so far", the
// champions you have met, the clues to whom they serve, and who you have
// named as their patron (the Powers & Champions page).

export interface StorySave {
  flags: Record<string, boolean | number | string>;
  log: { ch: string; text: string }[];
  met: string[];
  clues: string[];
  named: Record<string, PowerId>;
  /** champions you have seen die */
  slain?: string[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class StoryState {
  flags: Record<string, boolean | number | string> = {};
  log: { ch: string; text: string }[] = [];
  met = new Set<string>();
  clues = new Set<string>();
  named: Record<string, PowerId> = {};
  /** champions you have seen die (the census counts them out) */
  slain = new Set<string>();
  /** someone should hear about it (a toast) */
  notify?: (m: string) => void;
  /** you named a patron correctly (story beats can wait on it) */
  onNamed?: (champion: string) => void;

  note(ch: string, text: string) {
    if (this.log.some((l) => l.text === text)) return;
    this.log.push({ ch, text });
  }
  meet(id: string) {
    if (this.met.has(id) || !CHAMPIONS[id]) return;
    this.met.add(id);
    const c = CHAMPIONS[id];
    if (!c.dead) this.notify?.(`Powers & Champions: ${c.name}, ${AGE_NAME[c.age]} Age (P)`);
  }
  clue(id: string) {
    if (this.clues.has(id)) return;
    const owner = Object.values(CHAMPIONS).find((c) => c.clues && id in c.clues);
    if (!owner) return;
    this.clues.add(id);
    this.met.add(owner.id);
    this.notify?.(`A clue to whom ${owner.name} serves (P)`);
  }
  /** A champion dies where you can see it. */
  slay(id: string) {
    if (CHAMPIONS[id]) this.slain.add(id);
  }
  /** What you know of a champion's patron: known, named by you, or hidden. */
  patronOf(id: string): PowerId | null {
    const c = CHAMPIONS[id];
    if (!c) return null;
    if (!c.hidden) return c.power;
    return this.named[id] === c.power ? c.power : null;
  }
  cluesFor(id: string) {
    const c = CHAMPIONS[id];
    return Object.entries(c?.clues ?? {}).filter(([k]) => this.clues.has(k)).map(([, v]) => v);
  }
  /** You name a hidden champion's patron. Right or wrong, you'll know. */
  nameAs(id: string, power: PowerId) {
    const c = CHAMPIONS[id];
    if (!c?.hidden || this.named[id] === c.power) return false;
    if (c.power !== power) {
      this.notify?.(`That doesn't fit what you've seen of ${c.name}.`);
      return false;
    }
    this.named[id] = power;
    this.notify?.(`${c.name} serves ${POWERS[power].name}.`);
    this.onNamed?.(id);
    return true;
  }

  // ---- pages --------------------------------------------------------------------
  /** The journal's "Story so far". */
  recap() {
    if (!this.log.length) return '<p class="j-empty">Your story hasn\'t begun yet.</p>';
    let html = '<h2>The Story So Far</h2>';
    let ch = '';
    for (const l of this.log) {
      if (l.ch !== ch) {
        ch = l.ch;
        html += `<div class="j-region">${esc(ch)}</div>`;
      }
      html += `<p class="j-summary">${esc(l.text)}</p>`;
    }
    return html;
  }

  /** The Powers & Champions page (in the People book page). */
  codex() {
    const powers = Object.values(POWERS).filter((p) => p.id !== 'hollow');
    const alive = (id: string) => !CHAMPIONS[id]?.dead && !this.slain.has(id);
    let html = '<section class="rep-places"><h3>The Seven Powers</h3>';
    for (const p of powers) {
      const champs = [...this.met].map((id) => CHAMPIONS[id]).filter((c) => c && this.patronOf(c.id) === p.id && alive(c.id));
      html += `<div class="codex-power" style="--pc:${p.color}"><b>${esc(p.name)}</b><p>${esc(p.known)}</p><p class="marks">Its champions carry: ${esc(p.marks)}</p><p class="home">It summons them to: ${esc(p.home)}</p>${champs.length ? `<p class="champs">Known champions: ${champs.map((c) => esc(c.name)).join(', ')}</p>` : ''}</div>`;
    }
    // The census of the Game: once Archivist Mell has told you how it is counted.
    if (this.flags.censusKnown) {
      html += '<h3>The Ages</h3><p class="codex-accord">Under the Accord each of the seven powers may summon one champion every twenty years. Every summoning is an age. The old ages are thin now; what is left of them is the worst of it.</p>';
      for (const a of AGES) {
        const known = Object.values(CHAMPIONS).filter((c) => c.age === a.age && this.met.has(c.id) && alive(c.id));
        const names = [...(a.age === 5 ? ['You'] : []), ...known.map((c) => c.name)];
        const walk = Math.max(names.length, a.walk - [...this.slain].filter((id) => CHAMPIONS[id]?.age === a.age).length);
        const unknown = walk - names.length;
        html += `<div class="codex-census age${a.age}"><div><span class="codex-age">${AGE_NAME[a.age]} Age</span><small>${esc(a.when)}</small></div><b>${walk} of 7 still walk</b><p>${esc(a.note)}</p><div class="codex-chips">${names.map((n) => `<span>${esc(n)}</span>`).join('')}${'<span class="unknown" title="Not yet known to you">?</span>'.repeat(unknown)}</div></div>`;
      }
    }
    html += '<h3>Champions</h3>';
    const met = [...this.met].map((id) => CHAMPIONS[id]).filter(Boolean).sort((a, b) => Number(!!a.dead) - Number(!!b.dead) || a.age - b.age);
    if (!met.length) html += '<p class="j-empty">You haven\'t met another champion. Yet.</p>';
    for (const c of met) {
      const patron = this.patronOf(c.id);
      const clues = this.cluesFor(c.id);
      const naming = c.hidden && !patron && clues.length >= 2
        ? `<div class="codex-name">Who sends them? ${powers.map((p) => `<button data-name="${c.id}" data-power="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : '';
      html += `<div class="codex-champ age${c.age}${c.dead || this.slain.has(c.id) ? ' dead' : ''}">
        <div><span class="codex-age">${AGE_NAME[c.age]} Age</span><b>${esc(c.name)}</b><small>${esc(c.epithet)}${c.dead || this.slain.has(c.id) ? ' · dead' : ''}</small></div>
        <span class="codex-patron" style="color:${patron ? POWERS[patron].color : '#8a7a6a'}">${patron ? esc(POWERS[patron].name) : 'Patron unknown'}</span>
        <p>${esc(c.about)}</p>
        ${clues.length ? `<ul>${clues.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${naming}
      </div>`;
    }
    return html + '</section>';
  }

  save(): StorySave {
    return { flags: this.flags, log: this.log, met: [...this.met], clues: [...this.clues], named: this.named, slain: [...this.slain] };
  }
  load(s?: StorySave) {
    // (The chapters hold on to this object: refill it rather than replace it.)
    for (const k of Object.keys(this.flags)) delete this.flags[k];
    Object.assign(this.flags, s?.flags ?? {});
    this.log = s?.log ?? [];
    this.met = new Set(s?.met ?? []);
    this.clues = new Set(s?.clues ?? []);
    // (Saves from when Dorian was a champion: what you learned of him points at his master.)
    for (const [old, now] of [['dorianDoor', 'veyrStyle'], ['dorianEyes', 'veyrLetters']]) if (this.clues.delete(old)) this.clues.add(now);
    if (this.clues.has('veyrStyle') || this.clues.has('veyrLetters')) this.met.add('veyr');
    this.named = s?.named ?? {};
    if (this.named.dorian) {
      this.named.veyr ??= this.named.dorian;
      delete this.named.dorian;
    }
    this.slain = new Set(s?.slain ?? []);
    if (this.flags.feastDone) this.slain.add('hesk');
  }
}
