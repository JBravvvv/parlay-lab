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
  if(url.indexOf('/schedule')>=0)return 'schedule_tom.json';
  var m=url.match(/\/events\/([a-f0-9]+)\/odds/);if(m)return 'props_'+m[1]+'.json';
  if(url.indexOf('/events?')>=0)return 'events.json';
  if(url.indexOf('the-odds-api')>=0&&url.indexOf('markets=h2h')>=0)return 'odds.json';
  if(url.indexOf('stats=season')>=0&&url.indexOf('group=pitching')>=0)return 'pitseason.json';
  if(url.indexOf('byDateRange')>=0){var s=url.match(/startDate=([0-9-]+)/);if(!s)return null;
    return (url.indexOf('group=pitching')>=0?'pit_':'hit_')+s[1]+'.json';}
  if(url.indexOf('/people?personIds=')>=0)return 'BVP';
  return null;
}
obFetchJson=function(url){var f=route(url);
  if(f==='BVP')return Promise.resolve({ok:false,body:{}});
  var body=null;if(f){try{body=JSON.parse(readFile(DIR+'/'+f));}catch(e){body=null;}}
  return Promise.resolve({ok:body!=null,body:body==null?{}:body});};
var fails=[];
function chk(name,ok,detail){if(!ok)fails.push(name+(detail?" — "+detail:""));print((ok?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));}
shCollectSlate().then(function(slate){
  /* market-layer assertions on raw slate */
  var multiML=slate.game_odds.filter(function(o){return o.ml_books>=2&&o.home_fair!=null;}).length;
  chk("multi-book ML consensus present",multiML>0,multiML+" games with 2+ books de-vigged");
  var propRows=0,multiProp=0,badFair=0,noBook=0;
  Object.keys(slate.props).forEach(function(m){var mks=slate.props[m].markets;Object.keys(mks).forEach(function(k){mks[k].forEach(function(r){
    propRows++;if(r.books>=2)multiProp++;
    if(r.fair!=null&&!(r.fair>0&&r.fair<1))badFair++;
    if(r.o!=null&&!r.oBook)noBook++;});});});
  chk("prop rows collected",propRows>50,propRows+" rows");
  chk("multi-book prop consensus",multiProp>20,multiProp+" rows from 2+ books");
  chk("all fair probs in (0,1)",badFair===0,badFair+" bad");
  chk("line shopping: every priced side has a book",noBook===0,noBook+" missing");
  chk("league priors collected",slate.league&&slate.league.hitting_last30&&slate.league.hitting_last30.ab>0,
      slate.league&&slate.league.hitting_last30?("league AB(30d)="+slate.league.hitting_last30.ab):"none");
  var d=shAnalyzeLocal(slate);
  /* engine output assertions */
  var C=d.categories;
  var top=C.all||[];
  chk("TOP 50 present",top.length>0,top.length+" picks");
  var evSorted=true;for(var i=1;i<top.length;i++){if((top[i-1].ev==null?-99:top[i-1].ev)<(top[i].ev==null?-99:top[i].ev)){evSorted=false;break;}}
  chk("TOP 50 ranked by EV desc",evSorted);
  var missing=0;top.forEach(function(r){if(r.ev===undefined||r.kellyF===undefined||!Array.isArray(r.tags)||r.conviction===undefined)missing++;});
  chk("every pick carries ev/kellyF/tags/conviction",missing===0,missing+" missing");
  var consTag=top.filter(function(r){return r.tags.indexOf("consensus")>=0;}).length;
  chk("consensus tag flows through",consTag>0,consTag+"/50");
  /* locked params */
  var hitterU=0,badHR=0;
  ["batter_hits","batter_total_bases","batter_home_runs","batter_hits_runs_rbis"].forEach(function(k){
    (C[k]||[]).forEach(function(r){if(/ U /.test(r.sub))hitterU++;
      if(k==="batter_home_runs"&&!/ 0\.5$/.test(r.sub))badHR++;});});
  chk("hitter props overs-only",hitterU===0,hitterU+" unders");
  chk("HR props 0.5 line only",badHR===0,badHR+" bad lines");
  function legScan(list,drop){var bad=0,cnt={};
    (list||[]).forEach(function(pl){(pl.legs||[]).forEach(function(l){
      cnt[l.label]=(cnt[l.label]||0)+1;
      var t=l.txt||"";
      if(drop&&(/HR \(anytime\)/.test(t)||/·\s*ML vs/.test(t)||/·\s*RL /.test(t)))bad++;});});
    var mx=0;Object.keys(cnt).forEach(function(k){if(cnt[k]>mx)mx=cnt[k];});
    return {bad:bad,maxUse:mx};}
  var mix=legScan(d.parlaysMixed,true);
  chk("MIXED parlays exclude HR/ML/RL",mix.bad===0,mix.bad+" banned legs");
  chk("player cap ≤3 (mixed set)",mix.maxUse<=3,"max "+mix.maxUse);
  var pre=legScan(d.parlays,false);
  chk("player cap ≤3 (parlays set)",pre.maxUse<=3,"max "+pre.maxUse);
  chk("100+ total parlays on full slate",(d.parlays.length+d.parlaysMixed.length+d.parlaysLive.length)>=100,
      d.parlays.length+"+"+d.parlaysMixed.length+"+"+d.parlaysLive.length);
  var evP=(d.parlays[0]&&d.parlays[0].ev!=null);
  chk("parlays carry ticket EV + fair odds",evP,d.parlays[0]?("ev="+d.parlays[0].ev+" fair="+d.parlays[0].fair):"none");
  chk("passes list present",Array.isArray(d.passes),(d.passes||[]).length+" passes");
  /* graceful degradation: no lineups tonight → no sims, closed-form ML with market lean */
  chk("no-lineup fallback: ML rows still produced",(C.ml||[]).length>0,(C.ml||[]).length+" ML rows");
  var simTagged=(C.ml||[]).filter(function(r){return r.tags.indexOf("sim")>=0;}).length;
  chk("no sims without lineups (honest fallback)",simTagged===0,simTagged+" sim-tagged");
  print("");
  print("sample TOP-5 by EV:");
  top.slice(0,5).forEach(function(r){print("  #"+r.rank+" "+r.label+" · "+r.sub+" ("+r.odds+(r.book?" @ "+r.book:"")+") win "+r.prob+"% mkt "+r.implied+"% EV "+(r.ev>=0?"+":"")+r.ev+"% kellyF "+r.kellyF+" tags["+r.tags.join(",")+"]"+(r.edgeBadge?" EDGE":""));});
  print("");
  print(fails.length?("STAGE A FAILURES: "+fails.length):"STAGE A: ALL ASSERTIONS PASS");
}).catch(function(e){print("ERR "+e+"\n"+(e&&e.stack||""));});
