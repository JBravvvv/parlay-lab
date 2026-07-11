/* Feature 2+4 integration: allocator + FUN over the REAL fixture board */
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js');
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
shCollectSlate().then(function(slate){
  var d=shAnalyzeLocal(slate);
  var pool=shCardPool(d);
  chk("playable pregame pool exists",pool.length>10,pool.length+" Caesars-playable tickets");
  chk("pool excludes live-leg tickets",pool.every(function(w){return !w.pl.legs.some(function(l){return l.live;});}));
  [37,25,5].forEach(function(amt){
    var a=shAllocate(pool,amt,SH_CFG);
    chk("$"+amt+" allocates exactly",a.sum===amt,"$"+a.sum+" over "+a.picks.length+" tickets: "+a.picks.map(function(p){return "$"+p.stake;}).join("+"));
    var cap=Math.max(SH_CFG.perParlayCap,1/a.picks.length)*amt;
    chk("$"+amt+" respects the cap",a.picks.every(function(p){return p.stake<=cap+1e-9;}),"cap $"+cap.toFixed(1));
  });
  var a1=JSON.stringify(shAllocate(pool,37,SH_CFG).picks.map(function(p){return [p.id,p.stake];}));
  var a2=JSON.stringify(shAllocate(pool,37,SH_CFG).picks.map(function(p){return [p.id,p.stake];}));
  chk("real-pool re-allocation idempotent",a1===a2);
  /* distinct-game spread: the greedy dampener should avoid stacking one game */
  var a37=shAllocate(pool,37,SH_CFG);
  var gset={};a37.picks.forEach(function(p){p.w.pl.legs.forEach(function(l){gset[l.game]=1;});});
  print("  card spreads across "+Object.keys(gset).length+" distinct games");
  /* core discipline on the real pool at the user's actual bankroll: $750, never an HR prop,
     never odds past the ceiling, Kelly-weighted */
  var a750=shAllocate(pool,750,SH_CFG);
  chk("$750 allocates exactly",a750.sum===750,"$"+a750.sum+" over "+a750.picks.length+" tickets");
  var hrLegs=0,overCap=0;
  a750.picks.forEach(function(p){
    if(p.w.pl.czDec>SH_CFG.coreMaxDec)overCap++;
    if(p.w.pl.type==="batter_home_runs")hrLegs++;
    p.w.pl.legs.forEach(function(l){if((l.lkey||"").indexOf("|batter_home_runs|")>=0)hrLegs++;});});
  chk("$750 core: zero HR exposure",hrLegs===0,hrLegs+" HR legs");
  chk("$750 core: all odds within the +1400 ceiling",overCap===0);
  print("  $750 card: "+a750.picks.map(function(p){return p.w.pl.name+" "+p.w.pl.czOdds+" $"+p.stake;}).join(" · "));
  /* HARD RULE on the real pool: no pick appears on two tickets anywhere on the card */
  var core={};a37.picks.forEach(function(p){core[p.id]=1;});
  var f30=shFunPick(pool,30,SH_CFG,core,a37.legs);
  var seen={},dups=[];
  a37.picks.concat(f30.picks).forEach(function(p){p.w.pl.legs.forEach(function(l){
    var k=l.label+"|"+l.prop;if(seen[k])dups.push(k);seen[k]=1;});});
  chk("no pick repeats across the whole card (core+FUN)",dups.length===0,dups.length?dups.join("; "):Object.keys(seen).length+" distinct picks");
  /* FUN over the real pool */
  [10,30,100].forEach(function(amt){
    var f=shFunPick(pool,amt,SH_CFG,core,a37.legs);
    var want=amt<SH_CFG.funAmt2?1:amt<=SH_CFG.funAmt3?2:3;
    chk("FUN $"+amt+" builds tickets, exact sum",f.sum===amt&&f.picks.length>=1&&f.picks.length<=want,
      f.picks.map(function(p){return SH_CFG.funTierNames[p.tier]+" "+p.w.pl.czOdds+" $"+p.stake+" ("+p.w.pl.prob+"%)";}).join(" · "));
    chk("FUN $"+amt+" all legs Caesars-priced, no core overlap",
      f.picks.every(function(p){return p.w.pl.czDec!=null&&!core[p.id];}));
  });
  var f100=shFunPick(pool,100,SH_CFG,core);
  f100.picks.forEach(function(p){
    var am=decToAm(p.w.pl.czDec);
    var t=SH_CFG.funTiers[p.tier];
    print("  FUN "+SH_CFG.funTierNames[p.tier]+": "+p.w.pl.name+" "+p.w.pl.czOdds+" (am "+am+") true "+p.w.pl.prob+"% ≈1-in-"+Math.round(100/p.w.pl.prob)+" slates"+(p.w.pl.posCorr?" [SIM-CORRELATED]":""));
  });
  print(fails.length?("CARD INTEGRATION FAILURES: "+fails.length):"CARD INTEGRATION: ALL ASSERTIONS PASS");
}).catch(function(e){print("ERR "+e+"\n"+(e&&e.stack||""));});
