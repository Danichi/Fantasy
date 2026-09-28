# Goblin asset

The crypt goblin enemy loads:

`public/assets/npc/goblin.glb`

The game will use the supplied animated goblin model when that file exists, including its embedded animation clips. If it is missing, a small procedural goblin is shown so the dungeon remains playable.

The requested model is the PROTOFACTOR, INC. "GOBLIN ANIMATIONS" asset from Sketchfab, model ID `93381eff38aa49198eb350df1500917f`.

Place the downloaded/converted GLB at:

`public/assets/npc/goblin.glb`

Do not commit the Sketchfab iframe HTML as the game asset; the runtime needs the actual GLB (or an equivalent converted glTF package with its textures).

Before distributing the game, keep the asset's license/attribution information with the project according to the license supplied with the downloaded asset.
