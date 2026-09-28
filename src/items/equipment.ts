import * as THREE from 'three';
import { Character } from '../player/character';
import { RigLayer } from '../player/rigLayer';
import { basisQuat } from '../player/ik';
import { ITEMS, ARMOR_SLOTS, ACCESSORY_SLOTS, type ItemDef, type ItemStats, type Slot } from './itemDefs';
import { buildArmorParts, type ArmorPart, type LimbFit } from './armorModels';
import { events } from '../core/events';

export interface ItemInstance {
  uid: number;
  def: ItemDef;
  qty: number;
}


let nextUid = 1;

const CHILD: Record<string, string> = {
  Head: 'HeadTop_End', Spine2: 'Neck', Hips: 'Spine',
  RightArm: 'RightForeArm', LeftArm: 'LeftForeArm', RightForeArm: 'RightHand', LeftForeArm: 'LeftHand',
  RightHand: 'RightHandMiddle1', LeftHand: 'LeftHandMiddle1',
  RightUpLeg: 'RightLeg', LeftUpLeg: 'LeftLeg', RightLeg: 'RightFoot', LeftLeg: 'LeftFoot',
  RightFoot: 'RightToeBase', LeftFoot: 'LeftToeBase',
};

export class Equipment implements LimbFit {
  items: ItemInstance[] = [];
  equipped: Partial<Record<Slot, number>> = {};
  /** quick items (potions etc.) on keys 1-4 */
  quick: (number | null)[] = [null, null, null, null];
  /** moveset bar (Tab): spells now, class skills later; keys 1-6 */
  moves: (number | null)[] = [null, null, null, null, null, null];
  /** the spell R casts */
  activeSpell: number | null = null;
  showArmor = true;

  private models = new Map<Slot, THREE.Object3D[]>();
  private limbSockets = new Map<string, { socket: THREE.Object3D; len: number }>();

  constructor(private char: Character, private rig: RigLayer) {}

  // ---- LimbFit ------------------------------------------------------------
  /** Socket on a bone whose axes are the limb frame described in armorModels. */
  limb(bone: string) {
    const cached = this.limbSockets.get(bone);
    if (cached) return cached;
    const b = this.char.bone(bone);
    const childName = CHILD[bone];
    const child = childName && this.char.bone(childName);
    if (!b || !child) return null;
    const c = this.char;
    c.root.updateMatrixWorld(true);
    const rootQ = c.visual.getWorldQuaternion(new THREE.Quaternion());
    const a = b.getWorldPosition(new THREE.Vector3());
    const e = child.getWorldPosition(new THREE.Vector3());
    const Y = e.clone().sub(a);
    const scale = c.root.getWorldScale(new THREE.Vector3()).y;
    const len = Y.length() / scale;
    // Frame Z reference: forward for most limbs, up for feet, back of hand for hands.
    let Z = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
    if (bone.endsWith('Foot')) Z = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQ);
    if (bone.endsWith('Hand')) {
      const side = bone.startsWith('Right') ? 'Right' : 'Left';
      Z = new THREE.Vector3(0, 0, -1).applyQuaternion(this.rig.gripWorldQuat(side));
    }
    // Head/spine frames point up the bone; for those keep +Y up.
    const frame = basisQuat(Y, Z);
    const socket = new THREE.Group();
    socket.name = 'limb:' + bone;
    const ws = b.getWorldScale(new THREE.Vector3());
    socket.scale.set(scale / ws.x, scale / ws.y, scale / ws.z);
    socket.quaternion.copy(b.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(frame));
    b.add(socket);
    const entry = { socket, len };
    this.limbSockets.set(bone, entry);
    return entry;
  }

  // ---- inventory ----------------------------------------------------------
  add(id: string, qty = 1) {
    const def = ITEMS[id];
    if (!def) throw new Error('unknown item ' + id);
    if (def.stack) {
      const ex = this.items.find((i) => i.def.id === id);
      if (ex) {
        ex.qty += qty;
        return ex;
      }
    }
    const inst = { uid: nextUid++, def, qty };
    this.items.push(inst);
    return inst;
  }

  get(uid: number | null | undefined) {
    return uid == null ? undefined : this.items.find((i) => i.uid === uid);
  }

  inSlot(slot: Slot) {
    return this.get(this.equipped[slot]);
  }

  slotOf(uid: number): Slot | undefined {
    return (Object.keys(this.equipped) as Slot[]).find((s) => this.equipped[s] === uid);
  }

  canEquip(item: ItemInstance, slot: Slot) {
    const k = item.def.kind;
    if (slot === 'main') return k === 'sword';
    if (slot === 'off') return k === 'sword' || k === 'shield';
    if (slot === 'ring1' || slot === 'ring2') return k === 'accessory' && (item.def.slot === 'ring1' || item.def.slot === 'ring2');
    return (k === 'armor' || k === 'accessory') && item.def.slot === slot;
  }

  /** Natural slot for an item; rings take the first free ring slot. */
  slotFor(item: ItemInstance): Slot | undefined {
    if (item.def.slot === 'ring1' || item.def.slot === 'ring2') return this.equipped.ring1 == null ? 'ring1' : 'ring2';
    return item.def.slot;
  }

  /** Equip into `slot` (defaults to the item's natural slot). */
  equip(uid: number, slot?: Slot) {
    const item = this.get(uid);
    if (!item) return false;
    if (item.def.kind === 'spell') {
      this.activeSpell = uid;
      events.emit('equipmentChanged', {});
      return true;
    }
    const target = slot ?? this.slotFor(item);
    if (!target || !this.canEquip(item, target)) return false;
    // An item can only be in one slot: moving a sword main<->off swaps.
    const from = this.slotOf(uid);
    if (from === target) return true;
    const displaced = this.equipped[target];
    if (from) {
      this.detach(from);
      delete this.equipped[from];
    }
    this.detach(target);
    this.equipped[target] = uid;
    if (from && displaced != null) {
      const d = this.get(displaced)!;
      if (this.canEquip(d, from)) this.equipped[from] = displaced;
    }
    this.refreshModels();
    events.emit('equipmentChanged', {});
    return true;
  }

  unequip(slot: Slot) {
    if (this.equipped[slot] == null) return;
    this.detach(slot);
    delete this.equipped[slot];
    this.refreshModels();
    events.emit('equipmentChanged', {});
  }

  private detach(slot: Slot) {
    for (const o of this.models.get(slot) ?? []) o.removeFromParent();
    this.models.delete(slot);
  }

  /** Rebuild any slot whose model is missing. Cheap to call after changes. */
  refreshModels() {
    for (const slot of Object.keys(this.equipped) as Slot[]) {
      if (this.models.has(slot)) continue;
      const item = this.get(this.equipped[slot])!;
      const objs: THREE.Object3D[] = [];
      if (slot === 'main' || slot === 'off') {
        const m = item.def.build!();
        const socket = this.rig.hands[slot === 'main' ? 'Right' : 'Left'].socket;
        if (item.def.kind === 'shield') m.rotation.y = Math.PI; // face out of the back of the hand
        m.userData.itemUid = item.uid;
        socket.add(m);
        objs.push(m);
      } else if (item.def.armor) {
        const parts: ArmorPart[] = buildArmorParts(item.def.armor, this);
        for (const p of parts) {
          p.object.visible = this.showArmor;
          objs.push(p.object);
        }
      }
      this.models.set(slot, objs);
    }
    this.rig.setCurl('Right', this.equipped.main != null ? 1 : 0.15);
    this.rig.setCurl('Left', this.equipped.off != null ? 1 : 0.15);
  }

  model(slot: 'main' | 'off') {
    return this.models.get(slot)?.[0];
  }

  // ---- derived stats ------------------------------------------------------
  get mainWeapon() {
    return this.inSlot('main');
  }
  get offItem() {
    return this.inSlot('off');
  }
  get hasShield() {
    return this.offItem?.def.kind === 'shield';
  }
  get dualWield() {
    return this.offItem?.def.kind === 'sword' && !!this.mainWeapon;
  }
  /** Sum of a stat across everything equipped (armour, accessories, weapons). */
  bonus(stat: keyof ItemStats) {
    let sum = 0;
    for (const uid of Object.values(this.equipped)) sum += (this.get(uid)?.def.stats[stat] as number | undefined) ?? 0;
    return sum;
  }

  get armorValue() {
    return ARMOR_SLOTS.reduce((s, sl) => s + (this.inSlot(sl)?.def.stats.armor ?? 0), 0);
  }
  get poise() {
    return [...ARMOR_SLOTS, ...ACCESSORY_SLOTS].reduce((s, sl) => s + (this.inSlot(sl)?.def.stats.poise ?? 0), 0) + (this.mainWeapon?.def.stats.poise ?? 0);
  }

  consume(uid: number) {
    const it = this.get(uid);
    if (!it) return;
    it.qty--;
    if (it.qty <= 0) {
      this.items = this.items.filter((i) => i !== it);
      this.quick = this.quick.map((h) => (h === uid ? null : h));
    }
  }
}
