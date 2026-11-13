#!/usr/bin/env python3
"""Add the painted skill emblems in public/assets/icons/emblem/ to manifest.json.

usage: python3 tools/fx/emblem-manifest.py <keymap.json>
keymap.json maps an emblem key ('pyromancer:Fireball', 'class:ranger') to its
file stem ('emblem/pyromancer-fireball'). Only files that exist are listed, and
the manifest version is bumped so browsers fetch the new art.
"""
import json, os, sys, hashlib, time
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'icons')
keys = json.load(open(sys.argv[1]))
m = json.load(open(os.path.join(ROOT, 'manifest.json')))
ext = m.get('ext', 'png')
m['emblems'] = {k: f for k, f in sorted(keys.items()) if os.path.exists(os.path.join(ROOT, f'{f}.{ext}'))}
m['v'] = hashlib.sha1(str(time.time()).encode()).hexdigest()[:8]
json.dump(m, open(os.path.join(ROOT, 'manifest.json'), 'w'), separators=(',', ':'))
print(len(m['emblems']), 'emblems, v', m['v'])
