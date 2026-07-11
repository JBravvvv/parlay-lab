/* build 40 unit fixtures — allocator (hand-computed expectations, python-verified) */
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js');
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
function T(name,czEv,prob,legs,czDec){return {pl:{name:name,type:"MIX",czEv:czEv,ev:czEv,prob:prob,czDec:czDec||2,czOdds:"+100",fair:null,
  legs:legs.map(function(l){return {label:l[0],prop:l[1],game:l[2],cz:-110,odds:"-110",live:false};})},src:"p",idx:0};}

/* A — exact sum, cap water-fill, remainder to highest-EV (expected [14,14,9] on $37) */
var A=[T("T1",10,40,[["A","x","g1"]]),T("T2",5,50,[["B","y","g2"]]),T("T3",2,60,[["C","z","g3"]])];
var rA=shAllocate(A,37,SH_CFG);
chk("A: exact sum",rA.sum===37,"$"+rA.sum);
chk("A: hand-computed stakes 14/14/9",JSON.stringify(rA.picks.map(function(p){return p.stake;}))==="[14,14,9]",rA.picks.map(function(p){return p.pl?0:p.stake;}).join()||rA.picks.map(function(p){return p.stake;}).join("/"));
chk("A: card EV 6.162%",Math.abs(rA.ev*100-6.162)<0.01,(rA.ev*100).toFixed(3)+"%");
chk("A: 40% cap respected",rA.picks.every(function(p){return p.stake<=14.8+1e-9;}));

/* B — tiny pool: cap relaxes to 1/n so the sum can be exact ($10 across 2 -> 5/5) */
var B=[T("T1",20,50,[["A","x","g1"]]),T("T2",10,50,[["B","y","g2"]])];
var rB=shAllocate(B,10,SH_CFG);
chk("B: 2-ticket pool splits 5/5 exact",rB.sum===10&&rB.picks.length===2&&rB.picks[0].stake===5&&rB.picks[1].stake===5,rB.picks.map(function(p){return p.stake;}).join("/"));

/* C — correlated-exposure dampening: same-game ticket loses its slot to an independent one */
var C=[T("T1",8,50,[["A","x","g1"],["B","y","g1"]]),
       T("T2",7.9,50,[["C","z","g1"],["D","w","g1"]]),  /* shares g1 with T1: eff halves */
       T("T3",6,50,[["E","q","g2"],["F","r","g2"]])];
var rC=shAllocate(C,30,SH_CFG);
var namesC=rC.picks.map(function(p){return p.w.pl.name;});
chk("C: greedy order dampens the game-stacking ticket",namesC[0]==="T1"&&namesC[1]==="T3"&&namesC[2]==="T2",namesC.join(","));
chk("C: stacked ticket gets the smallest stake",rC.picks[2].stake<=rC.picks[1].stake&&rC.picks[2].stake<=rC.picks[0].stake,rC.picks.map(function(p){return p.stake;}).join("/"));

/* D — idempotence: same inputs -> byte-identical allocation */
var d1=JSON.stringify(shAllocate(A,37,SH_CFG).picks.map(function(p){return [p.id,p.stake];}));
var d2=JSON.stringify(shAllocate(A,37,SH_CFG).picks.map(function(p){return [p.id,p.stake];}));
chk("D: re-allocation idempotent",d1===d2);

/* E — negative-EV slate still allocates the FULL amount (thin-slate banner discloses) */
var E=[T("T1",-5,60,[["A","x","g1"]]),T("T2",-8,55,[["B","y","g2"]]),T("T3",-2,50,[["C","z","g3"]])];
var rE=shAllocate(E,25,SH_CFG);
chk("E: negative slate allocates full amount",rE.sum===25,"$"+rE.sum);
chk("E: negative card EV reported for the banner",rE.ev<0,(rE.ev*100).toFixed(1)+"%");

/* F — max 6 tickets from a 10-deep pool; $0 tickets dropped */
var F=[];for(var i=0;i<10;i++)F.push(T("T"+i,10-i,50,[["P"+i,"x","g"+i]]));
var rF=shAllocate(F,60,SH_CFG);
chk("F: capped at maxCoreTickets",rF.picks.length<=SH_CFG.maxCoreTickets,rF.picks.length+" tickets");
chk("F: exact sum at 6 tickets",rF.sum===60,"$"+rF.sum);

/* ---- FUN bucket fixtures (selection only, tier split, exact sums) ---- */
function TF(name,czDec,prob,posCorr,negCorr){var t=T(name,5,prob,[[name+"A","x","g_"+name],[name+"B","y","g_"+name]],czDec);
  t.pl.posCorr=!!posCorr;t.pl.negCorr=!!negCorr;return t;}
var FP=[TF("Big1",11,9),TF("Big2",12,8.5,true),TF("Mass1",31,3),TF("Moon1",201,0.5),TF("Short1",3,40)];

/* G — $10 (<$15): 1 ticket, Big tier, sim-correlated stack preferred over higher index */
var rG=shFunPick(FP,10,SH_CFG);
chk("G: one Big-tier ticket at $10",rG.picks.length===1&&rG.picks[0].tier===0&&rG.sum===10,rG.picks.map(function(p){return p.w.pl.name+":$"+p.stake;}).join());
chk("G: posCorr stack preferred in-tier",rG.picks[0].w.pl.name==="Big2",rG.picks[0].w.pl.name);

/* H — $30: Big+Massive 60/40 -> $18/$12 exact */
var rH=shFunPick(FP,30,SH_CFG);
chk("H: 60/40 two-tier split exact",rH.picks.length===2&&rH.picks[0].stake===18&&rH.picks[1].stake===12&&rH.sum===30,
  rH.picks.map(function(p){return SH_CFG.funTierNames[p.tier]+":$"+p.stake;}).join());

/* I — $100: three tiers 50/30/20 */
var rI=shFunPick(FP,100,SH_CFG);
chk("I: 50/30/20 three-tier split exact",rI.picks.length===3&&rI.picks[0].stake===50&&rI.picks[1].stake===30&&rI.picks[2].stake===20&&rI.sum===100,
  rI.picks.map(function(p){return SH_CFG.funTierNames[p.tier]+":$"+p.stake;}).join());
chk("I: short-odds ticket never selected",rI.picks.every(function(p){return p.w.pl.name!=="Short1";}));

/* J — core-card exclusions respected (no double-staking a ticket) */
var ex={};ex[shTicketId(FP[1].pl)]=1; /* Big2 already on the core card */
var rJ=shFunPick(FP,10,SH_CFG,ex);
chk("J: excluded core ticket skipped",rJ.picks.length===1&&rJ.picks[0].w.pl.name==="Big1",rJ.picks[0]&&rJ.picks[0].w.pl.name);

/* K — tier fall-through when a tier is empty */
var rK=shFunPick([TF("OnlyMoon",201,0.5)],10,SH_CFG);
chk("K: falls through to the only stocked tier",rK.picks.length===1&&rK.picks[0].w.pl.name==="OnlyMoon"&&rK.sum===10,rK.picks.map(function(p){return p.w.pl.name;}).join());

/* M — honest-longshot floor: sub-0.1% "moonshots" are donations, never selected */
var rM=shFunPick([TF("Dust",5001,0.02),TF("RealMoon",151,0.5)],100,SH_CFG);
chk("M: sub-floor ticket excluded",rM.picks.every(function(p){return p.w.pl.name!=="Dust";}),rM.picks.map(function(p){return p.w.pl.name;}).join());

/* L — FUN idempotence */
chk("L: FUN re-pick idempotent",JSON.stringify(shFunPick(FP,30,SH_CFG).picks.map(function(p){return [p.id,p.stake];}))===JSON.stringify(shFunPick(FP,30,SH_CFG).picks.map(function(p){return [p.id,p.stake];})));

/* ---- HARD RULE: no pick repeats across card tickets ---- */
/* O — two best tickets share an exact leg: the duplicate is skipped outright, the next
   independent ticket takes the slot */
var O=[T("O1",10,50,[["Judge","HR O 0.5","g1"],["Soto","Hits O 0.5","g1"]]),
       T("O2",9.9,50,[["Judge","HR O 0.5","g1"],["Alonso","TB O 1.5","g2"]]),  /* repeats Judge HR */
       T("O3",4,50,[["Ohtani","Hits O 0.5","g3"],["Betts","TB O 1.5","g3"]])];
var rO=shAllocate(O,20,SH_CFG);
var namesO=rO.picks.map(function(p){return p.w.pl.name;});
chk("O: duplicate-pick ticket excluded from the card",namesO.join(",")==="O1,O3",namesO.join(","));
var seenO={},dupO=false;
rO.picks.forEach(function(p){p.w.pl.legs.forEach(function(l){var k=l.label+"|"+l.prop;if(seenO[k])dupO=true;seenO[k]=1;});});
chk("O: card legs fully disjoint, sum still exact",!dupO&&rO.sum===20,"$"+rO.sum);

/* P — FUN must be leg-disjoint from the core card AND within itself */
var P=[TF("PBig1",11,9),TF("PBig2",12,8)];
P[0].pl.legs[0]={label:"Judge",prop:"HR O 0.5",game:"g1",cz:-110,odds:"-110",live:false}; /* clashes with core */
var coreLegs={"Judge|HR O 0.5":1};
var rP=shFunPick(P,10,SH_CFG,{},coreLegs);
chk("P: FUN skips tickets sharing a pick with the core card",rP.picks.length===1&&rP.picks[0].w.pl.name==="PBig2",rP.picks.map(function(p){return p.w.pl.name;}).join());
var P2=[TF("QBig1",11,9),TF("QBig2",12,8.5),TF("QMass",31,3)];
P2[2].pl.legs[0]=P2[0].pl.legs[0]; /* massive-tier ticket repeats a big-tier leg */
var rP2=shFunPick(P2,30,SH_CFG);
var seenP={},dupP=false;
rP2.picks.forEach(function(p){p.w.pl.legs.forEach(function(l){var k=l.label+"|"+l.prop;if(seenP[k])dupP=true;seenP[k]=1;});});
chk("P: FUN tickets mutually leg-disjoint",!dupP&&rP2.picks.length===2,rP2.picks.map(function(p){return p.w.pl.name;}).join());

/* ---- core-card discipline: no HR props, odds ceiling, Kelly weighting (build 42) ---- */
/* Q — a pure HR parlay NEVER takes daily money, no matter the claimed EV */
var qHR=T("QHR",300,3,[["Judge","HR (anytime) O 0.5","g1"],["Alonso","HR (anytime) O 0.5","g2"]],36);
qHR.pl.type="batter_home_runs";
var qSafe=T("QSafe",4,55,[["Soto","Hits O 0.5","g3"]],1.8);
var rQ=shAllocate([qHR,qSafe],100,SH_CFG);
chk("Q: HR parlay excluded from core (type)",rQ.picks.length===1&&rQ.picks[0].w.pl.name==="QSafe"&&rQ.sum===100,rQ.picks.map(function(p){return p.w.pl.name+":$"+p.stake;}).join());

/* R — a MIX ticket smuggling one HR leg (by lkey) is excluded too */
var rMix=T("RMix",50,8,[["Judge","HR (anytime) O 0.5","g1"],["Cole","Pitcher K's O 5.5","g1"]],12);
rMix.pl.legs[0].lkey="judge|batter_home_runs|0.5";
var rR=shAllocate([rMix,qSafe],50,SH_CFG);
chk("R: HR leg inside a MIX ticket excluded (lkey)",rR.picks.length===1&&rR.picks[0].w.pl.name==="QSafe",rR.picks.map(function(p){return p.w.pl.name;}).join());

/* S — odds ceiling: +352547-style lottery ticket can't take daily money even with huge EV */
var sMonster=T("SMonster",149,0.03,[["A","Hits O 0.5","g1"],["B","Hits O 0.5","g2"]],3526.47);
var rS=shAllocate([sMonster,qSafe],750,SH_CFG);
chk("S: over-ceiling ticket excluded ($750 goes to the playable one)",rS.picks.length===1&&rS.picks[0].w.pl.name==="QSafe"&&rS.sum===750,rS.picks.map(function(p){return p.w.pl.name+":$"+p.stake;}).join());

/* T2 — Kelly discipline: modest edge at short odds outranks big "EV" at long odds */
var tA=T("KShort",5,52,[["A","Hits O 0.5","g1"]],2);     /* kelly .05/1 = .050 */
var tB=T("KLong",30,9,[["B","TB O 1.5","g2"]],12);        /* kelly .30/11 = .027 */
var tC=T("KMid",4,50,[["C","Hits O 0.5","g3"]],2);        /* kelly .04/1 = .040 */
var rT=shAllocate([tA,tB,tC],30,SH_CFG);
var stT={};rT.picks.forEach(function(p){stT[p.w.pl.name]=p.stake;});
chk("T: Kelly weights feed the short-odds edge over the longshot EV",stT.KShort>stT.KLong&&stT.KMid>stT.KLong,JSON.stringify(stT));

/* ---- ledger lock + immutability guard ---- */
localStorage.setItem("pl_ledger","[]");
var eN={date:"2026-07-10",locked:true,lockedAt:1,daily:20,fun:10,core:[{id:"t1",stake:20,czOdds:"+200",czDec:3,legs:[]}],funT:[],games:{},grading:null,clv:{}};
shLedgerSave(eN);
/* attempt to rewrite a locked entry's stakes/tickets — must be refused */
var attack={date:"2026-07-10",locked:true,lockedAt:999,daily:9999,fun:0,core:[{id:"HACK",stake:9999}],funT:[],games:{},grading:{tickets:{t1:{result:"won",payout:60}},legs:{},done:true},clv:{a:1}};
var after=shLedgerSave(attack);
chk("N: locked stakes immutable",after.daily===20&&after.core[0].id==="t1"&&after.core[0].stake===20,"daily="+after.daily+" core0="+after.core[0].id);
chk("N: grading/CLV subfields DO merge onto a locked entry",after.grading&&after.grading.tickets.t1.result==="won"&&after.clv.a===1);
/* unlocked same-day entry may still be replaced wholesale */
localStorage.setItem("pl_ledger","[]");
shLedgerSave({date:"2026-07-11",locked:false,core:[{id:"a",stake:5}],funT:[]});
shLedgerSave({date:"2026-07-11",locked:false,core:[{id:"b",stake:7}],funT:[]});
chk("N: unlocked entry replaceable pre-lock",shLedgerFind("2026-07-11").core[0].id==="b");

print(fails.length?("UNIT40 FAILURES: "+fails.length):"UNIT40: ALL ALLOCATOR + FUN + LEDGER FIXTURES PASS");
