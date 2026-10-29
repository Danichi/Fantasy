import './story.css';

// The main story's screen furniture (see story.css): letterbox bars, a fade,
// subtitles, chapter cards, the patron's whisper, the champion card and the
// dread vignette. Pure DOM: the director (scene.ts) and the story decide when.

export const AGE_NAME = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
export const AGE_COLOR = ['', '#ff3048', '#ffd36a', '#dfe6f0', '#d89a5a', '#e8e2d0'];

const el = (cls: string, html = '') => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  document.getElementById('ui')!.appendChild(d);
  return d;
};

export class StoryUI {
  readonly bars = el('story-bars', '<i></i><i></i>');
  readonly fadeEl = el('story-fade');
  readonly sub = el('story-sub', '<b></b><p></p>');
  readonly skipHint = el('story-skip', 'Esc to skip');
  readonly cardEl = el('story-card');
  readonly voiceEl = el('story-voice');
  readonly champEl = el('champ-card');
  readonly dreadEl = el('story-dread');
  private voiceQueue: { text: string; sec: number }[] = [];
  private voiceT = 0;

  letterbox(on: boolean) {
    this.bars.classList.toggle('on', on);
    this.skipHint.classList.toggle('on', on);
  }
  fade(a: number, sec = 0.6) {
    this.fadeEl.style.transition = `opacity ${sec}s`;
    this.fadeEl.style.opacity = String(a);
  }
  subtitle(who: string | null, text: string | null) {
    if (!text) return void this.sub.classList.remove('on');
    this.sub.querySelector('b')!.textContent = who ?? '';
    (this.sub.querySelector('b') as HTMLElement).style.display = who ? 'block' : 'none';
    this.sub.querySelector('p')!.textContent = text;
    this.sub.classList.add('on');
  }
  card(small: string, title: string, sub = '') {
    this.cardEl.innerHTML = `${small ? `<small>${small}</small>` : ''}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}<div class="rule"></div>`;
    this.cardEl.classList.add('on');
  }
  hideCard() {
    this.cardEl.classList.remove('on');
  }
  champion(age: number, name: string, epithet: string, power: string) {
    this.champEl.className = `champ-card age${age} on`;
    this.champEl.style.setProperty('--age', AGE_COLOR[age]);
    this.champEl.innerHTML = `<div class="age">A Champion of the ${AGE_NAME[age]} Age</div><div class="name">${name}</div><div class="epithet">${epithet}</div><div class="power">${power}</div>`;
  }
  hideChampion() {
    this.champEl.classList.remove('on');
  }
  /** The patron speaks (queued; each line stays a few seconds). */
  whisper(text: string, sec = 0) {
    this.voiceQueue.push({ text, sec: sec || Math.max(3.2, 1.6 + text.length / 22) });
  }
  get whispering() {
    return this.voiceT > 0 || this.voiceQueue.length > 0;
  }
  dread(level: number, pulse = false) {
    this.dreadEl.style.opacity = String(Math.max(0, Math.min(1, level)));
    this.dreadEl.classList.toggle('pulse', pulse && level > 0.05);
  }
  update(dt: number) {
    if (this.voiceT > 0) {
      this.voiceT -= dt;
      if (this.voiceT <= 0) this.voiceEl.classList.remove('on');
    } else if (this.voiceQueue.length) {
      const v = this.voiceQueue.shift()!;
      this.voiceEl.textContent = v.text;
      this.voiceEl.classList.add('on');
      this.voiceT = v.sec + 0.6;
    }
  }
  clear() {
    this.letterbox(false);
    this.subtitle(null, null);
    this.hideCard();
    this.hideChampion();
    this.fade(0, 0.3);
  }
}
