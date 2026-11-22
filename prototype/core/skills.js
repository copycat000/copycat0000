// 스킬 규칙(시스템 기획 7번). 카드로 얻어 S·D 칸에 넣고 쓴다. 화면 코드 없음
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.skills = {
  def: function (s, id) { return s.dt.skills.list[id]; },

  // 스킬 쿨타임 = 스킬별 쿨타임 × (1 − 스킬 쿨타임 감소), 최소 쿨타임 밑으로는 안 내려감
  cooldown: function (s, def) {
    return Math.max(s.dt.skills.minCooldown, def.cooldown * (1 - s.player.skillCdReduction));
  },

  owns: function (s, skillId) {
    var sk = s.player.skills;
    return (sk[0] && sk[0].id === skillId) || (sk[1] && sk[1].id === skillId);
  },

  // 칸(0 = S, 1 = D)에 스킬을 넣음. 찬 칸이면 원래 스킬은 없어짐
  equip: function (s, slot, skillId) {
    s.player.skills[slot] = { id: skillId, cd: 0 };
    s.hasSkill = true;
  },

  tick: function (s, h) {
    var p = s.player;
    for (var i = 0; i < 2; i++) if (p.skills[i]) p.skills[i].cd = Math.max(0, p.skills[i].cd - h);
    p.skillInvulnTime = Math.max(0, p.skillInvulnTime - h);
  },

  // moveDir: 이번 틱 방향키 방향(없으면 0,0)
  use: function (s, slot, moveDir) {
    var p = s.player, sk = p.skills[slot];
    if (!sk || sk.cd > 0) return false;
    var def = G.Core.skills.def(s, sk.id), moving = moveDir.x !== 0 || moveDir.y !== 0;
    if (sk.id === 'S003' && (p.dashTime > 0 || p.rushTime > 0)) return false;   // 대시·돌진 중엔 겹쳐 쓰지 않음
    sk.cd = G.Core.skills.cooldown(s, def);
    switch (sk.id) {
      case 'S001':   // 무적: 조작은 그대로, 투사체는 통과
        p.skillInvulnTime = def.duration;
        G.Core.emit(s, 'skillInvuln', { x: p.x, y: p.y, time: def.duration });
        break;
      case 'S002':   // 회복: 최대 체력의 절반
        G.Core.player.heal(s, p.maxHp * def.healRatio);
        G.Core.emit(s, 'skillHeal', { x: p.x, y: p.y, hp: p.hp });
        break;
      case 'S003':   // 돌진 베기: 대시와 같은 방향 규칙, 대시 속도로 대시 거리 × 배수만큼. 무적 아님
        p.rushDir = moving ? moveDir : p.facing;
        p.facing = p.rushDir;
        p.rushTime = p.dash.distance * def.distanceMult / (p.dash.distance / p.dash.invuln);
        p.rushHit = {}; p.rushMult = def.damageMult;
        G.Core.emit(s, 'skillRush', { x: p.x, y: p.y, dir: { x: p.rushDir.x, y: p.rushDir.y } });
        break;
      case 'S004':   // 탄 지우기: 주변 범위 안 적 투사체 전부 제거
        var keep = [], n = 0;
        for (var i = 0; i < s.projectiles.length; i++) {
          var b = s.projectiles[i], dx = b.x - p.x, dy = b.y - p.y;
          if (dx * dx + dy * dy <= def.radius * def.radius) { n++; continue; }
          keep.push(b);
        }
        s.projectiles = keep;
        G.Core.emit(s, 'skillClear', { x: p.x, y: p.y, r: def.radius, removed: n });
        break;
      case 'S005':   // 검기: 바라보는 방향 직선, 관통, 벽이나 사거리에서 사라짐
        s.playerShots.push({ x: p.x, y: p.y, vx: p.facing.x * def.speed, vy: p.facing.y * def.speed, r: def.diameter / 2,
          left: def.range, mult: def.damageMult, hit: {} });
        G.Core.emit(s, 'skillShot', { x: p.x, y: p.y, dir: { x: p.facing.x, y: p.facing.y } });
        break;
    }
    return true;
  },

  // 스킬 피해 한 번: 공격력 × 스킬 피해 배율, 치명타·흡수는 기본 공격과 같게
  hit: function (s, e, mult, dir) {
    var p = s.player, dmg = p.attack * mult, crit = s.rng.chance(p.critChance);
    if (crit) dmg *= p.critMult;
    G.Core.enemy.takeDamage(s, e, dmg, crit, dir);
    if (p.lifesteal > 0) G.Core.player.heal(s, dmg * p.lifesteal);
  },

  // 돌진 중: 지나간 길에서 기본 공격 거리 안에 들어온 적을 한 번씩 때림
  rushHits: function (s) {
    var p = s.player, range = p.basicAttack.range;
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (e.dead || p.rushHit[e.uid]) continue;
      var dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d - e.r > range) continue;
      p.rushHit[e.uid] = true;
      G.Core.skills.hit(s, e, p.rushMult, d > 0 ? { x: dx / d, y: dy / d } : p.rushDir);
    }
  },

  updateShots: function (s, h) {
    var W = s.map.width, H = s.map.height, keep = [];
    for (var i = 0; i < s.playerShots.length; i++) {
      var b = s.playerShots[i], step = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * h;
      b.x += b.vx * h; b.y += b.vy * h; b.left -= step;
      if (b.left <= 0 || b.x < b.r || b.y < b.r || b.x > W - b.r || b.y > H - b.r) continue;
      for (var j = 0; j < s.enemies.length; j++) {
        var e = s.enemies[j];
        if (e.dead || b.hit[e.uid]) continue;
        if (!G.Core.geom.circlesOverlap(b.x, b.y, b.r, e.x, e.y, e.r)) continue;
        b.hit[e.uid] = true;
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        G.Core.skills.hit(s, e, b.mult, { x: b.vx / sp, y: b.vy / sp });
      }
      keep.push(b);
    }
    s.playerShots = keep;
    s.enemies = s.enemies.filter(function (e) { return !e.dead; });
  }
};
