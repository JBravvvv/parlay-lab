/* Feature-1 integration probe: Caesars fields populate from real fixtures */
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js');
shCollectSlate().then(function(slate){
  var fails=[];
  function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
  /* ingestion level */
  var mlCz=slate.game_odds.filter(function(o){return o.home_ml_cz!=null&&o.away_ml_cz!=null;}).length;
  chk("Caesars ML captured per game",mlCz>=8,mlCz+"/"+slate.game_odds.length+" games");
  var rlCz=slate.game_odds.filter(function(o){return o.home_rl_cz!=null;}).length;
  chk("Caesars RL captured (modal point only)",rlCz>=5,rlCz+" games");
  var pRows=0,pCz=0;
  Object.keys(slate.props).forEach(function(mu){var mks=slate.props[mu].markets;
    Object.keys(mks).forEach(function(k){mks[k].forEach(function(r){pRows++;if(r.cz)pCz++;});});});
  chk("Caesars prop prices captured",pCz>0,pCz+"/"+pRows+" prop rows have a Caesars quote");
  /* alternate-ladder plumbing (build 44): the synthetic-ladder event's hits rows get a
     Caesars price from batter_hits_alternate; consensus and best price stay untouched
     (no *_alternate market ever creates rows or enters fairs/line shopping) */
  var altHits=0,altBooks=[],altMkts=0;
  Object.keys(slate.props).forEach(function(mu){var mks=slate.props[mu].markets;
    if(mks.batter_hits_alternate!=null)altMkts++;
    (mks.batter_hits||[]).forEach(function(r){
      if(r.cz&&r.cz.o!=null&&r.cz.u==null){altHits++;altBooks.push(r.books);}});});
  chk("hits rows priced at Caesars via the alternate ladder",altHits>=10,altHits+" rows (over-only, as Caesars posts them)");
  chk("no *_alternate market leaked onto the board",altMkts===0);
  chk("alternate never enters consensus (books count = standard books only)",altBooks.every(function(b){return b>=1&&b<=2;}),"books counts: "+altBooks.slice(0,6).join(","));
  var d=shAnalyzeLocal(slate);
  var C=d.categories;
  /* engine rows */
  var withCz=0,noCz=0,badgeCz=0,edges=[];
  Object.keys(C).forEach(function(k){if(k==="all")return;(C[k]||[]).forEach(function(r){
    if(r.cz!=null){withCz++;if(r.czBadge)badgeCz++;if(r.czEdge!=null)edges.push(r.czEdge);}
    else noCz++;
    if(r.cz!=null&&(r.czEv==null||r.czOdds==null||r.czKellyF==null))fails.push("cz row missing derived fields: "+r.label);
  });});
  chk("playable rows carry czEv/czOdds/czKellyF",fails.length===0,withCz+" playable / "+noCz+" not-at-Caesars");
  chk("cz price-edge computed",edges.length>0,"sample edges: "+edges.slice(0,5).join(", "));
  /* sanity: Caesars EV never better than best-price EV by construction */
  var viol=0;Object.keys(C).forEach(function(k){if(k==="all")return;(C[k]||[]).forEach(function(r){
    if(r.cz!=null&&r.czEv!=null&&r.ev!=null&&r.czEv>r.ev+0.05)viol++;});});
  chk("czEv <= best-price EV (line shopping dominates)",viol===0,viol+" violations");
  /* parlays */
  var czTix=0,unavTix=0;
  [].concat(d.parlays,d.parlaysMixed).forEach(function(pl){
    if(pl.czOdds!=null){czTix++;if(pl.czDec==null||pl.czEv==null)fails.push("ticket cz missing derived: "+pl.name);}
    else unavTix++;
    pl.legs.forEach(function(l){if(!("cz" in l))fails.push("leg missing cz field: "+l.label);});
  });
  chk("tickets re-priced at Caesars",czTix>0,czTix+" playable / "+unavTix+" unavailable_at_book");
  var sample=(C.all||[]).filter(function(r){return r.cz!=null;})[0];
  if(sample)print("sample playable pick: "+sample.label+" "+sample.sub+" "+sample.czOdds+" @ Caesars · czEV "+sample.czEv+"% · vs fair "+sample.czEdge+"% · engine EV "+sample.ev+"%");
  var st=(d.parlays||[]).filter(function(p){return p.czOdds!=null;})[0];
  if(st)print("sample playable ticket: "+st.name+" "+st.czOdds+" @ Caesars (best-price "+st.odds+") czEV "+st.czEv+"%");
  print(fails.length?("FEATURE-1 FAILURES: "+fails.length):"FEATURE 1: ALL ASSERTIONS PASS");
}).catch(function(e){print("ERR "+e+"\n"+(e&&e.stack||""));});
