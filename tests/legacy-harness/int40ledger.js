/* Feature 3 integration: lock -> auto-grade -> stats/CLV/projection -> ledger view */
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js');
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
shCollectSlate().then(function(slate){
  var d=shAnalyzeLocal(slate);
  SH.board={date:shToday(),at:Date.now(),engine:"local",v:10,data:d};
  SH.daily=37;SH.fun=30;SH.bankroll=750;
  localStorage.setItem("pl_ledger","[]");
  /* yesterday's synthetic card over the REAL final game (all legs hand-graded above) */
  shLedgerSave({date:"2026-07-09",locked:true,lockedAt:1,daily:20,fun:10,bankroll:750,cardEv:0.05,lateLock:false,
    core:[
      {id:"y1",bucket:"core",name:"Hits parlay · 2 legs",type:"batter_hits",tier:"SAFER",stake:12,czOdds:"+120",czDec:2.2,prob:48,czEv:5,confirmed:null,
       legs:[{label:"Ryan McMahon (ATH)",prop:"Hits O 0.5",cz:-250,gkey:"g1",lkey:"ryanmcmahon|batter_hits|0.5",game:"NYY @ TB"},
             {label:"Paul Blackburn (ATH)",prop:"Pitcher K's O 2.5",cz:-150,gkey:"g1",lkey:"paulblackburn|pitcher_strikeouts|2.5",game:"NYY @ TB"}]},
      {id:"y2",bucket:"core",name:"ML parlay",type:"ml",tier:"SAFER",stake:8,czOdds:"+100",czDec:2.0,prob:50,czEv:2,confirmed:null,
       legs:[{label:"New York Yankees",prop:"ML vs Tampa Bay Rays",cz:-120,gkey:"g1",lkey:"ml_away",game:"NYY @ TB"},
             {label:"Ryan McMahon (ATH)",prop:"HR (anytime) O 0.5",cz:300,gkey:"g1",lkey:"ryanmcmahon|batter_home_runs|0.5",game:"NYY @ TB"}]}],
    funT:[
      {id:"y3",bucket:"fun",name:"HR stack",type:"batter_home_runs",tier:"BIG",stake:10,czOdds:"+900",czDec:10,prob:9,czEv:-10,confirmed:null,
       legs:[{label:"Richie Palacios (TB)",prop:"Hits O 0.5",cz:-180,gkey:"g1",lkey:"richiepalacios|batter_hits|0.5",game:"NYY @ TB"},
             {label:"Paul Blackburn (ATH)",prop:"Pitcher K's U 4.5",cz:-140,gkey:"g1",lkey:"paulblackburn|pitcher_strikeouts|4.5",game:"NYY @ TB"}]}],
    games:{g1:{pk:822954,start:"2026-07-09T23:05:00Z",away:"New York Yankees",home:"Tampa Bay Rays"}},
    grading:null,gradedAt:null,clv:{"Ryan McMahon (ATH)|Hits O 0.5":{am:-275,at:2}}});
  /* today's real locked card (games all pregame under the frozen clock) */
  shLockCard();
  chk("two locked days in the ledger",shLedger().length===2);
  return shGrade().then(function(n){
    chk("grade pass touched entries",n>=1,n+" changed");
    var y=shLedgerFind("2026-07-09");
    chk("yesterday fully graded (done)",y.grading&&y.grading.done===true);
    var T=y.grading.tickets;
    /* y1: McMahon hit + Blackburn 3K over 2.5 -> won, $12 x 2.2 = $26.40 */
    chk("y1 parlay won $26.4",T.y1.result==="won"&&Math.abs(T.y1.payout-26.4)<1e-9,T.y1.result+" $"+T.y1.payout);
    /* y2: Yankees ML won but McMahon HR lost -> lost */
    chk("y2 lost on the HR leg",T.y2.result==="lost");
    /* y3 FUN: Palacios VOID (sub) divides out; Blackburn U 4.5 won -> won at 10/ (1.556) */
    var expDec=10/amToDec(-180);
    chk("y3 FUN void-repriced won",T.y3.result==="won"&&Math.abs(T.y3.dec-Math.round(expDec*10000)/10000)<1e-3,
      T.y3.result+" dec "+T.y3.dec+" (expect ~"+expDec.toFixed(3)+") $"+T.y3.payout);
    var t=shLedgerFind(shToday());
    chk("today's card pending (games not started)",t.grading&&t.grading.done===false&&
      Object.keys(t.grading.tickets).every(function(k){return t.grading.tickets[k].result==="pending";}));
    /* re-run: idempotent */
    var snap=JSON.stringify(shLedgerFind("2026-07-09").grading);
    return shGrade().then(function(){
      chk("re-grade idempotent",JSON.stringify(shLedgerFind("2026-07-09").grading)===snap);
      /* stats: yesterday settled = staked 30 (12+8+10), returned 26.40 + 0 + y3 payout */
      var y3pay=shLedgerFind("2026-07-09").grading.tickets.y3.payout;
      var st=shLedgerStats("all");
      var yday=st.days.filter(function(x){return x.date==="2026-07-09";})[0];
      chk("day ROI math (staked $30)",yday.staked===30&&Math.abs(yday.ret-(26.4+y3pay))<1e-6,
        "staked $"+yday.staked+" returned $"+yday.ret+" P/L "+yday.pl);
      var fun=shLedgerStats("fun");
      chk("FUN tracked separately",fun.staked===10&&fun.w===1,"fun staked $"+fun.staked+" W"+fun.w);
      chk("core scope excludes FUN",shLedgerStats("core").staked===20);
      var clv=shClvStats();
      chk("CLV sighted on the pre-lock sighting",clv.sighted===1&&clv.avg>0,"avg "+(clv.avg*100).toFixed(2)+"% cover "+clv.sighted+"/"+clv.tot);
      /* CLV piggyback from a fresh slate pull (today's card, pregame) */
      shClvSight(slate);
      var clv2=shClvStats();
      chk("slate pull sights today's pregame legs for free",clv2.sighted>clv.sighted,clv2.sighted+"/"+clv2.tot+" legs");
      /* projection: deterministic, ordered percentiles */
      var p1=shProjection(),p2=shProjection();
      chk("projection exists with ordered percentiles",p1&&p1.endLo<=p1.endMid&&p1.endMid<=p1.endHi,
        p1?("$"+p1.endLo+" / $"+p1.endMid+" / $"+p1.endHi+" over "+p1.days+" days"):"null");
      chk("projection deterministic (seeded)",JSON.stringify(p1)===JSON.stringify(p2));
      /* the ledger view renders every section */
      var html=shLedgerView();
      chk("ledger view renders",html.indexOf("SEASON LEDGER")>=0&&html.indexOf("net P/L")>=0&&
        html.indexOf("EQUITY")>=0&&html.indexOf("REST-OF-SEASON")>=0&&html.indexOf("HIT RATE")>=0&&html.indexOf("EXPORT")>=0);
      /* immutability after grading: stakes still frozen */
      shLedgerSave({date:"2026-07-09",locked:true,daily:9999,core:[],funT:[],games:{},grading:shLedgerFind("2026-07-09").grading});
      chk("stakes still immutable post-grade",shLedgerFind("2026-07-09").daily===20);
      print(fails.length?("LEDGER INTEGRATION FAILURES: "+fails.length):"LEDGER INTEGRATION: ALL ASSERTIONS PASS");
    });
  });
}).catch(function(e){print("ERR "+e+"\n"+(e&&e.stack||""));});
