/* build 40 grading fixtures — REAL boxscore 822954 (NYY 12 @ TB 4, Final, 2026-07-09).
   Hand-derived from the box: McMahon 2 H (2 2B) = 4 TB, 1 R + 2 RBI = 5 H+R+RBI, order 800 starter;
   Palacios order 101 substitute; Blackburn (away SP) 3 K, 6 outs, started. */
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js');
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
var BOX=JSON.parse(readFile(DIR+'/../fix40/box_822954.json'));
var boxes={822954:BOX};
var FINAL={822954:{state:"Final",away:12,home:4}};
var entry={date:"2026-07-09",locked:true,games:{g1:{pk:822954,start:"2026-07-10T00:05:00Z",away:"New York Yankees",home:"Tampa Bay Rays"}},clv:{}};
function L(lkey,prop){return {label:"X",prop:prop,lkey:lkey,gkey:"g1",cz:-110};}
function G(lkey,prop,st){return shGradeLeg(L(lkey,prop),entry,boxes,st||FINAL);}

/* batter props */
chk("McMahon Hits O 0.5 won (2 H)",G("ryanmcmahon|batter_hits|0.5","Hits O 0.5").result==="won",G("ryanmcmahon|batter_hits|0.5","Hits O 0.5").detail);
chk("McMahon Hits O 2.5 lost",G("ryanmcmahon|batter_hits|2.5","Hits O 2.5").result==="lost");
chk("McMahon TB O 3.5 won (4 TB: 2 doubles)",G("ryanmcmahon|batter_total_bases|3.5","Total Bases O 3.5").result==="won",G("ryanmcmahon|batter_total_bases|3.5","Total Bases O 3.5").detail);
chk("McMahon H+R+RBI O 4.5 won (2+1+2=5)",G("ryanmcmahon|batter_hits_runs_rbis|4.5","H+R+RBI O 4.5").result==="won",G("ryanmcmahon|batter_hits_runs_rbis|4.5","H+R+RBI O 4.5").detail);
chk("McMahon HR O 0.5 lost (0 HR)",G("ryanmcmahon|batter_home_runs|0.5","HR (anytime) O 0.5").result==="lost");
/* Caesars void rules */
var pal=G("richiepalacios|batter_hits|0.5","Hits O 0.5");
chk("Palacios (substitute) VOID — not in starting lineup",pal.result==="void",pal.detail);
var ghost=G("nonexistentplayer|batter_hits|0.5","Hits O 0.5");
chk("player not in box VOID",ghost.result==="void",ghost.detail);
/* pitcher props */
chk("Blackburn K's O 2.5 won (3 K)",G("paulblackburn|pitcher_strikeouts|2.5","Pitcher K's O 2.5").result==="won");
chk("Blackburn K's U 4.5 won (3 < 4.5)",G("paulblackburn|pitcher_strikeouts|4.5","Pitcher K's U 4.5").result==="won");
chk("Blackburn Outs O 16.5 lost (6 outs)",G("paulblackburn|pitcher_outs|16.5","Pitcher Outs O 16.5").result==="lost");
chk("integer line push (Outs O 6, exactly 6)",G("paulblackburn|pitcher_outs|6","Pitcher Outs O 6").result==="push");
/* ML / RL from the final score */
chk("ml_away won 12-4",G("ml_away","ML vs Tampa Bay Rays").result==="won",G("ml_away","ML").detail);
chk("ml_home lost",G("ml_home","ML vs New York Yankees").result==="lost");
chk("rl_away -1.5 covered (won by 8)",G("rl_away","RL -1.5 vs Tampa Bay Rays").result==="won");
chk("rl_home +1.5 lost (lost by 8)",G("rl_home","RL +1.5 vs New York Yankees").result==="lost");
/* game-state gates */
chk("postponed game voids the leg",G("ryanmcmahon|batter_hits|0.5","Hits O 0.5",{822954:{state:"Postponed",away:null,home:null}}).result==="void");
chk("in-progress game stays pending",G("ryanmcmahon|batter_hits|0.5","Hits O 0.5",{822954:{state:"In Progress",away:3,home:1}}).result==="pending");

/* ---- ticket math: void reprice by dividing out the leg decimal ---- */
function TL(res,cz){return {label:"L"+cz,prop:"Hits O 0.5",cz:cz,lkey:"x|batter_hits|0.5",gkey:"g1"};}
function fakeRes(list){var m={};list.forEach(function(x){m[x[0]]=({result:x[1]});});return m;}
var t600={id:"t",stake:10,czDec:7.0,confirmed:null,legs:[TL(0,150),TL(0,120),TL(0,133)]};
/* legs keyed label|prop: L150|Hits O 0.5 etc. */
var res1=fakeRes([["L150|Hits O 0.5","void"],["L120|Hits O 0.5","won"],["L133|Hits O 0.5","won"]]);
var g1=shGradeTicket(t600,res1);
chk("void reprice: +600 ticket / void +150 leg -> 2.8 dec, $28 on $10",g1.result==="won"&&Math.abs(g1.dec-2.8)<1e-9&&Math.abs(g1.payout-28)<1e-9,"dec "+g1.dec+" payout $"+g1.payout);
var g2=shGradeTicket(t600,fakeRes([["L150|Hits O 0.5","won"],["L120|Hits O 0.5","lost"],["L133|Hits O 0.5","won"]]));
chk("any lost leg -> ticket lost",g2.result==="lost"&&g2.payout===0);
var g3=shGradeTicket(t600,fakeRes([["L150|Hits O 0.5","void"],["L120|Hits O 0.5","void"],["L133|Hits O 0.5","void"]]));
chk("all legs void -> push, stake returned",g3.result==="push"&&g3.payout===10);
var g4=shGradeTicket(t600,fakeRes([["L150|Hits O 0.5","won"],["L120|Hits O 0.5","pending"],["L133|Hits O 0.5","won"]]));
chk("pending leg -> ticket pending",g4.result==="pending");
var g5=shGradeTicket(t600,fakeRes([["L150|Hits O 0.5","won"],["L120|Hits O 0.5","ungradable"],["L133|Hits O 0.5","won"]]));
chk("ungradable leg -> ticket ungradable (gap shown, never fabricated)",g5.result==="ungradable");
var tConf={id:"t2",stake:10,czDec:7.0,confirmed:800,legs:[TL(0,150),TL(0,120)]};
var g6=shGradeTicket(tConf,fakeRes([["L150|Hits O 0.5","won"],["L120|Hits O 0.5","won"]]));
chk("confirmed NV price pays instead of feed price (+800 -> $90 on $10)",g6.result==="won"&&Math.abs(g6.payout-90)<1e-9,"payout $"+g6.payout);

/* ---- CLV math: lock -110 vs last-seen -125 => +3.2 points of implied prob ---- */
localStorage.setItem("pl_ledger","[]");
shLedgerSave({date:"2026-07-09",locked:true,lockedAt:1,daily:10,fun:0,bankroll:750,cardEv:0.05,
  core:[{id:"c1",bucket:"core",name:"t",stake:10,czOdds:"-110",czDec:1.909,prob:55,confirmed:null,
    legs:[{label:"A",prop:"Hits O 0.5",cz:-110,gkey:"g1",lkey:"a|batter_hits|0.5"}]}],
  funT:[],games:{g1:{pk:822954,start:"2026-07-10T00:05:00Z",away:"NYY",home:"TB"}},grading:null,
  clv:{"A|Hits O 0.5":{am:-125,at:2}}});
var cs=shClvStats();
var want=(125/225)-(110/210);
chk("CLV avg = imp(close)-imp(lock) = +3.17%",cs.sighted===1&&Math.abs(cs.avg-want)<1e-9,(cs.avg*100).toFixed(2)+"% vs "+(want*100).toFixed(2)+"%");
print(fails.length?("GRADING FIXTURE FAILURES: "+fails.length):"UNIT40-GRADE: ALL GRADING + CLV FIXTURES PASS");
