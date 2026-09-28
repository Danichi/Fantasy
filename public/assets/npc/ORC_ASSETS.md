# Orc dungeon assets

Place these three binary GLB files in exactly these paths:

- `public/assets/npc/orc_warrior.glb` — regular Orc mobs in the first dungeon.
- `public/assets/npc/orc_warchief.glb` — final boss / Orc Warchief model.
- `public/assets/npc/orc_house.glb` — overworld dungeon entrance.

The game code already references these paths, so adding the files to GitHub at those exact locations is enough for Vite to serve them automatically. No import statement or additional asset registration is required.

The supplied Orc Warchief model was inspected and contains no embedded animation clips. The existing boss animation/combat rig is therefore retained underneath the visible Warchief model.

The regular Orc Warrior asset is expected to be static; the regular Orc mob behavior is handled by the enemy controller.

Keep the asset licenses/attribution files with the project when required by the asset source.
