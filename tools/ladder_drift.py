import json,math
from collections import defaultdict
B='/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/43a0f1e0-7096-4c57-aa94-4cc966766115/scratchpad/b-2026-07-26.json'
d=json.load(open(B))['board']['data']
LAB={'batter_hits':'hits','batter_total_bases':'TB','batter_home_runs':'HR',
     'batter_hits_runs_rbis':'HRR','pitcher_strikeouts':"K's",'pitcher_outs':'outs'}
def cdf(k,l):
    s=0.0;t=math.exp(-l)
    for i in range(int(k)+1): s+=t;t*=l/(i+1)
    return s
def inv(line,p):
    if not (0<p<1): return None
    lo,hi=1e-6,80.
    for _ in range(90):
        m=(lo+hi)/2
        if 1-cdf(math.floor(line),m)<p: lo=m
        else: hi=m
    return (lo+hi)/2
def med(x):
    s=sorted(x);n=len(s)
    return None if not n else (s[n//2] if n%2 else (s[n//2-1]+s[n//2])/2)

# use propBoard: uncapped, over-oriented, every rung the book posts
rows=defaultdict(lambda: defaultdict(dict))   # mkt -> player -> line -> (pModel_over, fO)
simtag=defaultdict(int); tot=defaultdict(int)
for g in d.get('propBoard') or []:
    for mkt,rs in (g.get('markets') or {}).items():
        if mkt not in LAB: continue
        for r in rs:
            if r.get('alt') or r.get('pO') is None or r.get('fO') is None or r.get('ln') is None: continue
            pm=r['fO']+(r['pO']-r['fO'])/0.35
            rows[mkt][r['lkey'].split('|')[0]][r['ln']]=(pm,r['fO'])
for mkt,rs in (d.get('categories') or {}).items():
    if mkt not in LAB: continue
    for r in rs:
        tot[mkt]+=1
        if 'sim' in (r.get('tags') or []): simtag[mkt]+=1

print("LADDER DRIFT — Poisson-implied lambda at consecutive rungs, SAME player.")
print("Poisson is a REFERENCE here, not a claim about the engine's family: if the")
print("market's implied lambda drifts across rungs and the model's does not, the model")
print("is less dispersed than the market. Equal drift = same dispersion.\n")
print(f"{'mkt':<6}{'pairs':>7}{'rungs':>14}{'mktDrift':>10}{'modDrift':>10}{'ratio':>8}   verdict")
for mkt in sorted(rows,key=lambda m:-len(rows[m])):
    pairs=[]
    for who,lv in rows[mkt].items():
        ls=sorted(lv)
        for a,b in zip(ls,ls[1:]):
            pa,fa=lv[a]; pb,fb=lv[b]
            ma,mb=inv(a,min(max(pa,.01),99.99)/100),inv(b,min(max(pb,.01),99.99)/100)
            ka,kb=inv(a,fa/100),inv(b,fb/100)
            if None in (ma,mb,ka,kb): continue
            pairs.append((b-a,kb-ka,mb-ma))
    if len(pairs)<4: 
        print(f"{LAB[mkt]:<6}{len(pairs):>7}{'—':>14}{'—':>10}{'—':>10}{'—':>8}   too few multi-rung players")
        continue
    dk,dm=med([p[1] for p in pairs]),med([p[2] for p in pairs])
    rungs=sorted({round(p[0],1) for p in pairs})
    ratio=(dm/dk) if dk else None
    v=('UNDER-DISPERSED' if ratio is not None and ratio<0.5 else
       'ok' if ratio is not None and ratio>0.8 else 'partial')
    print(f"{LAB[mkt]:<6}{len(pairs):>7}{str(rungs):>14}{dk:>+10.3f}{dm:>+10.3f}"
          f"{(f'{ratio:.2f}' if ratio is not None else '—'):>8}   {v}")
print()
print("sim-tagged rows in `categories` (the sim marginal replaces pO for HRR pregame):")
for mkt in sorted(tot): print(f"   {LAB[mkt]:<6} {simtag[mkt]:>3} of {tot[mkt]}")
