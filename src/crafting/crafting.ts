// Placeholder replaced in phase A3.
export interface ArmsSave {
  recipes?: string[];
  nodes?: Record<string, number>;
  buffs?: { id: string; label: string; left: number; m: Record<string, number> }[];
  quick?: boolean;
  loaded?: boolean;
}
