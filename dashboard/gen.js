// 기본 데이터 만들기: node gen.js 200
const G=require('./load.js');const S=G.Dash.sim;const N=+process.argv[2]||200;
const knobs=S.docKnobs();const dt=S.makeDT(G.DT,knobs);const runs=[];const t0=Date.now();
for(const lv of S.LEVELS)for(let s=1;s<=N;s++)runs.push(S.runOne(dt,s,lv));
const ms=Date.now()-t0;
const base={knobs,n:N,runs,made:'2026-11-22',msPerRun:Math.round(ms/runs.length)};
require('fs').writeFileSync(require('path').join(__dirname,'base.js'),'// 기본 데이터: DT 문서 값으로 실력별 '+N+'판(시드 1~'+N+'). 만든 스크립트: gen.js\nvar G=globalThis.G=globalThis.G||{};G.Dash=G.Dash||{};G.Dash.BASE='+JSON.stringify(base)+';\n');
const m=S.agg(runs);for(const lv of S.LEVELS){const x=m[lv];console.log(lv,x.clear,x.death,x.timeout,x.avgTaken.toFixed(1),x.boss1.toFixed(1),(x.hitRate.melee*100).toFixed(1),(x.w4over*100).toFixed(1),x.floorEngage.map(f=>f.rate&&(f.rate*100).toFixed(0)).join(','));}
console.log('ms/run',ms/runs.length);
