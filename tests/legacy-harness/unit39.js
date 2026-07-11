/* pull just the pure helpers out of the app bundle by regex-free eval of the whole file is
   heavy; instead re-declare the exact formulas under test by loading the bundle in a shim. */
var store={};this.localStorage={getItem:function(k){return (k in store)?store[k]:null;},setItem:function(k,v){store[k]=String(v);},removeItem:function(k){delete store[k];}};
function elStub(){var e={style:{},value:"",innerHTML:"",textContent:"",checked:false,dataset:{}};e.classList={toggle:function(){},add:function(){},remove:function(){},contains:function(){return false;}};["addEventListener","removeEventListener","appendChild","append","setAttribute","removeAttribute","focus","blur","remove","insertAdjacentHTML","scrollIntoView"].forEach(function(m){e[m]=function(){};});e.getAttribute=function(){return null;};e.querySelector=function(){return null;};e.querySelectorAll=function(){return [];};e.closest=function(){return null;};e.getBoundingClientRect=function(){return {};};e.cloneNode=function(){return elStub();};return e;}
this.document={getElementById:function(){return elStub();},createElement:function(){return elStub();},querySelector:function(){return elStub();},querySelectorAll:function(){return [];},addEventListener:function(){},body:elStub(),documentElement:elStub(),head:elStub(),cookie:""};
this.window=this;this.self=this;this.location={reload:function(){},href:"x"};this.history={replaceState:function(){}};
this.navigator={serviceWorker:{register:function(){return Promise.resolve({update:function(){},addEventListener:function(){}});},addEventListener:function(){}},onLine:true};
this.matchMedia=function(){return {matches:false,addEventListener:function(){},addListener:function(){}};};
this.addEventListener=function(){};this.scrollTo=function(){};this.setTimeout=function(f){return 0;};this.setInterval=function(){return 0;};this.clearTimeout=function(){};this.clearInterval=function(){};this.requestAnimationFrame=function(){return 0;};
this.console={log:function(){},warn:function(){},error:function(){},info:function(){}};this.fetch=function(){var t={then:function(){return t;},catch:function(){return t;}};return t;};this.XMLHttpRequest=function(){return {open:function(){},send:function(){},setRequestHeader:function(){},addEventListener:function(){}};};
load('/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/pl_full.js');
var fails=[];
function eq(name,got,want,tol){var ok=(got==null&&want==null)||(got!=null&&want!=null&&Math.abs(got-want)<=(tol||1e-9));if(!ok)fails.push(name+": got "+got+" want "+want);print((ok?"PASS":"FAIL")+" "+name+" = "+got);}
/* de-vig: -110/-110 → 0.5 exactly. imp(-110)=110/210=0.523809... */
eq("shImp(-110)",shImp(-110),110/210);
eq("shImp(+150)",shImp(150),100/250);
eq("devig -110/-110",shDevig2(shImp(-110),shImp(-110)),0.5);
/* hand-computed: -150 over / +130 under. iO=150/250=.6, iU=100/230=.434783; fair=.6/1.034783=.579831 */
eq("devig -150/+130",shDevig2(shImp(-150),shImp(130)),0.6/(0.6+100/230),1e-6);
eq("median odd",shMedian([0.5,0.7,0.6]),0.6);
eq("median even",shMedian([0.4,0.6,0.5,0.7]),0.55);
eq("median empty",shMedian([]),null);
/* Kelly at p=0.55, +100 (dec 2): f*=(1*.55-.45)/1=0.10 */
eq("kelly .55@+100",shKelly(0.55,2),0.10,1e-9);
eq("kelly no-edge",shKelly(0.40,2),0);
/* EV: p=.55 dec 2 → .55*1-.45=.10 */
eq("EV .55@2.0",shEV(0.55,2),0.10,1e-9);
/* amToDec cross-check */
eq("amToDec(-110)",amToDec(-110),1+100/110,1e-9);
/* shrinkage: 5-for-8 (.625) hot streak, league .244, k=60 → (8*.625+60*.244)/68 = .2888 */
eq("shrink 5/8→league",shShrink(0.625,8,60,0.244),(8*0.625+60*0.244)/68,1e-9);
eq("shrink big-n barely moves",shShrink(0.30,600,60,0.244),(600*0.30+60*0.244)/660,1e-9);
eq("shrink null prior passthrough",shShrink(0.30,10,60,null),0.30);
/* band: clamps */
eq("band small n",shBand(10),0.10,1e-9);
eq("band huge n",shBand(100000),0.02,1e-9);
print(fails.length?("UNIT FAILURES: "+fails.length):"ALL UNIT FIXTURES PASS");
