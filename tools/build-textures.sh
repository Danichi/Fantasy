#!/bin/sh
# Rebuild the painted texture kit from its source paintings (assets-src/higgsfield/).
# Each line is one surface: how it is made seamless and how strong its relief is.
#   sh tools/build-textures.sh            all of them
#   sh tools/build-textures.sh stone      just one
S=assets-src/higgsfield
only=$1
t() {
  name=$1; shift
  if [ -n "$only" ] && [ "$only" != "$name" ]; then return; fi
  node tools/make-texture.mjs "$name" "$S/$name.png" "$@"
}
# Walls and timber.
t plaster --normal=0.5 --calm=0.75 --feather=30
t timber --normal=0.9 --feather-x=24 --feather-y=70
t planks --feather-y=60 --repeat=1.3
t stone --calm=0.25
# Roofs: rows must meet in step, so the join stays crisp.
t roof_tile
t roof_slate
t thatch --feather-x=20 --tint=#ab8a4f --tint-amount=0.6
# Ground.
t cobbles --normal=1.2 --repeat=1.25 --tint=#8f897c --tint-amount=0.85
t dirt --normal=0.7 --calm=0.55 --feather=16 --tint=#b3946f --tint-amount=0.7
t grass --normal=0.6 --calm=0.5
# Nature.
t bark --normal=1.2 --feather-y=40
t rock --normal=1.2 --feather=14
t forest_floor --normal=0.8 --calm=0.4 --feather=10
# Dungeons.
t dungeon_wall --calm=0.3
t flagstones --calm=0.3 --normal=1.1
# Whole objects (not tiled): house windows and doors.
t window --decal --size=512 --normal-size=256 --normal=0.8 --glow
t door --decal --size=512 --normal-size=512 --normal=0.9
# The hero's outfit.
t leather --normal=0.8 --calm=0.5 --feather=14
t gambeson --normal=1.3 --calm=0.5
t steel --normal=0.7 --calm=0.5 --feather=14
