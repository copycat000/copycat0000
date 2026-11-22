// 대시보드 시뮬: 프로토타입 core·data를 그대로 불러 쓰고, 고치지 않는다.
// 판 하나를 돌리면서 게임 사건 기록(s.log)을 읽어 대시보드에 필요한 판 요약을 만든다.
// 조정판 값은 DT를 복사한 뒤 복사본에만 덮어쓴다(원래 DT·게임은 그대로).
var G = globalThis.G = globalThis.G || {};

G.Dash = G.Dash || {};

G.Dash.sim = {
  LEVELS: ['skilled', 'mid', 'novice'],

  // 조정판 수치 6개. doc = DT 문서 값(프로토타입 파일의 테스트값이 아님)
  KNOBS: [
    { id: 'crit',      label: '치명타 확률',        unit: '%',  doc: 10,  min: 0,   max: 50,  step: 1 },
    { id: 'dashCd',    label: '대시 쿨타임',        unit: '초', doc: 1,   min: 0.5, max: 4,   step: 0.1 },
    { id: 'armor',     label: '보스 슈퍼아머',      unit: '',   doc: 30,  min: 5,   max: 80,  step: 1 },
    { id: 'timeLimit', label: '한 층 제한 시간',    unit: '초', doc: 120, min: 60,  max: 300, step: 10 },
    { id: 'bossHp',    label: '보스 체력',          unit: '',   doc: 600, min: 200, max: 1200, step: 50 },
    { id: 'meleeTele', label: '근거리 몹 예고 시간', unit: '초', doc: 0.6, min: 0.2, max: 1.2, step: 0.05 }
  ],

  docKnobs: function () {
    var k = {}; G.Dash.sim.KNOBS.forEach(function (d) { k[d.id] = d.doc; }); return k;
  },

  // DT 복사본에 조정판 값 덮어쓰기
  makeDT: function (base, knobs) {
    var dt = JSON.parse(JSON.stringify(base));
    dt.player.critChance = knobs.crit / 100;
    dt.player.dash.cooldown = knobs.dashCd;
    dt.enemies.B001.charge.armor = knobs.armor;
    dt.enemies.B001.hp = knobs.bossHp;
    dt.bots.floorTimeLimit = knobs.timeLimit;
    dt.enemies.E001.telegraph = knobs.meleeTele;
    return dt;
  },

  findBoss: function (s) {
    for (var i = 0; i < s.enemies.length; i++) if (s.enemies[i].type === 'boss' && !s.enemies[i].dead) return s.enemies[i];
    return null;
  },

  aliveCount: function (s) {
    var n = 0; for (var i = 0; i < s.enemies.length; i++) if (!s.enemies[i].dead && s.enemies[i].type !== 'boss') n++; return n;
  },

  // 판 하나. 프로토타입 core.bot.runOne과 같은 순서로 돌리고, 틱마다 새로 쌓인 사건을 읽는다
  runOne: function (dt, seed, level) {
    var C = G.Core, S = G.Dash.sim;
    var s = C.game.create(dt, seed), bot = C.bot.create(s, level), end;
    var x = {
      hitBy: { melee: 0, ranged: 0, slam: 0, charge: 0 },       // 받은 피해
      hitN:  { melee: 0, ranged: 0, slam: 0, charge: 0 },       // 맞은 횟수
      atkN:  { melee: 0, slam: 0, charge: 0 },                  // 나온 공격 수(맞은 비율 계산용)
      meleeHitDashCd: 0,                                        // 대시 쿨 중에 근거리형에게 맞은 횟수
      swings: 0, whiffs: 0, swingHits: 0,
      breakEngaged: 0, breakEarly: 0,                           // 붙어서 깸 / 알아차리기 전에 깨짐
      floorSeen: {}, floorEngage: {},                           // 층별 돌진 알아차림·붙음
      waveHp: [],                                               // 웨이브 끝날 때 남은 체력
      waveMaxAlive: [],                                         // 웨이브마다 동시에 있던 일반 적 최대 수
      timerBatches: [],                                         // 앞 묶음이 남은 채로 시간이 돼서 나온 묶음 {f,w,i}
      deathAt: null, deathBy: null,                             // 죽은 곳 / 마지막으로 맞은 공격 종류
      maps: [],                                                 // 층마다 나온 맵 ID(층 순서)
      lastHit: null
    };
    var cursor = 0, curMax = 0, lastEngage = 0, lastSeen = 0;
    for (;;) {
      end = C.bot.checkEnd(bot, s);
      if (end) break;
      if (s.phase === 'combat') {
        C.game.step(s, C.bot.think(bot, s));
        // 층별 돌진 알아차림·붙음
        var f = s.floor;
        if (bot.stats.chargeSeen !== lastSeen) { x.floorSeen[f] = (x.floorSeen[f] || 0) + bot.stats.chargeSeen - lastSeen; lastSeen = bot.stats.chargeSeen; }
        if (bot.stats.chargeEngage !== lastEngage) { x.floorEngage[f] = (x.floorEngage[f] || 0) + bot.stats.chargeEngage - lastEngage; lastEngage = bot.stats.chargeEngage; }
        for (; cursor < s.log.length; cursor++) {
          var ev = s.log[cursor];
          if (ev.type === 'playerHit') {
            var def = dt.enemies[ev.source], k;
            if (!def) continue;
            // 공격 종류는 게임 사건 기록의 attack 값(melee / ranged / slam / charge)을 그대로 씀
            k = ev.attack || (def.type === 'boss' ? 'slam' : def.type);
            x.lastHit = k;
            x.hitBy[k] += ev.dmg; x.hitN[k]++;
            if (k === 'melee' && s.player.dashCd > 0) x.meleeHitDashCd++;
          } else if (ev.type === 'enemySwing') {
            if (ev.boss) x.atkN.slam++; else x.atkN.melee++;
          } else if (ev.type === 'bossCharge') {
            x.atkN.charge++;
          } else if (ev.type === 'swing') {
            x.swings++; x.swingHits += ev.hits; if (ev.hits === 0) x.whiffs++;
          } else if (ev.type === 'bossBreak') {
            var engaged = false;
            for (var i = 0; i < bot.threats.length; i++) { var t = bot.threats[i]; if (t.uid === ev.uid && t.kind === 'charge' && t.engaged) engaged = true; }
            if (engaged) x.breakEngaged++; else x.breakEarly++;
          } else if (ev.type === 'batch' && ev.index > 1) {
            // 묶음은 틱 맨 끝에 나오니, 지금 살아 있는 수 − 이번 묶음 수 = 앞 묶음에서 남은 적
            var bt = s.waveData[ev.index - 1], bn = 0; for (var id in bt) bn += bt[id];
            var left = S.aliveCount(s) - bn;
            if (left > 0) x.timerBatches.push({ f: ev.floor, w: ev.wave, i: ev.index, left: left });
          } else if (ev.type === 'waveClear') {
            x.waveHp.push({ f: ev.floor, w: ev.wave, hp: Math.round(s.player.hp * 10) / 10 });
            x.waveMaxAlive.push({ f: ev.floor, w: ev.wave, n: curMax }); curMax = 0;
          } else if (ev.type === 'waveStart') {
            if (ev.wave === 1) x.maps.push(ev.map);
          } else if (ev.type === 'death') {
            x.deathAt = { f: ev.floor, w: ev.wave }; x.deathBy = x.lastHit;
          }
        }
        var a = S.aliveCount(s); if (a > curMax) curMax = a;
      } else if (s.phase === 'card') { var ci = C.bot.pickCard(bot, s); C.game.chooseCard(s, ci, C.bot.pickSlot(bot, s, ci)); }
      else if (s.phase === 'floor') C.game.nextFloor(s);
    }
    var r = C.bot.finish(bot, s, end);
    if (end !== 'clear' && s.wave) x.waveMaxAlive.push({ f: s.floor, w: s.wave, n: curMax, done: false });
    for (var key in x) r[key] = x[key];
    r.picks4 = r.picks ? r.picks.split(' ').slice(0, 4) : [];   // 1층 첫 4장(모든 판이 똑같이 고름)
    var p = s.player;
    r.cdFloor = C.player.basicCooldown(p) <= p.basicAttack.minCooldown + 1e-9;   // 평타 쿨타임 바닥에 닿음
    r.angMax = p.basicAttack.angle >= p.basicAttack.angleMax;                   // 평타 각도 최대에 닿음
    return S.compact(r);
  },

  // 대시보드가 쓰는 항목만 남김(기본 데이터 파일 크기 줄이기)
  compact: function (r) {
    return {
      seed: r.seed, level: r.level, outcome: r.outcome, floor: r.floor, wave: r.wave, time: r.time,
      taken: r.taken, dealt: r.dealt, picks4: r.picks4, nPicks: r.picks ? r.picks.split(' ').length : 0,
      waves: r.waves.map(function (w) { return [w.f, w.w, w.time, w.dmg, w.done ? 1 : 0]; }),
      waveHp: r.waveHp.map(function (w) { return [w.f, w.w, w.hp]; }),
      hitBy: r.hitBy, hitN: r.hitN, atkN: r.atkN, meleeHitDashCd: r.meleeHitDashCd,
      swings: r.swings, whiffs: r.whiffs,
      chargeSeen: r.chargeSeen, chargeEngage: r.chargeEngage,
      breakEngaged: r.breakEngaged, breakEarly: r.breakEarly, walls: r.walls,
      floorSeen: r.floorSeen, floorEngage: r.floorEngage,
      w4: r.waves.filter(function (w) { return w.w === 4; }).length,
      w4over: r.waves.filter(function (w) { return w.w === 4 && r.timerBatches.some(function (b) { return b.f === w.f && b.w === 4; }); }).length,
      maxAlive4: r.waveMaxAlive.filter(function (w) { return w.w === 4; }).map(function (w) { return w.n; }),
      cdFloor: r.cdFloor, angMax: r.angMax, deathAt: r.deathAt,
      maxHit: r.maxHit, deathBy: r.deathBy, maps: r.maps
    };
  },

  // 웨이브 순번: 1층 1웨이브 = 0 … 5층 5웨이브 = 24
  wIdx: function (f, w) { return (f - 1) * 5 + (w - 1); },

  // 판 묶음 → 실력별 숫자
  agg: function (runs) {
    var S = G.Dash.sim, out = {};
    S.LEVELS.forEach(function (lv) {
      var a = runs.filter(function (r) { return r.level === lv; }), n = a.length;
      var sum = function (f) { var t = 0; a.forEach(function (r) { t += f(r); }); return t; };
      var m = { n: n };
      m.clear = sum(function (r) { return r.outcome === 'clear' ? 1 : 0; });
      m.death = sum(function (r) { return r.outcome === 'death' ? 1 : 0; });
      m.timeout = sum(function (r) { return r.outcome === 'timeout' ? 1 : 0; });
      m.avgFloor = sum(function (r) { return r.floor; }) / n;
      m.avgTaken = sum(function (r) { return r.taken; }) / n;
      m.avgTime = sum(function (r) { return r.time; }) / n;
      m.hitBy = {}; m.hitRate = {};
      ['melee', 'ranged', 'slam', 'charge'].forEach(function (k) {
        m.hitBy[k] = sum(function (r) { return r.hitBy[k]; }) / n;
        if (k !== 'ranged') { var at = sum(function (r) { return r.atkN[k]; }); m.hitRate[k] = at ? sum(function (r) { return r.hitN[k]; }) / at : NaN; m.hitRate[k + 'N'] = at; }
      });
      // 웨이브별
      var wt = [], wc = [], hp = [], hc = [], dead = [], tout = [];
      for (var i = 0; i < 25; i++) { wt[i] = 0; wc[i] = 0; hp[i] = 0; hc[i] = 0; dead[i] = 0; tout[i] = 0; }
      a.forEach(function (r) {
        r.waves.forEach(function (w) { var i = S.wIdx(w[0], w[1]); if (i < 25 && w[4]) { wt[i] += w[2]; wc[i]++; } });
        r.waveHp.forEach(function (w) { var i = S.wIdx(w[0], w[1]); if (i < 25) { hp[i] += w[2]; hc[i]++; } });
        if (r.outcome !== 'clear') { var i = S.wIdx(r.floor, r.wave); if (i < 25) { if (r.outcome === 'death') dead[i]++; else tout[i]++; } }
      });
      m.waveTime = wt.map(function (v, i) { return wc[i] ? v / wc[i] : null; });
      m.waveN = wc;
      m.waveHp = hp.map(function (v, i) { return hc[i] ? v / hc[i] : null; });
      m.waveDead = dead; m.waveTimeout = tout;
      m.boss1 = m.waveTime[4]; m.boss1N = wc[4];
      m.dps = sum(function (r) { return r.time ? r.dealt / r.time : 0; }) / n;
      var sw = sum(function (r) { return r.swings; });
      m.whiff = sw ? sum(function (r) { return r.whiffs; }) / sw : NaN;
      m.breakEngaged = sum(function (r) { return r.breakEngaged; });
      m.breakEarly = sum(function (r) { return r.breakEarly; });
      m.walls = sum(function (r) { return r.walls; });
      m.chargeSeen = sum(function (r) { return r.chargeSeen; });
      m.chargeEngage = sum(function (r) { return r.chargeEngage; });
      m.floorEngage = [];
      for (var f = 1; f <= 5; f++) {
        var se = sum(function (r) { return r.floorSeen[f] || 0; }), en = sum(function (r) { return r.floorEngage[f] || 0; });
        m.floorEngage.push({ f: f, seen: se, engage: en, rate: se ? en / se : null });
      }
      var w4 = sum(function (r) { return r.w4; });
      m.w4over = w4 ? sum(function (r) { return r.w4over; }) / w4 : NaN; m.w4N = w4;
      var ma = []; a.forEach(function (r) { ma = ma.concat(r.maxAlive4); });
      m.maxAlive4 = ma.length ? ma.reduce(function (x, y) { return x + y; }, 0) / ma.length : NaN;
      m.meleeHitDashCd = sum(function (r) { return r.meleeHitDashCd; }) / n;
      m.cdFloor = sum(function (r) { return r.cdFloor ? 1 : 0; }) / n;
      m.angMax = sum(function (r) { return r.angMax ? 1 : 0; }) / n;
      // 공격력(C003)·평타 피해 배율(C101) 같이 고른 판 vs 한쪽만(1층 첫 4장 기준), 초당 피해
      var g = { both: [], atk: [], basic: [], none: [] };
      a.forEach(function (r) {
        var A = r.picks4.some(function (p) { return p.indexOf('C003') === 0; }), B = r.picks4.some(function (p) { return p.indexOf('C101') === 0; });
        g[A && B ? 'both' : A ? 'atk' : B ? 'basic' : 'none'].push(r.time ? r.dealt / r.time : 0);
      });
      m.syn = {};
      for (var k in g) m.syn[k] = { n: g[k].length, dps: g[k].length ? g[k].reduce(function (x, y) { return x + y; }, 0) / g[k].length : NaN };
      out[lv] = m;
    });
    return out;
  }
};
