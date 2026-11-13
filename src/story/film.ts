import './film.css';

// Story films: short painted cutscenes (Higgsfield key frames animated with
// Seedance, narrated, see tools/art/README.md) that play full screen at the big
// beats of the main story. The director (scene.ts) plays one with s.film(id)
// and waits for it. Esc or the Skip button ends the film early (and only the
// film: the scene goes on). Tests and fast mode skip films entirely.

export type FilmId =
  | 'fall' | 'wheel' | 'malric' | 'dark' | 'bells' | 'dawn'
  | 'academy' | 'feast' | 'duel' | 'turning' | 'wheelshield';

/** lines: captions [start second, text] for the narration baked into a film;
 *  voiced: the film has a narration track (the music ducks under it) */
export const FILMS: Record<FilmId, { voiced?: boolean; lines: [number, string][] }> = {
  fall: {
    voiced: true,
    lines: [
      [1.5, 'Listen.'],
      [2.7, 'I am the Dawn. I am the light that keeps this world safe from the Dark.'],
      [9.3, 'The Dark is a second world, lying just under this one.'],
      [14.1, 'The Hollow King rules it, and he is dying.'],
      [18.2, 'When he dies, someone will take his throne. Seven powers want it, and I am one of them.'],
      [25.6, 'Every twenty years, each of us may bring one champion from another world to fight for it. Each of those summonings is called an age.'],
      [34.8, 'I have brought four champions before you. All four are dead.'],
      [39.9, 'You are my fifth. That is why they will call you the Fifth.'],
      [44.6, 'You will wake with nothing: no name, no sword, no friends. Only a little of my light.'],
      [52.1, 'Creatures of the Dark are already heading for where you will land. They can sense my light on you.'],
      [57.9, 'Stay alive.'],
      [60.4, ''],
    ],
  },
  wheel: { lines: [] },
  malric: { lines: [] },
  dark: { lines: [] },
  bells: { lines: [] },
  dawn: { lines: [] },
  academy: { lines: [] },
  feast: { lines: [] },
  duel: { lines: [] },
  turning: { lines: [] },
  wheelshield: { lines: [] },
};

export const filmUrl = (id: FilmId) => `${import.meta.env.BASE_URL}assets/film/${id}.mp4`;

const SEEN_KEY = 'film:seen';
const seen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};

export interface FilmHandle {
  /** true if the film played (to the end or until skipped); false if it couldn't load */
  done: Promise<boolean>;
  skip(): void;
}

/** Play a film full screen. Resolves when it ends, is skipped, or fails to load
 *  (with whether it was shown). */
export function playFilm(id: FilmId): FilmHandle {
  const def = FILMS[id];
  const root = document.createElement('div');
  root.className = 'story-film';
  root.innerHTML = `<video playsinline preload="auto"></video><div class="film-bars"><i></i><i></i></div><p class="film-cap"></p><button class="film-skip" type="button">Skip <kbd>Esc</kbd></button>`;
  (document.getElementById('ui') ?? document.body).appendChild(root);
  const video = root.querySelector('video')!;
  const cap = root.querySelector('.film-cap') as HTMLElement;
  let finish!: (shown: boolean) => void;
  let over = false;
  let shown = false;
  const done = new Promise<boolean>((r) => (finish = r));
  const end = () => {
    if (over) return;
    over = true;
    document.body.classList.remove('film-on');
    root.classList.remove('on');
    video.pause();
    try {
      const s = seen();
      s.add(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
    } catch {}
    setTimeout(() => {
      root.remove();
      finish(shown);
    }, 700);
  };
  let line = -1;
  video.addEventListener('timeupdate', () => {
    let i = -1;
    for (let k = 0; k < def.lines.length; k++) if (video.currentTime >= def.lines[k][0]) i = k;
    if (i === line) return;
    line = i;
    cap.classList.remove('on');
    if (i >= 0 && def.lines[i][1]) {
      cap.textContent = def.lines[i][1];
      void cap.offsetWidth;
      cap.classList.add('on');
    }
  });
  video.addEventListener('ended', end);
  video.addEventListener('error', () => {
    shown = false;
    end();
  });
  root.querySelector('.film-skip')!.addEventListener('click', (e) => {
    e.stopPropagation();
    end();
  });
  // (a stalled load shouldn't hold the story forever)
  const stall = setTimeout(() => {
    if (video.readyState < 2) end();
  }, 12000);
  video.addEventListener('playing', () => {
    shown = true;
    clearTimeout(stall);
  }, { once: true });
  video.src = filmUrl(id);
  if (def.voiced) document.body.classList.add('film-on');
  requestAnimationFrame(() => root.classList.add('on'));
  video.play().catch(() => {
    // Autoplay with sound refused: play muted rather than not at all.
    video.muted = true;
    video.play().catch(end);
  });
  return { done, skip: end };
}

export const filmSeen = (id: FilmId) => seen().has(id);
