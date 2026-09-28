# Orc assets

This branch expects two user-supplied GLB assets:

- `public/assets/npc/orc_house.glb` — visible overworld entrance to the first dungeon.
- `public/assets/npc/orc_warrior.glb` — visible model used for Grukk, the Orc Warlord.

The house is a static GLB. The Orc Warrior GLB is also static (no embedded animation clips); the existing boss combat/animation rig remains active for gameplay timing while the supplied model is rendered as the visible body.

The overworld interaction remains bound to the game's existing **E / Interact** control when the player is within the house doorway's interaction radius.
