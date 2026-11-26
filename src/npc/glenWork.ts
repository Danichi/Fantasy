import * as THREE from 'three';
import { heightAt } from '../world/terrainHeight';
import type { NpcRecord, Place, WorkTask } from './npcManager';

/** Nearby workstations keep quest givers recognizable and within their familiar district. */
export function glenWork(records: NpcRecord[], places: Map<string, Place>) {
  const add = (id: string, x: number, z: number, yaw = 0) => {
    places.set(id, { id, spots: [new THREE.Vector3(x, heightAt(x, z), z)], yaw });
    return id;
  };
  add('glen:relief-counter', -35, 119, Math.PI);
  add('glen:relief-load', -28, 122, -Math.PI / 2);
  if (records.some((r) => r.id === 'dora'))
    for (const [i, name] of ['Mera Wainscot', 'Tobin Fenner'].entries())
      records.push({
        id: 'glen-relief-' + i,
        name,
        title: 'Elder Glen grain carrier',
        job: 'farmer',
        settlement: 'elderGlen',
        look: {
          body: i ? 'male' : 'female',
          outfit: 'peasant',
          hair: i ? 'buzzed' : 'buns',
          linen: i ? 0x9cae93 : 0xc8aa79,
          skin: 0xe0b894,
          height: i ? 1.8 : 1.68
        },
        schedule: [
          { from: 0, place: 'home1', activity: 'sleep' },
          { from: 6, place: 'glen:relief-counter', activity: 'work' },
          { from: 19, place: 'tavern', activity: 'drink' },
          { from: 22, place: 'home1', activity: 'sleep' }
        ],
        routine: {
          post: 'glen:relief-counter',
          tasks: [
            {
              place: 'glen:relief-counter',
              activity: 'talk',
              seconds: 35 + i * 12,
              line: 'Waiting for Dora to weigh the grain. The eastern watch needs bread as much as we do.'
            },
            {
              place: 'glen:relief-load',
              activity: 'work',
              carry: 'sack',
              seconds: 38,
              line: 'Taking the counted sacks to the cart. We travel together while the road is contested.'
            },
            { place: 'glen:relief-counter', activity: 'work', seconds: 28, line: 'Back for the next household’s share.' }
          ]
        },
        lines: {
          any: [
            'One cart for the Watch, one for the households. Nothing left uncounted.',
            'You can hear the Market Bell from the south fields. That is how we know when to come home.'
          ]
        }
      });
  for (const r of records) {
    const post = 'post:' + r.id;
    const p = places.get(post)?.spots[0];
    let tasks: WorkTask[] = [];
    if (r.id === 'oswin' && p) {
      r.workClip = 'fix';
      tasks = [
        { place: post, activity: 'work', seconds: 40, line: 'Clearing the millrace. Listen for the wheel if you lose the east road.' },
        {
          place: add('glen:mill-sacks', p.x - 5, p.z + 2),
          activity: 'work',
          carry: 'sack',
          seconds: 35,
          line: 'Taking this flour to the loading rack. The Watch gets the first sacks today.'
        },
        {
          place: add('glen:mill-check', p.x - 3, p.z - 3, Math.PI / 2),
          activity: 'idle',
          seconds: 25,
          line: 'Checking the water. A stopped wheel means an empty bread stall tomorrow.'
        }
      ];
    } else if (r.id === 'dora') {
      tasks = [
        {
          place: post,
          activity: 'work',
          carry: 'ledger',
          seconds: 42,
          line: 'Counting the grain against the ration book. Two measures per household until the road is safe.'
        },
        {
          place: add('glen:grain-rack', -32, 116, -Math.PI / 2),
          activity: 'work',
          carry: 'sack',
          seconds: 36,
          line: 'Checking the sacks for damp. Bring the new grain to the covered rack, please.'
        },
        {
          place: add('glen:grain-queue', -35, 119, Math.PI),
          activity: 'talk',
          seconds: 30,
          line: 'The next household is waiting. We have enough for today; that is what I can promise.'
        }
      ];
    } else if (r.id === 'hale') {
      tasks = [
        { place: post, activity: 'work', carry: 'basket', seconds: 35, line: 'Bringing feed to the cattle. Keep the pasture gate shut behind you.' },
        {
          place: add('glen:feed', -119, 61, Math.PI / 2),
          activity: 'farm',
          seconds: 40,
          line: 'Checking the trough. They will not drink if anything has spoiled the water.'
        },
        {
          place: add('glen:pasture-gate', -112, 59),
          activity: 'work',
          seconds: 30,
          line: 'Mending the latch before dusk. I am not losing another animal in the dark.'
        }
      ];
    } else if (r.id === 'wren') {
      tasks = [
        { place: post, activity: 'farm', seconds: 42, line: 'Checking the wheat heads. Walk between the rows, love, not through them.' },
        {
          place: add('glen:wheat-basket', 8, 130, Math.PI),
          activity: 'work',
          carry: 'basket',
          seconds: 30,
          line: 'Sorting what can still be milled. The bent stalks go into the basket.'
        },
        { place: add('glen:wheat-water', -1, 130), activity: 'farm', seconds: 35, line: 'Watering the young rows. There is still something worth saving here.' }
      ];
    }
    if (tasks.length) r.routine = { post, tasks };
    // A few recognizable errands in the market; the remaining shoppers keep
    // their existing social schedules instead of all marching on one cycle.
    if (r.job === 'merchant' && r.settlement === 'elderGlen' && Number(r.id.replace(/\D/g, '')) % 3 === 0) {
      const shift = r.schedule.find((e) => e.activity === 'shop');
      if (shift)
        r.routine = {
          post: shift.place,
          tasks: [
            {
              place: 'market',
              activity: 'shop',
              seconds: 65,
              line: 'Serving the next customer. Bread and salt are rationed; flowers are still free to look at.'
            },
            {
              place: add('glen:market-stock:' + r.id, 6, 14.4, Math.PI),
              activity: 'work',
              carry: 'basket',
              seconds: 32,
              line: 'Restocking the bread counter before the next queue arrives.'
            }
          ]
        };
    }
  }
}
