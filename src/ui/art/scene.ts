// ---------------------------------------------------------------------------
// A painted room behind a workshop or shop window: the forge behind the smith's
// card, the kitchen behind the cook's, the merchant's shop behind a trade.
// One element under #ui, shown with showScene(kind) and hidden with showScene(null).
// Paintings: public/assets/art/scene/<kind>.webp (tools/art/README.md).
// ---------------------------------------------------------------------------

import './themes.css';

let el: HTMLDivElement | null = null;

export type SceneKind = 'forge' | 'kitchen' | 'loom' | 'workbench' | 'runestone' | 'alchemy' | 'shop';

export function showScene(kind: SceneKind | null) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'ui-scene';
    document.getElementById('ui')?.appendChild(el);
  }
  document.body.classList.toggle('scene-open', !!kind);
  if (!kind) {
    el.classList.remove('on');
    return;
  }
  el.dataset.kind = kind;
  el.style.backgroundImage = `url(/assets/art/scene/${kind}.webp)`;
  el.classList.add('on');
}
