"""H+R+RBI PA-CONDITIONING AUDIT — does the 2026-07-22 fix explain the miss?

    python3 tools/hrr_pa_audit.py b-2026-07-26.json
    curl -s "https://parlay-lab-six.vercel.app/api/board?date=2026-07-26" -o b.json

WHY (2026-07-26): the range-compression hypothesis for H+R+RBI was retracted, leaving the
PA-conditioning defect as the ONLY identified mechanism for 46.3% realised vs 59.2% implied.
This reads the fix's own correction back off the board — `case` states "re-based to #N spot
PA (~X AB vs Y AB/g)", so `clamp(expAB/abG, 0.85, 1.15)` is recoverable per row — and asks
whether it is even large enough, and pointed the right way, to account for the miss.

ANSWER ON THE 2026-07-26 BOARD: no, and no. Median correction 1.144; 38 of 44 rows are
UPWARD; the maximum possible downward effect is 5.9 pp (O0.5) / 7.2 pp (O1.5) against a
27 pp miss on O1.5+. See docs/hrr-recalibration.md.

NOT A SUBSTITUTE for replaying the graded legs through the PA-conditioned model — that needs
the prediction store and therefore the owner's sync phrase. This is the bound, computed from
public data, and a bound is enough to establish that a residual exists.
"""
import json,re,math,sys
from collections import defaultdict
B=sys.argv[1] if len(sys.argv)>1 else "b.json"
d=json.load(open(B))['board']['data']
def cdf(k,l):
    s=0.0;t=math.exp(-l)
    for i in range(int(k)+1): s+=t;t*=l/(i+1)
    return s
def pover(line,lam): return 1-cdf(math.floor(line),lam)
def inv(line,p):
    if not (0<p<1): return None
    lo,hi=1e-6,60.
    for _ in range(90):
        m=(lo+hi)/2
        if pover(line,m)<p: lo=m
        else: hi=m
    return (lo+hi)/2
def med(x):
    s=sorted(x); n=len(s)
    return None if not n else (s[n//2] if n%2 else (s[n//2-1]+s[n//2])/2)
rows=d['categories']['batter_hits_runs_rbis']
out=[]
for r in rows:
    m=re.search(r're-based to [^(]*\(~([\d.]+) AB vs ([\d.]+) AB/g\)',r['case'])
    if not m: continue
    expAB,abG=float(m.group(1)),float(m.group(2))
    corr=min(max(expAB/abG,0.85),1.15)
    ln=float(str(r['lkey']).split('|')[2])
    und=' U ' in r['sub']
    pm_over=(100-r['pModel'] if und else r['pModel'])/100
    lam_post=inv(ln,pm_over)
    if lam_post is None: continue
    lam_pre=lam_post/corr
    out.append(dict(lab=r['label'],ln=ln,corr=corr,lam_post=lam_post,lam_pre=lam_pre,
                    p_post=pover(ln,lam_post)*100,p_pre=pover(ln,lam_pre)*100,
                    imp=(100-r['implied'] if und else r['implied']),susp=bool(r.get('susp'))))
print(f"PA-CONDITIONING FIX (L2368, lam *= clamp(expAB/abG, 0.85, 1.15)) — real board 2026-07-26")
print(f"recovered from the `case` string on {len(out)} of {len(rows)} H+R+RBI rows\n")
lo=sum(1 for x in out if x['corr']<=0.8501); hi=sum(1 for x in out if x['corr']>=1.1499)
print(f"  correction factor: min {min(x['corr'] for x in out):.3f}  median {med([x['corr'] for x in out]):.3f}  max {max(x['corr'] for x in out):.3f}")
print(f"  at the LOW clamp (0.85): {lo}    at the HIGH clamp (1.15): {hi}    in range: {len(out)-lo-hi}")
print(f"  factors ABOVE 1 (fix RAISES the model's probability): {sum(1 for x in out if x['corr']>1)} of {len(out)}")
print(f"  factors BELOW 1 (fix LOWERS it):                      {sum(1 for x in out if x['corr']<1)} of {len(out)}")
print()
print(f"{'line':>6}{'n':>4}{'medCorr':>9}{'med p_pre':>11}{'med p_post':>12}{'med effect':>12}{'min':>8}{'max':>8}")
by=defaultdict(list)
for x in out: by[x['ln']].append(x)
for ln in sorted(by):
    v=by[ln]; eff=[x['p_post']-x['p_pre'] for x in v]
    print(f"{ln:>6}{len(v):>4}{med([x['corr'] for x in v]):>9.3f}{med([x['p_pre'] for x in v]):>11.1f}"
          f"{med([x['p_post'] for x in v]):>12.1f}{med(eff):>+12.1f}{min(eff):>+8.1f}{max(eff):>+8.1f}")
alt=[x for x in out if x['ln']>0.5]; eff=[x['p_post']-x['p_pre'] for x in alt]
print(f"{'O1.5+':>6}{len(alt):>4}{med([x['corr'] for x in alt]):>9.3f}{med([x['p_pre'] for x in alt]):>11.1f}"
      f"{med([x['p_post'] for x in alt]):>12.1f}{med(eff):>+12.1f}{min(eff):>+8.1f}{max(eff):>+8.1f}")
print()
print("MAXIMUM POSSIBLE effect of this fix, at the clamp floor (corr = 0.85), by line:")
for ln in sorted(by):
    v=by[ln]
    worst=[pover(ln,x['lam_post'])*100 - pover(ln,x['lam_post']/0.85*0.85/1.0)*100 for x in v]
    # bound: model at lam vs the SAME model with lam*0.85 (the most the fix could ever pull down)
    b=[pover(ln,x['lam_post'])*100 - pover(ln,x['lam_post']*0.85)*100 for x in v]
    print(f"  O{ln}: median {med(b):.1f} pp   (n={len(v)})")
print()
print("model vs MARKET on the same rows (pModel - implied, over-oriented pp):")
for ln in sorted(by):
    v=by[ln]; g=[x['p_post']-x['imp'] for x in v]
    print(f"  O{ln}: median {med(g):+.1f} pp   n={len(v)}")
