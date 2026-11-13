import json, os
A = 'public/assets/art'
ls = lambda d: sorted(f[:-5] for f in os.listdir(f'{A}/{d}') if f.endswith('.webp')) if os.path.isdir(f'{A}/{d}') else []
npcmap = json.load(open('tools/art/npcmap.json'))
have = set(ls('npc'))
m = {'beast': ls('beast'), 'npc': {n: p for n, p in sorted(npcmap.items()) if p[4:] in have}, 'arch': ls('arch'), 'region': ls('region')}
json.dump(m, open('src/ui/art/artManifest.json', 'w'), indent=0, ensure_ascii=False)
print({k: len(v) for k, v in m.items()})
