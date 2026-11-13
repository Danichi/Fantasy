import json,re
B=json.load(open('/tmp/beasts.json'))
N=[l.strip().split('|',1) for l in open('npcs.txt') if l.strip()]
ARCH=[('arch/guardM','a town guard, man, kettle helm and red tabard'),('arch/guardF','a town guard, woman, mail coif and red tabard'),
('arch/farmerM','a farmer, weathered man, straw hat'),('arch/farmerF','a farmer, woman, headscarf, sunburnt'),
('arch/merchantM','a merchant, plump man, velvet cap'),('arch/merchantF','a merchant, woman, fur-trimmed cloak'),
('arch/monkM','a monk, shaven man in a brown habit'),('arch/priestF','a priestess of the Dawn, white and gold vestments'),
('arch/oldM','an old villager, white-bearded man'),('arch/oldF','an old villager, grey-haired woman, shawl'),
('arch/boy','a village boy, freckles, tousled hair'),('arch/girl','a village girl, braids'),
('arch/sailorM','a sailor, man, knit cap, salt-stained coat'),('arch/sailorF','a sailor, woman, bandana, earrings'),
('arch/nobleM','a noble lord, embroidered doublet'),('arch/nobleF','a noble lady, jewelled circlet'),
('arch/soldierM','a soldier, man, steel breastplate'),('arch/desertM','a desert townsman, sun-dark man in a linen headwrap')]
PSTYLE=("Every portrait in exactly the same style: realistic, highly detailed painted fantasy RPG character portrait, head and shoulders bust, three-quarter view facing slightly left, "
 "believable faces of varied ages and ethnicities, real materials (wool, leather, steel, linen), soft warm light from the upper left, painterly like classic CRPG portrait art. "
 "Medieval fantasy clothing. Each person is a cut-out bust with no background, the shoulders cut off cleanly at the bottom.")
BSTYLE=("Every creature in exactly the same style: realistic, highly detailed painted bestiary plate illustration, like a naturalist's field guide crossed with dark fantasy concept art, "
 "the whole creature shown full body in three-quarter side view, menacing but anatomically believable, soft light from the upper left, a faint soft shadow under it, no background scene, no ground.")
def head(n,k,what): return f"A {n} by {n} grid of {k} separate {what} on a fully transparent background, evenly spaced, each centred in its own equal square cell with clear empty margin around it, no borders, no grid lines, no frames, no text, no labels, no numbers. "
S=[]
def sheet(name,items,n,what,style):
    rows=[]
    for r in range(0,len(items),n):
        rows.append(f"Row {r//n+1}: "+"; ".join(f"{r+c+1} {d}" for c,(i,d) in enumerate(items[r:r+n])))
    p=head(n,n*n,what)+style+"\n"+"\n".join(rows)
    if len(items)<n*n: p+=f"\nCells after number {len(items)} stay empty."
    S.append({'name':name,'ids':[i for i,_ in items],'n':n,'prompt':p})
be=[('beast/'+b['id'],f"{b['name']}{' (a great boss creature)' if b['boss'] else ''}: {b['lore'].split('.')[0]}") for b in B]
for j in range(0,len(be),16): sheet(f"beast{j//16+1:02d}",be[j:j+16],4,'creatures',BSTYLE)
pe=[('npc/'+re.sub(r'[^a-z0-9]+','-',nm.lower()).strip('-'),f"{nm}, {t}") for nm,t in N]+[(i,d) for i,d in ARCH]
for j in range(0,len(pe),25): sheet(f"npc{j//25+1:02d}",pe[j:j+25],5,'character portraits',PSTYLE)
json.dump(S,open('sheets.json','w'),indent=0)
json.dump({nm:'npc/'+re.sub(r'[^a-z0-9]+','-',nm.lower()).strip('-') for nm,t in N},open('npcmap.json','w'))
print(len(S),[ (s['name'],len(s['ids'])) for s in S])
print(S[0]['prompt'][:1500]); print(S[6]['prompt'][-700:])
