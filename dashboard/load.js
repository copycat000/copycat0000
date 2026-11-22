// Node에서 프로토타입 core + 대시보드 sim을 불러오는 도우미(gen.js가 씀)
const fs=require('fs'),vm=require('vm'),path=require('path'),P=path.join(__dirname,'../prototype/');
const files=['data/common.js','data/player.js','data/enemies.js','data/cards.js','data/bosses.js','data/maps.js','data/skills.js','data/env.js','data/bots.js','core/rng.js','core/geom.js','core/player.js','core/enemy.js','core/boss.js','core/wave.js','core/cards.js','core/game.js','core/bot.js'].map(f=>P+f);
files.push(path.join(__dirname,'sim.js'));
for(const f of files) vm.runInThisContext(fs.readFileSync(f,'utf8'),{filename:f});
module.exports=globalThis.G;
