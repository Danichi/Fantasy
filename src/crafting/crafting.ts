// What Arms and Crafting saves (crafting/arms.ts toJSON): recipes learned from books and discovery, worked-out gathering nodes, buffs, the timing-step setting.
export interface ArmsSave {
  recipes?: string[];
  nodes?: Record<string, number>;
  buffs?: { id: string; label: string; left: number; m: Record<string, number> }[];
  quick?: boolean;
  /** practice toward each Calling's next level (crafting/practice.ts) */
  practice?: Record<string, number>;
  loaded?: boolean;
}
