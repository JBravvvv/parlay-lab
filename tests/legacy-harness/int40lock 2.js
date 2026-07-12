/* Feature 5 integration: lock flow against the REAL fixture board */
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js');
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
shCollectSlate().then(function(slate){
  var d=shAnalyzeLocal(slate);
  chk("board carries gameInfo (pk + first pitch)",d.gameInfo&&Object.keys(d.gameInfo).length>=9&&
    Object.keys(d.gameInfo).every(function(k){return d.gameInfo[k].start;}),Object.keys(d.gameInfo||{}).length+" games");
  var pks=Object.keys(d.gameInfo).filter(function(k){return d.gameInfo[k].pk;}).length;
  chk("gamePks present for grading",pks===Object.keys(d.gameInfo).length,pks+" pks");
  /* simulate the app state: board saved, amounts set, then LOCK */
  SH.board={date:shToday(),at:Date.now(),engine:"local",v:10,data:d};
  SH.daily=37;SH.fun=30;
  localStorage.setItem("pl_ledger","[]");
  shLockCard();
  var e=shLedgerFind(shToday());
  chk("lock wrote a ledger entry",!!(e&&e.locked),e?("locked at daily=$"+e.daily+" fun=$"+e.fun):"none");
  chk("core+FUN stakes recorded exactly",e&&e.core.reduce(function(a,t){return a+t.stake;},0)===37&&
    e.funT.reduce(function(a,t){return a+t.stake;},0)===30,
    e?("core $"+e.core.reduce(function(a,t){return a+t.stake;},0)+" fun $"+e.funT.reduce(function(a,t){return a+t.stake;},0)):"");
  chk("every ticket snapshot has Caesars price + legs",e&&e.core.concat(e.funT).every(function(t){
    return t.czOdds&&t.czDec&&t.legs.length>=2&&t.legs.every(function(l){return l.cz!=null&&l.gkey;});}));
  chk("games map holds pk+start for every card game",e&&Object.keys(e.games).length>0&&
    Object.keys(e.games).every(function(k){return e.games[k].pk&&e.games[k].start;}),e?Object.keys(e.games).length+" games":"");
  chk("not late-locked (frozen-clock pregame)",e&&e.lateLock===false);
  /* second lock attempt must be a no-op */
  var before=JSON.stringify(e);
  SH.daily=999;shLockCard();
  chk("re-lock refused, entry unchanged",JSON.stringify(shLedgerFind(shToday()))===before);
  /* NV price confirm on a pregame ticket */
  var t0=e.core[0];
  shConfirmPrice(t0.id,"+500");
  var e2=shLedgerFind(shToday());
  chk("NV price confirm recorded pre-pitch",e2.core[0].confirmed===500,String(e2.core[0].confirmed));
  shConfirmPrice(t0.id,"");
  chk("confirm clearable pre-pitch",shLedgerFind(shToday()).core[0].confirmed===null);
  /* locked card view renders from the snapshot */
  var html=shLockedCardView(shLedgerFind(shToday()));
  chk("locked view renders stakes + FUN section",html.indexOf("LOCKED")>=0&&html.indexOf("FUN MONEY")>=0&&html.indexOf("pending")>=0);
  print(fails.length?("LOCK INTEGRATION FAILURES: "+fails.length):"LOCK INTEGRATION: ALL ASSERTIONS PASS");
}).catch(function(e){print("ERR "+e+"\n"+(e&&e.stack||""));});
