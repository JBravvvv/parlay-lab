load("/private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/127210b8-f83e-43d1-8ca2-1ea243b1055f/scratchpad/baseline40_env.js");
/* ---- digest: the generation-layer output that must not change ---- */
function digest(d){
  function cats(C){var o={};Object.keys(C).sort().forEach(function(k){
    o[k]=(C[k]||[]).map(function(r){return [r.label,r.sub,String(r.odds),r.prob,r.ev];});});return o;}
  function tix(set){return (set||[]).map(function(p){return {n:p.name,o:p.odds,p:p.prob,
    legs:p.legs.map(function(l){return l.label+"|"+l.prop+"|"+l.odds;})};});}
  return {categories:cats(d.categories),categoriesLive:cats(d.categoriesLive),
    parlays:tix(d.parlays),parlaysMixed:tix(d.parlaysMixed),parlaysLive:tix(d.parlaysLive)};
}
var MODE=(typeof arguments!=='undefined'&&arguments[0])||'dump';
var CMP=(typeof arguments!=='undefined'&&arguments[1])||null;
shCollectSlate().then(function(slate){
  var d=shAnalyzeLocal(slate);
  var dg=JSON.stringify(digest(d));
  if(MODE==='dump'){print('BASELINE_JSON\t'+dg);return;}
  var base=readFile(CMP);
  var want=base.slice(base.indexOf('\t')+1).trim();
  if(want===dg){print('NO-REGRESSION: generation output IDENTICAL to build-39 baseline');}
  else{
    print('REGRESSION: output differs from baseline');
    var A=JSON.parse(want),B=JSON.parse(dg);
    ['parlays','parlaysMixed','parlaysLive'].forEach(function(k){
      if(A[k].length!==B[k].length){print('  '+k+': count '+A[k].length+' -> '+B[k].length);return;}
      for(var i=0;i<A[k].length;i++){if(JSON.stringify(A[k][i])!==JSON.stringify(B[k][i])){print('  '+k+'['+i+'] first diff: '+JSON.stringify(A[k][i]).slice(0,140)+'  VS  '+JSON.stringify(B[k][i]).slice(0,140));break;}}
    });
    Object.keys(A.categories).forEach(function(k){
      if(JSON.stringify(A.categories[k])!==JSON.stringify(B.categories[k]))print('  categories.'+k+' differs');
    });
  }
}).catch(function(e){print('ERR '+e+'\n'+(e&&e.stack||''));});
