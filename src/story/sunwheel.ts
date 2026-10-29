import * as THREE from 'three';
import type { DialogueOption } from '../ui/dialogue';
import type { MapMarker } from '../ui/worldMap';

// The Sunwheel network (main story). Every Sunwheel in Cresha is one wheel:
// the waystones on the roads, the twelve Sunwheel stones in the wilds, the
// ring on the hill above Elder Glen, the Gravewood pedestal once the curse is
// broken, and the old wheels the story finds later. Touch one and it knows
// you (attuned). Once the wheel has woken in you (Act I, or Magus Orren's
// "The Sunwheel" for old saves), any wheel carries you to any other you have
// touched; you can rest by one (full health, and your light comes back there
// if you fall); and the story's rites are done at them.

export interface WheelNode {
  id: string;
  name: string;
  pos: THREE.Vector3;
  kind: 'waystone' | 'stone' | 'ring' | 'pedestal' | 'ruin';
}

export interface WheelHooks {
  flags: Record<string, boolean | number | string>;
  /** awake: the wheel carries you */
  awake(): boolean;
  nodes(): WheelNode[];
  show(who: string, title: string, text: string, opts: DialogueOption[]): void;
  close(): void;
  travel(to: THREE.Vector3, name: string): void;
  rest(): void;
  toast(m: string): void;
  save(): void;
  /** a rite waits at this wheel (the story) */
  rite?(node: WheelNode): DialogueOption | null;
}

const KIND_NAME: Record<WheelNode['kind'], string> = { waystone: 'A Waystone', stone: 'A Sunwheel Stone', ring: 'The Standing Stones', pedestal: 'The Gravewood Pedestal', ruin: 'An Old Wheel' };

export class SunwheelNetwork {
  constructor(private h: WheelHooks) {}

  attuned(id: string) {
    return !!this.h.flags['way:' + id];
  }
  attune(id: string) {
    const first = !this.attuned(id);
    this.h.flags['way:' + id] = true;
    return first;
  }
  /** Where your light comes back (the last wheel you rested by). */
  get respawn(): THREE.Vector3 | null {
    const id = this.h.flags.wheelRest as string | undefined;
    if (!id) return null;
    const n = this.h.nodes().find((x) => x.id === id);
    return n ? n.pos.clone().add(new THREE.Vector3(2, 0.6, 0)) : null;
  }

  /** You lay your hand on a wheel. */
  touch(node: WheelNode, page = 0) {
    const first = this.attune(node.id);
    if (first) this.h.toast(`Attuned: ${node.name}`);
    const title = node.name;
    const who = KIND_NAME[node.kind];
    if (!this.h.awake()) {
      this.h.show(who, title, first
        ? 'The Sunwheel carved here warms under your palm and glows, as if it has remembered you. Something in you answers, very faintly, and then nothing more. Not yet.'
        : 'The wheel glows at your touch, and waits. Whatever it is waiting for, it isn\'t here yet.', [{ label: 'Step back.', run: () => this.h.close() }]);
      this.h.save();
      return;
    }
    const others = this.h.nodes().filter((o) => o.id !== node.id && this.attuned(o.id)).sort((a, b) => a.pos.distanceTo(node.pos) - b.pos.distanceTo(node.pos));
    const PER = 6;
    const pages = Math.max(1, Math.ceil(others.length / PER));
    const pg = page % pages;
    const opts: DialogueOption[] = [];
    const rite = this.h.rite?.(node);
    if (rite) opts.push(rite);
    opts.push(...others.slice(pg * PER, pg * PER + PER).map((o) => ({
      label: `Travel to ${o.name}`,
      run: () => {
        this.h.close();
        this.h.travel(o.pos, o.name);
        this.h.save();
      },
    })));
    if (pages > 1) opts.push({ label: 'Other wheels...', run: () => this.touch(node, pg + 1) });
    opts.push({
      label: this.h.flags.wheelRest === node.id ? 'Rest by the wheel (your light returns here)' : 'Rest by the wheel, and let your light return here',
      run: () => {
        this.h.flags.wheelRest = node.id;
        this.h.rest();
        this.h.close();
        this.h.toast(`Rested. If you fall, you will wake at ${node.name}.`);
        this.h.save();
      },
    });
    opts.push({ label: 'Not now.', run: () => this.h.close() });
    const n = others.length;
    this.h.show(who, title, n
      ? `The Sunwheel blazes at your touch. ${n === 1 ? 'One other wheel you have touched answers' : `${n} wheels you have touched answer`}, far off, like bells over water.`
      : 'The Sunwheel blazes at your touch, but no other wheel you have touched answers yet. Find more, and touch them.', opts);
    this.h.save();
  }

  /** The wheels you know, for the map. */
  markers(): MapMarker[] {
    return this.h.nodes().filter((n) => this.attuned(n.id)).map((n) => ({ x: n.pos.x, z: n.pos.z, kind: 'site' as const, glyph: '✸', color: this.h.awake() ? '#ffcf6a' : '#b8a070', label: n.name }));
  }
}
