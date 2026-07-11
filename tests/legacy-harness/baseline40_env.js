/* Baseline/no-regression harness for build 40.
   Freezes the clock at 2026-07-09 23:30 ET so the fix39 fixtures route exactly as they
   did when fetched (7/15/30-day windows -> 07-03/06-25/06-10; "tomorrow" = 2026-07-10).
   Usage:
     jsc baseline40.js -- dump      -> prints BASELINE_JSON line (ticket+pick digest)
     jsc baseline40.js -- diff <f>  -> compares digest against saved baseline file
*/
var DIR='/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/fix39';
/* ---- frozen clock ---- */
var _D=Date;var FIXED=_D.parse('2026-07-10T03:30:00Z'); /* = 2026-07-09 23:30 ET */
Date=function(){
  if(arguments.length===0)return new _D(FIXED);
  var a=arguments;
  if(a.length===1)return new _D(a[0]);
  return new _D(a[0],a[1],a[2]||1,a[3]||0,a[4]||0,a[5]||0,a[6]||0);
};
Date.now=function(){return FIXED;};
Date.parse=_D.parse;Date.UTC=_D.UTC;Date.prototype=_D.prototype;
/* ---- DOM/browser shims ---- */
var store={};this.localStorage={getItem:function(k){return (k in store)?store[k]:null;},setItem:function(k,v){store[k]=String(v);},removeItem:function(k){delete store[k];}};
function elStub(){var e={style:{},value:"",innerHTML:"",textContent:"",checked:false,dataset:{}};e.classList={toggle:function(){},add:function(){},remove:function(){},contains:function(){return false;}};["addEventListener","removeEventListener","appendChild","append","setAttribute","removeAttribute","focus","blur","remove","insertAdjacentHTML","scrollIntoView"].forEach(function(m){e[m]=function(){};});e.getAttribute=function(){return null;};e.querySelector=function(){return null;};e.querySelectorAll=function(){return [];};e.closest=function(){return null;};e.getBoundingClientRect=function(){return {};};e.cloneNode=function(){return elStub();};return e;}
this.document={getElementById:function(){return elStub();},createElement:function(){return elStub();},querySelector:function(){return elStub();},querySelectorAll:function(){return [];},addEventListener:function(){},body:elStub(),documentElement:elStub(),head:elStub(),cookie:""};
this.window=this;this.self=this;this.location={reload:function(){},href:"x"};this.history={replaceState:function(){}};
this.navigator={serviceWorker:{register:function(){return Promise.resolve({update:function(){},addEventListener:function(){}});},addEventListener:function(){}},onLine:true};
this.matchMedia=function(){return {matches:false,addEventListener:function(){},addListener:function(){}};};
this.addEventListener=function(){};this.scrollTo=function(){};this.setTimeout=function(f){return 0;};this.setInterval=function(){return 0;};this.clearTimeout=function(){};this.clearInterval=function(){};this.requestAnimationFrame=function(){return 0;};
this.console={log:function(){},warn:function(){},error:function(){},info:function(){}};this.fetch=function(){var t={then:function(){return t;},catch:function(){return t;}};return t;};this.XMLHttpRequest=function(){return {open:function(){},send:function(){},setRequestHeader:function(){},addEventListener:function(){}};};
load(DIR+'/../pl_full.js');
/* app runs "tomorrow morning" relative to the frozen clock */
var TOM='2026-07-10';
shToday=function(){return TOM;};
obSameDay=function(iso){return String(iso).slice(0,10)===TOM;};
function route(url){
  if(url.indexOf('/schedule')>=0){var dm=url.match(/date=([0-9-]+)/);
    if(dm&&dm[1]==='2026-07-09')return '../fix40/sched_0709.json';
    return 'schedule_tom_lu.json';}
  if(url.indexOf('/boxscore')>=0){var bm=url.match(/game\/(\d+)\/boxscore/);
    return bm?('../fix40/box_'+bm[1]+'.json'):null;}
  var m=url.match(/\/events\/([a-f0-9]+)\/odds/);
  if(m){
    /* one event carries a synthetic Caesars alternate-ladder (parser test double) */
    if(m[1]==='250b0373676b10f51ed1c59c93714245')return '../fix40/props_alt_'+m[1]+'.json';
    return 'props_'+m[1]+'.json';
  }
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
