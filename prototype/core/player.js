// 플레이어 규칙: 이동, 기본 공격, 대시, 피격
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.player = {
  create: function (dt) {
    var p = JSON.parse(JSON.stringify(dt.player));   // DT 원본은 건드리지 않고 복사해서 씀
    p.r = p.bodyDiameter / 2;
    p.x = 0; p.y = 0;
    p.hp = p.maxHp;
    p.facing = { x: 1, y: 0 };
    p.atkCd = 0;
    p.dashCd = 0;
    p.dashTime = 0;            // 남은 대시 이동 시간(>0이면 대시 중, 무적)
    p.dashDir = { x: 1, y: 0 };
    p.hitInvulnTime = 0;
    p.regenTimer = 0;
    p.kbVx = 0; p.kbVy = 0; p.kbTime = 0;   // 맞고 밀려나는 중
    p.skills = [null, null];   // S·D 칸: { id, cd }
    p.skillInvulnTime = 0;     // 무적 스킬 남은 시간
    p.rushTime = 0; p.rushDir = { x: 1, y: 0 }; p.rushHit = {}; p.rushMult = 1;   // 돌진 베기
    return p;
  },

  isInvulnerable: function (p) { return p.dashTime > 0 || p.hitInvulnTime > 0 || p.skillInvulnTime > 0; },

  basicCooldown: function (p) {
    var ba = p.basicAttack;
    return Math.max(ba.minCooldown, ba.cooldown * (1 - p.basicCdReduction));
  },

  update: function (s, input, h) {
    var p = s.player, geom = G.Core.geom;
    p.atkCd = Math.max(0, p.atkCd - h);
    p.dashCd = Math.max(0, p.dashCd - h);
    p.hitInvulnTime = Math.max(0, p.hitInvulnTime - h);
    G.Core.skills.tick(s, h);

    // 맞고 밀려나는 중: 밀리는 거리만큼 움직이고, lockMove면 조작(이동·공격·대시) 전부 무시
    // 의도(타디온 11/20): 맞으면 끝까지 밀려야 피하든 파훼하든 하라는 압력이 생김
    if (p.kbTime > 0) {
      var kt = Math.min(h, p.kbTime);
      p.x += p.kbVx * kt; p.y += p.kbVy * kt;
      p.kbTime = Math.max(0, p.kbTime - h);
      if (p.hitKnockback.lockMove) { G.Core.player.tickRegen(s, h); return; }
    }

    var dir = geom.norm(input.moveX || 0, input.moveY || 0);   // 대각선도 같은 속도
    var moving = dir.x !== 0 || dir.y !== 0;
    // 바라보는 방향: 보통은 이동 방향. 입력 쪽이 faceX/faceY를 주면 그걸 씀
    // (대각선에서 두 키를 살짝 다른 순간에 뗄 때 상하좌우로 꺾이는 걸 막으려고 화면 쪽에서 넣어줌)
    var face = (input.faceX || input.faceY) ? geom.norm(input.faceX || 0, input.faceY || 0) : dir;
    if (moving) p.facing = face;                               // 마지막 이동 방향 유지

    // 대시: 공격 중이어도 바로 나간다. 방향키 누르고 있으면 그 방향, 아니면 바라보는 방향
    if (input.dash && p.dashCd <= 0 && p.dashTime <= 0 && p.rushTime <= 0) {
      p.dashDir = moving ? face : p.facing;
      p.facing = p.dashDir;
      p.dashTime = p.dash.invuln;
      p.dashCd = p.dash.cooldown;
      G.Core.emit(s, 'dash', { x: p.x, y: p.y });
    }

    // 스킬: S = 1칸, D = 2칸
    if (input.skill1) G.Core.skills.use(s, 0, moving ? face : { x: 0, y: 0 });
    if (input.skill2) G.Core.skills.use(s, 1, moving ? face : { x: 0, y: 0 });

    var vx, vy, rushing = false;
    if (p.rushTime > 0) {          // 돌진 베기: 대시 속도로 미끄러짐. 방향키 이동은 무시
      var rs = p.dash.distance / p.dash.invuln, rstep = Math.min(h, p.rushTime);
      vx = p.rushDir.x * rs * rstep / h; vy = p.rushDir.y * rs * rstep / h;
      p.rushTime = Math.max(0, p.rushTime - h);
      rushing = true;
    } else if (p.dashTime > 0) {
      var spd = p.dash.distance / p.dash.invuln;
      var step = Math.min(h, p.dashTime);
      vx = p.dashDir.x * spd * step / h; vy = p.dashDir.y * spd * step / h;
      p.dashTime = Math.max(0, p.dashTime - h);
    } else {
      vx = dir.x * p.moveSpeed; vy = dir.y * p.moveSpeed;
    }
    p.x += vx * h; p.y += vy * h;
    if (rushing) {
      p.x = Math.max(p.r, Math.min(s.map.width - p.r, p.x)); p.y = Math.max(p.r, Math.min(s.map.height - p.r, p.y));
      G.Core.skills.rushHits(s);
    }

    // 기본 공격: 누른 순간 한 번 판정. 대시 중에도 가능
    if (input.attack && p.atkCd <= 0) {
      G.Core.player.basicAttack(s);
      p.atkCd = G.Core.player.basicCooldown(p);
    }

    G.Core.player.tickRegen(s, h);
  },

  // 자연 회복: 1초마다
  tickRegen: function (s, h) {
    var p = s.player;
    if (p.regen > 0) {
      p.regenTimer += h;
      while (p.regenTimer >= 1) { p.regenTimer -= 1; G.Core.player.heal(s, p.regen); }
    }
  },

  basicAttack: function (s) {
    var p = s.player, ba = p.basicAttack, geom = G.Core.geom;
    var hits = 0;
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (e.dead) continue;
      if (!geom.circleInFan(p.x, p.y, p.facing, ba.range, ba.angle, e.x, e.y, e.r)) continue;
      var dmg = p.attack * ba.damageMult;
      var crit = s.rng.chance(p.critChance);
      if (crit) dmg *= p.critMult;
      var away = geom.norm(e.x - p.x, e.y - p.y);
      if (away.x === 0 && away.y === 0) away = p.facing;
      G.Core.enemy.takeDamage(s, e, dmg, crit, away);
      if (ba.knockback > 0 && !e.dead && e.type !== 'boss') G.Core.enemy.knockback(e, away, ba.knockback, ba.knockbackTime);
      if (p.lifesteal > 0) G.Core.player.heal(s, dmg * p.lifesteal);
      hits++;
    }
    G.Core.emit(s, 'swing', { x: p.x, y: p.y, dir: { x: p.facing.x, y: p.facing.y }, range: ba.range, angle: ba.angle, hits: hits });
  },

  heal: function (s, amount) {
    var p = s.player;
    p.hp = Math.min(p.maxHp, p.hp + amount);
  },

  // dir: 밀려날 방향(공격 반대쪽), kbMult: 넉백 배수(보스 패턴은 배수로 키움). dir 없으면 안 밀림
  // attack: 공격 종류(melee / ranged / slam / charge). 기록용이라 규칙에는 영향 없음
  takeDamage: function (s, raw, sourceId, dir, kbMult, attack) {
    var p = s.player;
    if (G.Core.player.isInvulnerable(p)) return false;
    var dmg = Math.max(s.dt.common.minDamage, raw - p.defense);
    p.hp -= dmg;
    p.hitInvulnTime = p.hitInvuln;
    s.stats.damageTaken += dmg;
    var kb = p.hitKnockback, m = kbMult === undefined ? 1 : kbMult;
    if (dir && kb.distance > 0 && m > 0) {
      p.kbVx = dir.x * kb.distance * m / kb.time; p.kbVy = dir.y * kb.distance * m / kb.time; p.kbTime = kb.time;
      p.dashTime = 0;       // 대시 중엔 무적이라 여기 안 옴. 안전하게 끊어둠
      p.rushTime = 0;       // 돌진 베기는 무적이 아니라 맞으면 끊김
    }
    G.Core.emit(s, 'playerHit', { dmg: dmg, source: sourceId, attack: attack || null, hp: p.hp, kbMult: m });
    if (p.hp <= 0) { p.hp = 0; G.Core.game.onDeath(s); }
    return true;
  }
};
