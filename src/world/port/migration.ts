import type { SaveData } from '../../save';
import {
  AURELLE,
  PORT_BERTHS,
  PORT_REVISION,
  portOwnedBerth,
} from '../portCity';
/** Migrate once, before sailing and world flags are restored. Keep quest IDs and stages. */
export function migrateAurelle(save: SaveData | null) {
  if (!save || Number(save.world?.flags?.['pa:revision'] ?? 0) >= PORT_REVISION)
    return;
  const world = save.world;
  world.flags ??= {};
  const pos = world.pos;
  // The old saved point may now be a wall, a removed floor or dredged water.
  // Only relocate saves in the rebuilt footprint; leave voyages and other regions alone.
  if (pos && pos[0] > 2692 && pos[0] < 2980 && pos[2] > -35 && pos[2] < 345)
    world.pos = [AURELLE.arrival[0], 2, AURELLE.arrival[1]];
  const sailing = world.sailing;
  if (sailing) {
    const moveHeroFrom = (boat: { x: number; z: number }) => {
      if (pos && Math.hypot(pos[0] - boat.x, pos[2] - boat.z) < 35)
        world.pos = [AURELLE.arrival[0], 2, AURELLE.arrival[1]];
    };
    let berth = 0;
    for (const ship of sailing.ships) {
      if (ship.port !== 'portAurelle') continue;
      moveHeroFrom(ship);
      const [x, z, yaw] = portOwnedBerth(berth++);
      Object.assign(ship, { x, z, yaw });
    }
    // A rental's port records its origin even while it is out on a voyage.
    const rental = sailing.rental;
    if (
      rental?.port === 'portAurelle' &&
      rental.x > 2900 &&
      rental.x < 3100 &&
      rental.z > 60 &&
      rental.z < 345
    ) {
      moveHeroFrom(rental);
      const [x, z, yaw] = PORT_BERTHS[PORT_BERTHS.length - 1];
      Object.assign(rental, { x, z, yaw });
    }
  }
  world.flags['pa:revision'] = PORT_REVISION;
}
