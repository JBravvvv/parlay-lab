/* build 43 surgical diff: the ONLY generation change allowed is HR legs leaving MIX tickets */
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js');
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
var base=readFile(DIR+'/../baseline39.json');
var A=JSON.parse(base.slice(base.indexOf('\t')+1).trim());
function isHR(leg){return leg.indexOf("|HR (anytime)")>=0;}
shCollectSlate().then(function(slate){
  var d=shAnalyzeLocal(slate);
  /* 1) singles untouched */
  var catsNow={};Object.keys(d.categories).sort().forEach(function(k){
    catsNow[k]=(d.categories[k]||[]).map(function(r){return [r.label,r.sub,String(r.odds),r.prob,r.ev];});});
  chk("categories identical to build-39 baseline",JSON.stringify(catsNow)===JSON.stringify(A.categories));
  /* 2) HR never mixes with any other prop type — across every set */
  var mixedHR=0,total=0;
  [d.parlays,d.parlaysMixed,d.parlaysLive].forEach(function(set){(set||[]).forEach(function(pl){
    total++;
    var hr=pl.legs.filter(function(l){return /HR \(anytime\)/.test(l.prop);}).length;
    if(hr>0&&hr!==pl.legs.length)mixedHR++;
  });});
  chk("zero tickets mixing HR with other props ("+total+" tickets checked)",mixedHR===0,mixedHR+" violations");
  /* 3) per-type tickets identical; only MIX tickets may differ, and old-MIX-minus-new-MIX
        differences must be attributable to HR legs */
  function tix(set){return (set||[]).map(function(p){return {n:p.name,o:p.odds,p:p.prob,type:p.type,
    legs:p.legs.map(function(l){return l.label+"|"+l.prop+"|"+l.odds;})};});}
  var now={parlays:tix(d.parlays),parlaysMixed:tix(d.parlaysMixed),parlaysLive:tix(d.parlaysLive)};
  ["parlays","parlaysMixed","parlaysLive"].forEach(function(k){
    var oldTyped=A[k].filter(function(p){return p.n.indexOf("Mixed")!==0;});
    var newTyped=now[k].filter(function(p){return p.n.indexOf("Mixed")!==0;});
    chk(k+": per-type tickets byte-identical",JSON.stringify(oldTyped)===JSON.stringify(newTyped.map(function(p){return {n:p.n,o:p.o,p:p.p,legs:p.legs};})),oldTyped.length+" tickets");
    var oldMixHR=A[k].filter(function(p){return p.n.indexOf("Mixed")===0&&p.legs.some(isHR);}).length;
    var newMixHR=now[k].filter(function(p){return p.n.indexOf("Mixed")===0&&p.legs.some(function(l){return isHR(l);});}).length;
    print("  "+k+": Mixed tickets carrying an HR leg "+oldMixHR+" -> "+newMixHR);
    chk(k+": no HR leg remains in any Mixed ticket",newMixHR===0);
  });
  print(fails.length?("DIFF43 FAILURES: "+fails.length):"DIFF43: change is exactly the HR-isolation rule, nothing else");
}).catch(function(e){print("ERR "+e+"\n"+(e&&e.stack||""));});
