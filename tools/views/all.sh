#!/bin/sh
# Look-dev viewpoints: spawn plaza, hill vista over town, farm meadow, village street.
P=${1:-before}
node tools/shot.mjs ${P}-spawn --query="test&view=0,10,3.14159,0.22,4.8,1" --script=tools/views/view.js
node tools/shot.mjs ${P}-vista --query="test&view=0,-318,0,0.32,7.2" --script=tools/views/view.js
node tools/shot.mjs ${P}-meadow --query="test&view=-40,150,3.14159,0.03,5" --script=tools/views/view.js
node tools/shot.mjs ${P}-street --query="test&view=30,30,2.4,0.12,5" --script=tools/views/view.js
