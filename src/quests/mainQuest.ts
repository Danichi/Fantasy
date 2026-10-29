import type { QuestLog } from './questLog';

// The main story's chain (the chapters themselves live in src/story/act*.ts).
// Each chapter hands straight on to the next, so the tracker always has
// somewhere to point you; world state (Grukk's death, a broken curse) is
// polled into signals so a crypt cleared before the story asked still counts.

/** Act I, then the road to the sea. */
export const MAIN_CHAIN = ['mq-fall', 'mq-stranger', 'mq-crypt', 'mq-gravewood', 'mq-bells', 'road-to-port'];
/** Chapters that follow one another without anyone having to offer them. */
const FOLLOWS: [string, string][] = [
  ['oldest-prayer', 'mq-ledger'],
  ['mq-ledger', 'mq-feast'],
  ['mq-feast', 'mq-wheelbreaker'],
  ['mq-wheelbreaker', 'mq-four'],
  ['mq-four', 'mq-turning'],
];

export function setupMainQuest(quests: QuestLog, world: { grukkDead: () => boolean; gravewoodCleared: () => boolean; test: boolean; opening: () => void }) {
  const link = (a: string, b: string) => {
    const prev = quests.hooks.get(a + ':done');
    quests.hooks.set(a + ':done', (q) => {
      prev?.(q);
      if (!quests.state[b]) quests.accept(b);
    });
  };
  for (let i = 0; i < MAIN_CHAIN.length - 1; i++) link(MAIN_CHAIN[i], MAIN_CHAIN[i + 1]);
  for (const [a, b] of FOLLOWS) link(a, b);
  let t = 0;
  return {
    /** After the save loads: a new game falls out of the sky; an old save keeps its story. */
    begin() {
      if (MAIN_CHAIN.some((id) => quests.state[id])) return;
      if (world.test) {
        // Tests start in the village with the opening already behind them (a story test plays it on purpose).
        quests.state['mq-fall'] = { status: 'done', stage: 1, progress: [1] };
        quests.accept('mq-stranger');
        return;
      }
      quests.accept('mq-fall');
      world.opening();
    },
    update(dt: number) {
      t += dt;
      if (t < 0.5) return;
      t = 0;
      if (quests.wants('grukk-dead') && world.grukkDead()) quests.signal('grukk-dead');
      if (quests.wants('gravewood-cleared') && world.gravewoodCleared()) quests.signal('gravewood-cleared');
    },
  };
}
