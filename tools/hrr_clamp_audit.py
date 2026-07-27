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
cl=lambda v,lo,hi: max(lo,min(hi,v))
rows=d['categories']['batter_hits_runs_rbis']
R=[]
for r in rows:
    m=re.search(r're-based to ([^(]*)\(~([\d.]+) AB vs ([\d.]+) AB/g\)',r['case'])
    if not m: continue
    src=m.group(1).strip(); e,a=float(m.group(2)),float(m.group(3)); raw=e/a
    ln=float(str(r['lkey']).split('|')[2]); und=' U ' in r['sub']
    pm=(100-r['pModel'] if und else r['pModel'])/100
    imp=(100-r['implied'] if und else r['implied'])
    lam_now=inv(ln,pm)
    if lam_now is None: continue
    lam_pre=lam_now/cl(raw,0.85,1.15)
    spot=None
    sm=re.search(r'#(\d+) spot',src)
    if sm: spot=int(sm.group(1))
    R.append(dict(lab=r['label'],ln=ln,raw=raw,spot=spot,proj=('projected' in src),imp=imp,
                  lam_pre=lam_pre,
                  p115=pov(ln,lam_pre*cl(raw,0.85,1.15))*100,
                  p140=pov(ln,lam_pre*cl(raw,0.85,1.40))*100,
                  pinf=pov(ln,lam_pre*raw)*100))
print("HRR CLAMP TRUNCATION — model-minus-market gap under three clamp ceilings")
print("(negative gap = model BELOW market; the 2026-07 miss was the model too HIGH)\n")
print(f"{'line':>6}{'n':>4}{'gap @1.15':>11}{'gap @1.40':>11}{'gap unclamped':>15}{'   delta 1.15->inf':>18}")
by=defaultdict(list)
for x in R: by[x['ln']].append(x)
for ln in sorted(by):
    v=by[ln]
    g1=med([x['p115']-x['imp'] for x in v]); g4=med([x['p140']-x['imp'] for x in v]); gi=med([x['pinf']-x['imp'] for x in v])
    print(f"{ln:>6}{len(v):>4}{g1:>+11.1f}{g4:>+11.1f}{gi:>+15.1f}{(gi-g1):>+18.1f}")
alt=[x for x in R if x['ln']>0.5]
g1=med([x['p115']-x['imp'] for x in alt]); g4=med([x['p140']-x['imp'] for x in alt]); gi=med([x['pinf']-x['imp'] for x in alt])
print(f"{'O1.5+':>6}{len(alt):>4}{g1:>+11.1f}{g4:>+11.1f}{gi:>+15.1f}{(gi-g1):>+18.1f}")
print()
print("WHERE THE TRUNCATION BINDS — raw ratio by batting-order slot")
print(f"{'slot':>10}{'n':>4}{'medRaw':>9}{'maxRaw':>9}{'>1.15':>8}{'medExpAB':>10}{'medAbG':>9}")
grp=defaultdict(list)
for x in R:
    k='projected' if x['proj'] else (f"#{x['spot']}" if x['spot'] else '?')
    grp[k].append(x)
def key(k):
    return (0,0) if k=='projected' else (1,int(k[1:])) if k.startswith('#') else (2,0)
for k in sorted(grp,key=key):
    v=grp[k]
    print(f"{k:>10}{len(v):>4}{med([x['raw'] for x in v]):>9.3f}{max(x['raw'] for x in v):>9.3f}"
          f"{sum(1 for x in v if x['raw']>1.15):>8}"
          f"{med([x['raw']*0+0 for x in v]) if False else '':>0}", end='')
    print(f"{'':>0}")
print()
print("top-5 raw ratios (where the clamp truncates hardest):")
for x in sorted(R,key=lambda y:-y['raw'])[:5]:
    print(f"   raw {x['raw']:.3f}  {('#'+str(x['spot'])) if x['spot'] else 'projected':<10} O{x['ln']:<4} {x['lab'][:30]}")
