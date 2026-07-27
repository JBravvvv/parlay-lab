import json,re,math
from collections import defaultdict
B='/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/43a0f1e0-7096-4c57-aa94-4cc966766115/scratchpad/b-2026-07-26.json'
d=json.load(open(B))['board']['data']
def cdf(k,l):
    s=0.0;t=math.exp(-l)
    for i in range(int(k)+1): s+=t;t*=l/(i+1)
    return s
def pov(line,lam): return 1-cdf(math.floor(line),lam)
def inv(line,p):
    if not (0<p<1): return None
    lo,hi=1e-6,60.
    for _ in range(90):
        m=(lo+hi)/2
        if pov(line,m)<p: lo=m
        else: hi=m
    return (lo+hi)/2
def med(x):
    s=sorted(x);n=len(s)
    return None if not n else (s[n//2] if n%2 else (s[n//2-1]+s[n//2])/2)
rows=d['categories']['batter_hits_runs_rbis']
R=[]
for r in rows:
    m=re.search(r'\(~([\d.]+) AB vs ([\d.]+) AB/g\)',r['case'])
    ln=float(str(r['lkey']).split('|')[2]); und=' U ' in r['sub']
    pm=(100-r['pModel'] if und else r['pModel'])/100
    im=(100-r['implied'] if und else r['implied'])/100
    lm,lk=inv(ln,pm),inv(ln,im)
    if lm is None or lk is None: continue
    R.append(dict(who=r['lkey'].split('|')[0],lab=r['label'],ln=ln,lm=lm,lk=lk,
                  gap=(pm-im)*100, abG=float(m.group(2)) if m else None))

print("A. PART-TIMER SPLIT — is the gap concentrated in low-AB/game batters?")
print("   (abG = his own last-30 ABs per game PLAYED; low = regularly lifted / platooned)\n")
print(f"{'abG band':<14}{'n':>4}{'medGap':>9}{'med abG':>9}   lines")
bands=[('<3.0 part-timer',lambda x:x<3.0),('3.0-3.5',lambda x:3.0<=x<3.5),
       ('3.5-4.0',lambda x:3.5<=x<4.0),('>=4.0 everyday',lambda x:x>=4.0)]
for nm,f in bands:
    v=[x for x in R if x['abG'] is not None and f(x['abG'])]
    if not v: continue
    lc=defaultdict(int)
    for x in v: lc[x['ln']]+=1
    print(f"{nm:<14}{len(v):>4}{med([x['gap'] for x in v]):>+9.1f}{med([x['abG'] for x in v]):>9.2f}   {dict(sorted(lc.items()))}")
print()
for ln in (0.5,1.5):
    print(f"   O{ln} only:")
    for nm,f in bands:
        v=[x for x in R if x['ln']==ln and x['abG'] is not None and f(x['abG'])]
        if len(v)>=3: print(f"     {nm:<16}n={len(v):<3} medGap {med([x['gap'] for x in v]):+.1f} pp")

print("\nB. LADDER SHAPE — the MARKET's implied lambda at each rung, same player")
print("   A single Poisson has ONE lambda. If the market's implied lambda RISES with the")
print("   rung, the market's distribution has a fatter tail than any Poisson can produce.\n")
byp=defaultdict(dict)
for x in R: byp[x['who']][x['ln']]=x
pairs=[(w,v) for w,v in byp.items() if 0.5 in v and 1.5 in v]
print(f"   players with both O0.5 and O1.5: {len(pairs)}")
if pairs:
    dk=[v[1.5]['lk']-v[0.5]['lk'] for _,v in pairs]
    dm=[v[1.5]['lm']-v[0.5]['lm'] for _,v in pairs]
    print(f"{'':<6}{'lam@O0.5':>10}{'lam@O1.5':>10}{'delta':>9}")
    print(f"{'MARKET':<6}{med([v[0.5]['lk'] for _,v in pairs]):>10.3f}{med([v[1.5]['lk'] for _,v in pairs]):>10.3f}{med(dk):>+9.3f}")
    print(f"{'MODEL':<6}{med([v[0.5]['lm'] for _,v in pairs]):>10.3f}{med([v[1.5]['lm'] for _,v in pairs]):>10.3f}{med(dm):>+9.3f}")
    print(f"\n   market lambda RISES from O0.5 to O1.5 in {sum(1 for x in dk if x>0)} of {len(dk)} players")
    print(f"   model  lambda rises in {sum(1 for x in dm if x>0)} of {len(dm)}  (should be 0 -- the model IS one Poisson per player)")
    print("\n   per player:")
    for w,v in sorted(pairs,key=lambda kv:-(kv[1][1.5]['lk']-kv[1][0.5]['lk']))[:12]:
        print(f"     {v[0.5]['lab'][:26]:<28} mkt {v[0.5]['lk']:.2f}->{v[1.5]['lk']:.2f} ({v[1.5]['lk']-v[0.5]['lk']:+.2f})"
              f"   model {v[0.5]['lm']:.2f}->{v[1.5]['lm']:.2f} ({v[1.5]['lm']-v[0.5]['lm']:+.2f})")
