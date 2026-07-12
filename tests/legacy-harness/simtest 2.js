load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/sim_only.js');
/* league-average batter (2026-ish): BA .244, HR/AB .032, BB/PA .085 */
var pBB=0.095,ab=1-pBB,hit=0.244,hr=0.032,p2=hit*0.20,p3=hit*0.015,p1=hit-hr-p2-p3;
var v=[pBB,p1*ab,p2*ab,p3*ab,hr*ab];
var bat=[];for(var i=0;i<9;i++)bat.push({vSP:v,vBP:v});
var legs=[{key:"ml_home",type:"ml_home"},{key:"rl_home",type:"rl",team:"home",pt:-1.5},
          {key:"b0h",team:"home",bat:0,stat:"h",ln:1.5},{key:"b0hrr",team:"home",bat:0,stat:"hrr",ln:1.5}];
var ctx={away:{bat:bat},home:{bat:bat},awayLeash:17,homeLeash:17,legs:legs};
var r1=shSimGames(ctx,20000,12345);
var r2=shSimGames(ctx,20000,12345);
var r3=shSimGames(ctx,20000,99999);
print("avg runs/team: home "+r1.avgHome.toFixed(2)+" away "+r1.avgAway.toFixed(2)+" (league ~4.2-4.6)");
print("home win% (equal teams): "+(r1.pHome*100).toFixed(1)+" (expect ~50-53)");
print("home -1.5 cover: "+(r1.pHomeM15*100).toFixed(1)+"  away +1.5: "+(r1.pAwayP15*100).toFixed(1)+" (sum w/ others sane)");
print("P(2+ H leadoff): "+(r1.legP["b0h"]*100).toFixed(1)+" (expect ~25-35)");
print("P(2+ H+R+RBI leadoff): "+(r1.legP["b0hrr"]*100).toFixed(1)+" (expect ~30-45)");
print("corr(ml_home, b0hrr home batter): "+(r1.corr("ml_home","b0hrr")||0).toFixed(3)+" (expect positive)");
print("deterministic same seed: "+((r1.pHome===r2.pHome&&r1.legP["b0h"]===r2.legP["b0h"])?"YES":"NO"));
print("differs across seeds: "+((r1.pHome!==r3.pHome)?"YES":"NO"));
var bad=(r1.pHome<0||r1.pHome>1||!isFinite(r1.avgHome));
print(bad?"SANITY FAIL":"SANITY OK");
