import { listSlots, setActiveSlot, createSlot, renameSlot, deleteSlot } from '../save';
import { ORIGINS } from '../origins/data';

// The save slots on the title card: pick whose game to play, name a save, or
// start a new one. Picking another slot reloads the game into it; the game you
// leave saves itself first (to its own slot) as the page unloads.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function ago(t?: number) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function buildSavePicker(host: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'save-slots';
  host.appendChild(box);
  /** the slot whose name is being edited ('new' for the new-save form) */
  let editing: string | null = null;

  const render = () => {
    const slots = listSlots();
    const rows = slots.map((s) => {
      const h = s.hero;
      const who = h
        ? `${esc(h.name)} · ${esc((ORIGINS as Record<string, { name: string }>)[h.origin]?.name ?? h.origin)} · Level ${h.level}${h.day ? ` · Day ${h.day}` : ''}`
        : 'No hero yet: the character creator opens';
      const name = editing === s.id
        ? `<form class="ss-form" data-rename="${s.id}"><input maxlength="32" value="${esc(s.name)}" aria-label="Save name"><button type="submit">Save</button><button type="button" data-a="cancel">Cancel</button></form>`
        : `<b>${esc(s.name)}</b>`;
      const tools = editing === s.id ? '' : `<span class="ss-tools"><button data-a="rename" data-id="${s.id}">Rename</button>${s.current ? '' : `<button data-a="delete" data-id="${s.id}">Delete</button>`}</span>`;
      return `<div class="ss-row ${s.current ? 'current' : ''}" ${s.current || editing === s.id ? '' : `data-load="${s.id}"`}>
        <span class="ss-main">${name}<small>${who}</small></span>
        <span class="ss-side">${s.current ? '<em>Playing</em>' : '<em class="ss-load">Load</em>'}${s.updated ? `<small>${ago(s.updated)}</small>` : ''}</span>${tools}</div>`;
    }).join('');
    const add = editing === 'new'
      ? `<form class="ss-form ss-new" data-create><input maxlength="32" placeholder="Save ${slots.length + 1}" aria-label="New save name"><button type="submit">Create</button><button type="button" data-a="cancel">Cancel</button></form>`
      : '<button class="ss-add" data-a="new">+ New save</button>';
    box.innerHTML = `<div class="ss-head">SAVES</div><div class="ss-list">${rows}</div>${add}`;
    (box.querySelector('input') as HTMLInputElement | null)?.focus();
  };

  // Nothing in here starts the game (a click anywhere else on the title card does).
  for (const ev of ['click', 'pointerdown', 'mousedown'] as const) box.addEventListener(ev, (e) => e.stopPropagation());
  // Typing a name mustn't open the journal, the map, and so on.
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      editing = null;
      render();
    }
  });
  box.addEventListener('keyup', (e) => e.stopPropagation());

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest('button[data-a]') as HTMLElement | null;
    if (btn) {
      const a = btn.dataset.a, id = btn.dataset.id;
      if (a === 'new') editing = 'new';
      else if (a === 'cancel') editing = null;
      else if (a === 'rename' && id) editing = id;
      else if (a === 'delete' && id) {
        const s = listSlots().find((x) => x.id === id);
        if (s && confirm(`Delete "${s.name}"${s.hero ? ` (${s.hero.name}, level ${s.hero.level})` : ''}? This can't be undone.`)) deleteSlot(id);
      }
      render();
      return;
    }
    if (t.closest('form')) return;
    const row = t.closest('[data-load]') as HTMLElement | null;
    if (row) {
      setActiveSlot(row.dataset.load!);
      location.reload();
    }
  });

  box.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const val = (f.querySelector('input') as HTMLInputElement).value;
    if (f.dataset.create !== undefined) {
      createSlot(val);
      location.reload();
      return;
    }
    if (f.dataset.rename) renameSlot(f.dataset.rename, val);
    editing = null;
    render();
  });

  render();
  return { el: box, render };
}
