// 봇: 키보드 대신 매 틱 입력 묶음(이동·공격·대시·스킬1·2)을 만들어 넘긴다. 게임 규칙 코드는 그대로.
// 기준: 시스템 기획 6번 봇
//   - 가장 가까운 적에게 다가가고, 평타 거리 안이면 멈춰서 쿨타임마다 공격
//   - 다가갈 때 이미 알아차린 위험 범위로는 안 들어감(돌아서 가거나 잠깐 섬). 피한 뒤 탄 길로 다시 걸어 들어가 피하기를 반복하던 것 고침(타디온 11/20)
//   - 예고가 시작되고 반응 시간이 지나야 알아차림. 그 순간 아직 위험이 남아 있고 범위 안이면
//     범위 밖으로 대시, 대시가 쿨타임이면 걸어서 빠짐(근거리 예고·보스 패턴·탄 모두 같은 규칙)
//   - 대시로 피하는 동안에도 평타 거리 안 적에게 평타(타디온 11/20). 걸어서 피할 땐 공격 안 함
//   - 반응 시간은 피하기에만. 이동·공격엔 안 걸림
//   - 카드는 무작위
//   - 보스 돌진: 알아차린 순간 남은 예고 시간 안에 슈퍼아머를 다 깎을 수 있으면 붙어서 때리고, 아니면 옆으로 피함
// 봇의 무작위(반응 시간, 카드)는 판의 무작위와 따로 굴림. 그래서 같은 시드면 사람 판과 봇 판의 적 등장·카드 후보가 같고,
// 같은 시드 + 같은 실력이면 봇 판도 똑같이 다시 나온다.
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.bot = {
  create: function (s, level) {
    var cfg = s.dt.bots, lv = cfg.levels[level];
    if (!lv) throw new Error('봇 실력 이름이 없음: ' + level);
    return {
      level: level, cfg: cfg, reaction: lv.reaction,
      rng: G.Core.createRng((s.seed ^ 0x9E3779B9) >>> 0),
      cursor: 0,              // s.log에서 어디까지 읽었나
      threats: [],            // 지금 살아 있는 공격(예고~끝날 때까지)
      linked: [],             // 이미 어느 예고에 붙인 탄
      plan: null,             // 지금 피하는 방향
      floor: s.floor, floorStart: s.time,
      stats: { dodges: 0, dashDodges: 0, walkDodges: 0, dashAttacks: 0, chargeSeen: 0, chargeEngage: 0 }
    };
  },

  // ---- 공격 알아차리기 ----
  readLog: function (bot, s) {
    for (; bot.cursor < s.log.length; bot.cursor++) {
      var ev = s.log[bot.cursor];
      if (ev.type !== 'telegraph') continue;
      var def = s.dt.enemies[ev.defId];
      var kind = def.type === 'boss' ? ev.pattern : def.type;     // melee / ranged / slam / charge
      var rt = bot.reaction[0] + (bot.reaction[1] - bot.reaction[0]) * bot.rng.next();
      bot.threats.push({ uid: ev.uid, kind: kind, start: s.time, notice: s.time + rt, rt: rt, proj: null, decided: false, engaged: false });
    }
  },

  findEnemy: function (s, uid) {
    for (var i = 0; i < s.enemies.length; i++) if (s.enemies[i].uid === uid && !s.enemies[i].dead) return s.enemies[i];
    return null;
  },

  // 공격이 아직 남아 있는지 보고, 끝난 건 지움
  refresh: function (bot, s) {
    var B = G.Core.bot, keep = [];
    for (var i = 0; i < bot.threats.length; i++) {
      var t = bot.threats[i], e = B.findEnemy(s, t.uid);
      t.enemy = e;
      var alive;
      if (t.kind === 'melee') alive = e && e.state === 'telegraph';
      else if (t.kind === 'slam') alive = e && e.state === 'slamTele';
      else if (t.kind === 'charge') alive = e && (e.state === 'chargeTele' || e.state === 'charging');
      else {                                                   // ranged: 예고 → 탄
        if (e && e.state === 'telegraph' && !t.proj) alive = true;
        else {
          if (!t.proj) {
            for (var k = 0; k < s.projectiles.length; k++) {
              var b = s.projectiles[k];
              if (b.owner === t.uid && bot.linked.indexOf(b) < 0) { t.proj = b; bot.linked.push(b); break; }
            }
          }
          alive = !!t.proj && s.projectiles.indexOf(t.proj) >= 0;
        }
      }
      if (alive) keep.push(t);
    }
    bot.threats = keep;
    bot.linked = bot.linked.filter(function (b) { return s.projectiles.indexOf(b) >= 0; });
  },

  // ---- 위험 범위 ----
  // 띠 모양(탄 길, 돌진 길): 시작점 o, 방향 dir, 길이 len, 반폭 w
  inStrip: function (ox, oy, dir, len, w, x, y, r) {
    var dx = x - ox, dy = y - oy;
    var along = dx * dir.x + dy * dir.y;
    if (along < -(w + r) || along > len + w + r) return false;
    var perp = Math.abs(dx * dir.y - dy * dir.x);
    return perp < w + r;
  },

  // 이 공격이 (x,y)에 서 있는 몸 반지름 r을 맞히는지
  danger: function (s, t, x, y, r) {
    var e = t.enemy, geom = G.Core.geom, def;
    if (t.kind === 'melee') { def = s.dt.enemies[e.defId]; return geom.circleInFan(e.x, e.y, e.teleDir, def.attackRange, def.attackAngle, x, y, r); }
    if (t.kind === 'slam') { def = s.dt.enemies[e.defId]; return geom.circleInFan(e.x, e.y, e.teleDir, def.slam.range + e.r, def.slam.angle, x, y, r); }
    if (t.kind === 'charge') {
      def = s.dt.enemies[e.defId];
      var len = e.state === 'charging' ? e.chargeLeft : def.charge.distance;
      return G.Core.bot.inStrip(e.x, e.y, e.teleDir, len, e.r, x, y, r);
    }
    if (t.proj) {
      var b = t.proj, v = geom.norm(b.vx, b.vy);
      return G.Core.bot.inStrip(b.x, b.y, v, 3000, b.r, x, y, r);
    }
    def = s.dt.enemies[e.defId];
    return G.Core.bot.inStrip(e.x, e.y, e.teleDir, 3000, def.projectileDiameter / 2, x, y, r);
  },

  // 걸어서 빠질 때 쓸 수 있는 시간(공격이 내 자리에 닿기까지)
  timeLeft: function (s, t, p) {
    var e = t.enemy, geom = G.Core.geom, def, along;
    if (t.kind === 'melee' || t.kind === 'slam') return e.teleTime;
    if (t.kind === 'charge') {
      def = s.dt.enemies[e.defId];
      along = Math.max(0, (p.x - e.x) * e.teleDir.x + (p.y - e.y) * e.teleDir.y - e.r - p.r);
      return (e.state === 'chargeTele' ? e.teleTime : 0) + along / def.charge.speed;
    }
    if (t.proj) {
      var b = t.proj, spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      along = Math.max(0, ((p.x - b.x) * b.vx + (p.y - b.y) * b.vy) / spd - b.r - p.r);
      return along / spd;
    }
    def = s.dt.enemies[e.defId];
    along = Math.max(0, (p.x - e.x) * e.teleDir.x + (p.y - e.y) * e.teleDir.y - p.r);
    return e.teleTime + along / def.projectileSpeed;
  },

  // ---- 피할 방향 고르기 ----
  // 후보 방향마다 대시(또는 걸어서) 끝나는 자리를 계산해, 알아차린 공격을 가장 많이 벗어나는 방향을 고름.
  // 같으면 벽에서 먼 쪽(구석에 몰리지 않게), 그다음 공격 쪽에서 멀어지는 쪽.
  pickDir: function (bot, s, active, useDash) {
    var B = G.Core.bot, p = s.player, W = s.map.width, H = s.map.height;
    var n = bot.cfg.dodgeDirs, m = bot.cfg.safeMargin, best = null, bestScore = -1e9;
    var src = active[0].proj || active[0].enemy;
    var away = G.Core.geom.norm(p.x - src.x, p.y - src.y);
    for (var i = 0; i < n; i++) {
      var a = i * 2 * Math.PI / n, dir = { x: Math.cos(a), y: Math.sin(a) };
      var safe = 0, wallD = 1e9;
      for (var k = 0; k < active.length; k++) {
        var dist = useDash ? p.dash.distance : p.moveSpeed * Math.max(0, B.timeLeft(s, active[k], p) - s.h);
        var qx = Math.max(p.r, Math.min(W - p.r, p.x + dir.x * dist));
        var qy = Math.max(p.r, Math.min(H - p.r, p.y + dir.y * dist));
        if (!B.danger(s, active[k], qx, qy, p.r + m)) safe++;
        wallD = Math.min(wallD, qx - p.r, W - p.r - qx, qy - p.r, H - p.r - qy);
      }
      var score = safe * 1000 + Math.min(wallD, 150) + 30 * (dir.x * away.x + dir.y * away.y);
      if (score > bestScore) { bestScore = score; best = dir; }
    }
    return best;
  },

  // ---- 보스 돌진: 깎을 수 있나 ----
  canBreak: function (s, e) {
    var p = s.player, ba = p.basicAttack;
    var reach = ba.range + e.r - s.dt.bots.stopInside;
    var d = G.Core.geom.dist(p.x, p.y, e.x, e.y);
    var approachT = Math.max(0, d - reach) / p.moveSpeed;
    var cd = G.Core.player.basicCooldown(p);
    var expDmg = p.attack * ba.damageMult * (1 + p.critChance * (p.critMult - 1));   // 기대 피해
    var hits = 0;
    for (var t = Math.max(p.atkCd, approachT); t <= e.teleTime - s.h; t += cd) hits++;
    return hits * expDmg >= e.armor;
  },

  // ---- 매 틱 입력 만들기 ----
  think: function (bot, s) {
    var B = G.Core.bot, p = s.player, geom = G.Core.geom;
    var sk = s.player.skills;   // 스킬은 쿨타임이 돌면 바로 씀(임시 규칙, 타디온 11/22)
    var input = { moveX: 0, moveY: 0, faceX: 0, faceY: 0, attack: false, dash: false, skill1: !!(sk[0] && sk[0].cd <= 0), skill2: !!(sk[1] && sk[1].cd <= 0) };
    B.readLog(bot, s);
    B.refresh(bot, s);

    // 알아차린 공격 중 지금 내 자리를 맞히는 것
    var active = [];
    for (var i = 0; i < bot.threats.length; i++) {
      var t = bot.threats[i];
      if (s.time < t.notice) continue;
      if (t.kind === 'charge' && !t.decided) {            // 돌진은 알아차린 순간 한 번 정함
        t.decided = true; bot.stats.chargeSeen++;
        if (t.enemy.state === 'chargeTele' && B.canBreak(s, t.enemy)) { t.engaged = true; bot.stats.chargeEngage++; }
      }
      if (t.engaged) continue;
      if (B.danger(s, t, p.x, p.y, p.r + bot.cfg.safeMargin)) active.push(t);
    }

    if (active.length > 0 && p.dashTime <= 0) {
      var dashReady = p.dashCd <= 0;
      if (!bot.plan || dashReady) {
        var dir = B.pickDir(bot, s, active, dashReady);
        if (!bot.plan) { bot.stats.dodges++; if (dashReady) bot.stats.dashDodges++; else bot.stats.walkDodges++; }
        bot.plan = { dir: dir };
        if (dashReady) input.dash = true;
      }
      input.moveX = bot.plan.dir.x; input.moveY = bot.plan.dir.y;
      return input;
    }
    if (p.dashTime > 0 && bot.plan) {
      // 대시로 피하는 중에도 평타(타디온 11/20). 대시 중엔 이동 입력이 바라보는 방향만 바꾸고 미끄러지는 방향은 그대로라,
      // 평타 거리 안에 적이 있으면 그쪽을 보고 친다. 걸어서 피할 때는 그대로 공격 안 함
      var tg = B.nearest(s), reachD = tg ? p.basicAttack.range + tg.r - bot.cfg.stopInside : 0;
      if (tg && p.atkCd <= 0 && geom.dist(p.x, p.y, tg.x, tg.y) <= reachD) {
        var toT = geom.norm(tg.x - p.x, tg.y - p.y);
        input.moveX = toT.x; input.moveY = toT.y; input.attack = true; bot.stats.dashAttacks++;
      } else { input.moveX = bot.plan.dir.x; input.moveY = bot.plan.dir.y; }
      return input;
    }
    bot.plan = null;

    // 기본 행동: 가장 가까운 적
    var target = B.nearest(s);
    if (!target) return input;
    var to = geom.norm(target.x - p.x, target.y - p.y);
    var dist = geom.dist(p.x, p.y, target.x, target.y);
    var reach = p.basicAttack.range + target.r - bot.cfg.stopInside;
    if (dist > reach) {
      var mv = B.safeStep(bot, s, to);
      if (mv) { input.moveX = mv.x; input.moveY = mv.y; }
    }
    else if (p.atkCd <= 0) { input.moveX = to.x; input.moveY = to.y; input.attack = true; }   // 이번 틱에 그쪽을 보고 공격
    return input;
  },

  // 다가갈 때 알아차린 위험 범위 안으로 들어가지 않게: 적 쪽에 가장 가까운 방향 중 다음 걸음이 안전한 방향. 없으면 그 자리에 섬
  safeStep: function (bot, s, to) {
    var B = G.Core.bot, p = s.player, m = bot.cfg.safeMargin, known = [];
    for (var i = 0; i < bot.threats.length; i++) { var t = bot.threats[i]; if (s.time >= t.notice && !t.engaged) known.push(t); }
    if (known.length === 0) return to;
    var n = bot.cfg.dodgeDirs, base = Math.atan2(to.y, to.x), stepLen = p.moveSpeed * s.h * 3;
    for (var k = 0; k <= n / 2; k++) {
      for (var sgn = 1; sgn >= -1; sgn -= 2) {
        if (k === 0 && sgn < 0) continue;
        var a = base + sgn * k * 2 * Math.PI / n, d = { x: Math.cos(a), y: Math.sin(a) };
        if (k > n / 4) return null;            // 적 반대쪽으로 도는 건 안 함
        var qx = p.x + d.x * stepLen, qy = p.y + d.y * stepLen, ok = true;
        for (var j = 0; j < known.length; j++) if (B.danger(s, known[j], qx, qy, p.r + m)) { ok = false; break; }
        if (ok) return d;
      }
    }
    return null;
  },

  nearest: function (s) {
    var p = s.player, target = null, best = 1e9;
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i]; if (e.dead) continue;
      var d0 = G.Core.geom.dist(p.x, p.y, e.x, e.y) - e.r;
      if (d0 < best) { best = d0; target = e; }
    }
    return target;
  },

  pickCard: function (bot, s) { return bot.rng.int(s.cardOffer.length); },
  // 스킬 카드면 넣을 칸도 무작위(0 = S, 1 = D). 스킬 카드가 아니면 undefined
  pickSlot: function (bot, s, index) {
    var c = G.Core.cards.find(s, s.cardOffer[index].id);
    return c.group === 'skill' ? bot.rng.int(2) : undefined;
  },

  // 판이 끝났나: 'death' / 'clear' / 'timeout' / null
  checkEnd: function (bot, s) {
    if (s.phase === 'dead') return 'death';
    if (s.floor !== bot.floor) { bot.floor = s.floor; bot.floorStart = s.time; }
    if (s.phase === 'floor' && s.floor >= bot.cfg.clearAtFloor && !s.infinite) return 'clear';
    if (s.phase === 'combat' && s.time - bot.floorStart > bot.cfg.floorTimeLimit) return 'timeout';
    return null;
  },

  // 클리어·시간 초과도 결과 화면으로 보내고, 판 요약을 돌려줌
  finish: function (bot, s, outcome) {
    if (outcome !== 'death') {
      s.phase = 'dead';
      s.result = { seed: s.seed, floor: s.floor, wave: s.wave, time: s.time, picks: s.picks.slice(), stats: JSON.parse(JSON.stringify(s.stats)) };
      G.Core.emit(s, 'botEnd', { outcome: outcome });
    }
    s.result.outcome = outcome;
    s.result.botLevel = bot.level;
    return G.Core.bot.summary(bot, s, outcome);
  },

  // 판 요약 기록(대량 실행이 한 판에 남기는 것). 튀는 판 짚기용: 시드, 웨이브별 걸린 시간·받은 피해
  summary: function (bot, s, outcome) {
    var waves = [], cur = null, maxHit = 0, breaks = 0, walls = 0, r2 = function (v) { return Math.round(v * 100) / 100; };
    for (var i = 0; i < s.log.length; i++) {
      var ev = s.log[i];
      if (ev.type === 'waveStart') cur = { f: ev.floor, w: ev.wave, start: ev.t, dmg: 0 };
      else if (ev.type === 'playerHit') { if (cur) cur.dmg += ev.dmg; maxHit = Math.max(maxHit, ev.dmg); }
      else if (ev.type === 'waveClear' && cur) { waves.push({ f: cur.f, w: cur.w, time: r2(ev.time), dmg: r2(cur.dmg), done: true }); cur = null; }
      else if (ev.type === 'bossBreak') breaks++;
      else if (ev.type === 'bossWall') walls++;
    }
    if (cur) waves.push({ f: cur.f, w: cur.w, time: r2(s.time - cur.start), dmg: r2(cur.dmg), done: false });
    return {
      seed: s.seed, level: bot.level, outcome: outcome,
      floor: s.floor, wave: s.wave, time: r2(s.time),
      kills: s.stats.kills, dealt: r2(s.stats.damageDealt), taken: r2(s.stats.damageTaken), maxHit: r2(maxHit),
      picks: s.picks.map(function (p) { return p.id + ':' + p.tier; }).join(' '),
      dodges: bot.stats.dodges, dashDodges: bot.stats.dashDodges, walkDodges: bot.stats.walkDodges, dashAttacks: bot.stats.dashAttacks,
      chargeSeen: bot.stats.chargeSeen, chargeEngage: bot.stats.chargeEngage, breaks: breaks, walls: walls,
      waves: waves
    };
  },

  // 화면 없이 한 판 끝까지(대량 실행용)
  runOne: function (dt, seed, level) {
    var s = G.Core.game.create(dt, seed), bot = G.Core.bot.create(s, level), end;
    for (;;) {
      end = G.Core.bot.checkEnd(bot, s);
      if (end) break;
      if (s.phase === 'combat') G.Core.game.step(s, G.Core.bot.think(bot, s));
      else if (s.phase === 'card') { var ci = G.Core.bot.pickCard(bot, s); G.Core.game.chooseCard(s, ci, G.Core.bot.pickSlot(bot, s, ci)); }
      else if (s.phase === 'floor') G.Core.game.nextFloor(s);
    }
    return G.Core.bot.finish(bot, s, end);
  }
};
