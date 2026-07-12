var DIR='/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/fix39';
var store={};this.localStorage={getItem:function(k){return (k in store)?store[k]:null;},setItem:function(k,v){store[k]=String(v);},removeItem:function(k){delete store[k];}};
function elStub(){var e={style:{},value:"",innerHTML:"",textContent:"",checked:false,dataset:{}};e.classList={toggle:function(){},add:function(){},remove:function(){},contains:function(){return false;}};["addEventListener","removeEventListener","appendChild","append","setAttribute","removeAttribute","focus","blur","remove","insertAdjacentHTML","scrollIntoView"].forEach(function(m){e[m]=function(){};});e.getAttribute=function(){return null;};e.querySelector=function(){return null;};e.querySelectorAll=function(){return [];};e.closest=function(){return null;};e.getBoundingClientRect=function(){return {};};e.cloneNode=function(){return elStub();};return e;}
this.document={getElementById:function(){return elStub();},createElement:function(){return elStub();},querySelector:function(){return elStub();},querySelectorAll:function(){return [];},addEventListener:function(){},body:elStub(),documentElement:elStub(),head:elStub(),cookie:""};
this.window=this;this.self=this;this.location={reload:function(){},href:"x"};this.history={replaceState:function(){}};
this.navigator={serviceWorker:{register:function(){return Promise.resolve({update:function(){},addEventListener:function(){}});},addEventListener:function(){}},onLine:true};
this.matchMedia=function(){return {matches:false,addEventListener:function(){},addListener:function(){}};};
this.addEventListener=function(){};this.scrollTo=function(){};this.setTimeout=function(f){return 0;};this.setInterval=function(){return 0;};this.clearTimeout=function(){};this.clearInterval=function(){};this.requestAnimationFrame=function(){return 0;};
this.console={log:function(){},warn:function(){},error:function(){},info:function(){}};this.fetch=function(){var t={then:function(){return t;},catch:function(){return t;}};return t;};this.XMLHttpRequest=function(){return {open:function(){},send:function(){},setRequestHeader:function(){},addEventListener:function(){}};};
load(DIR+'/../pl_full.js');
/* pretend it is tomorrow morning: the exact state the app will wake up to */
var TOM=(function(){var d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");})();
shToday=function(){return TOM;};
obSameDay=function(iso){return String(iso).slice(0,10)===TOM;};
function route(url){
  if(url.indexOf('/schedule')>=0)return 'schedule_tom_lu.json';
  var m=url.match(/\/events\/([a-f0-9]+)\/odds/);if(m)return 'props_'+m[1]+'.json';
  if(url.indexOf('/events?')>=0)return 'events.json';
  if(url.indexOf('the-odds-api')>=0&&url.indexOf('markets=h2h')>=0)return 'odds.json';
  if(url.indexOf('stats=season')>=0&&url.indexOf('group=pitching')>=0)return 'pitseason.json';
  if(url.indexOf('byDateRange')>=0){var s=url.match(/startDate=([0-9-]+)/);if(!s)return null;
    return (url.indexOf('group=pitching')>=0?'pit_':'hit_')+s[1]+'.json';}
  if(url.indexOf('/people?personIds=')>=0){var b=url.match(/opposingPlayerId=(\d+)/);return b?('bvp_'+b[1]+'.json'):null;}
  return null;
}
obFetchJson=function(url){var f=route(url);
  
  var body=null;if(f){try{body=JSON.parse(readFile(DIR+'/'+f));}catch(e){body=null;}}
  return Promise.resolve({ok:body!=null,body:body==null?{}:body});};
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name);print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
shCollectSlate().then(function(slate){
  chk("BvP entries populated from real matchup pulls",Object.keys(slate.bvp).length>10,Object.keys(slate.bvp).length+" batters with career vs-SP data");
  var t0=Date.now();
  var d=shAnalyzeLocal(slate);
  var t1=Date.now();
  var d2=shAnalyzeLocal(slate);
  var t2=Date.now();
  print("analyze wall time: "+(t1-t0)+"ms (incl. sims) / second run "+(t2-t1)+"ms");
  var C=d.categories;
  var mlSim=(C.ml||[]).filter(function(r){return r.tags.indexOf("sim")>=0;});
  chk("ML rows sim-powered",mlSim.length>=8,mlSim.length+"/"+(C.ml||[]).length+" sim-tagged");
  var rlSim=(C.rl||[]).filter(function(r){return r.tags.indexOf("sim")>=0;}).length;
  chk("RL rows sim-powered",rlSim>=8,rlSim+" sim-tagged");
  var simBits=mlSim.filter(function(r){return /simulated games/.test(r["case"]);}).length;
  chk("sim reasoning on ML cards",simBits===mlSim.length,simBits+" cards cite sims");
  var hrrSim=(C.batter_hits_runs_rbis||[]).filter(function(r){return r.tags.indexOf("sim")>=0;}).length;
  chk("H+R+RBI props from joint sims",hrrSim>0,hrrSim+" sim-tagged of "+(C.batter_hits_runs_rbis||[]).length);
  var bvpTag=0;["batter_hits","batter_total_bases","batter_home_runs","batter_hits_runs_rbis"].forEach(function(k){
    (C[k]||[]).forEach(function(r){if(r.tags.indexOf("BvP")>=0)bvpTag++;});});
  chk("BvP influences some hitter picks (15+ PA only)",bvpTag>0,bvpTag+" picks BvP-weighted");
  var bvpCase=0;["batter_hits","batter_total_bases"].forEach(function(k){(C[k]||[]).forEach(function(r){if(/context only — under 15 PA/.test(r["case"]))bvpCase++;});});
  chk("small-sample BvP shown as context only",bvpCase>0,bvpCase+" cards");
  /* determinism: seeded sims must reproduce identical EV list across runs */
  var same=JSON.stringify(d.categories.all.map(function(r){return [r.label,r.ev,r.prob];}))===JSON.stringify(d2.categories.all.map(function(r){return [r.label,r.ev,r.prob];}));
  chk("deterministic: two runs → identical board",same);
  /* correlation notes present on some same-game tickets */
  var corrNotes=0;[].concat(d.parlays,d.parlaysMixed).forEach(function(pl){if(/correlat/i.test(pl.note))corrNotes++;});
  chk("correlation notes on tickets",corrNotes>0,corrNotes+" tickets flagged");
  var negNotes=0;[].concat(d.parlays,d.parlaysMixed).forEach(function(pl){if(/AGAINST each other/.test(pl.note))negNotes++;});
  print("  (negative-correlation flags: "+negNotes+")");
  /* locked params under sim mode too */
  var hitterU=0;["batter_hits","batter_total_bases","batter_home_runs","batter_hits_runs_rbis"].forEach(function(k){(C[k]||[]).forEach(function(r){if(/ U /.test(r.sub))hitterU++;});});
  chk("locked: hitter overs-only under sim mode",hitterU===0,hitterU+" unders");
  chk("locked: 100+ parlays",(d.parlays.length+d.parlaysMixed.length+d.parlaysLive.length)>=100,d.parlays.length+"+"+d.parlaysMixed.length+"+"+d.parlaysLive.length);
  print("");
  print("sample sim-powered ML card:");
  if(mlSim[0])print("  "+mlSim[0].label+" "+mlSim[0].sub+" ("+mlSim[0].odds+(mlSim[0].book?" @ "+mlSim[0].book:"")+") win "+mlSim[0].prob+"% — "+mlSim[0]["case"].slice(0,180));
  var bvpPick=null;["batter_hits","batter_total_bases"].forEach(function(k){(C[k]||[]).forEach(function(r){if(!bvpPick&&r.tags.indexOf("BvP")>=0)bvpPick=r;});});
  if(bvpPick)print("sample BvP-weighted pick:\n  "+bvpPick.label+" "+bvpPick.sub+" — "+bvpPick["case"].slice(0,200));
  print("");
  print(fails.length?("STAGE B FAILURES: "+fails.length):"STAGE B: ALL ASSERTIONS PASS");
}).catch(function(e){print("ERR "+e+"\n"+(e&&e.stack||""));});
