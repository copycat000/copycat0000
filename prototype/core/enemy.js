// 적 규칙. 적마다 상태 하나(state)를 두고 조건에 따라 넘긴다.
// 상태: approach(다가감) / idle(제자리 대기) / retreat(멀어짐) / telegraph(예고, 멈춤)
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.enemy = {
  create: function (s, defId, x, y) {
    var def = s.dt.enemies[defId];
    return {
      uid: s.nextUid++, defId: defId, type: def.type,
      x: x, y: y, r: def.bodyDiameter / 2,
      hp: def.hp, maxHp: def.hp,
      state: 'approach',
      cd: 0,                 // 공격 쿨타임 남은 시간(공격이 나간 뒤부터 셈)
      teleTime: 0,           // 예고 남은 시간
      teleDir: null,         // 예고가 뜬 순간 고정된 방향
      lastHitAt: -1,
      kbVx: 0, kbVy: 0, kbTime: 0,   // 넉백 중 속도와 남은 시간
      dead: false
    };
  },

  update: function (s, e, h) {
    var def = s.dt.enemies[e.defId], p = s.player, geom = G.Core.geom;
    if (def.type === 'boss') { G.Core.boss.update(s, e, h); return; }
    e.cd = Math.max(0, e.cd - h);

    // 넉백: 밀려나는 동안은 스스로 움직이지 않음. 예고 중이어도 밀리고, 예고 방향은 그대로(임시)
    var knocked = false;
    if (e.kbTime > 0) {
      var kt = Math.min(h, e.kbTime);
      e.x += e.kbVx * kt; e.y += e.kbVy * kt;
      e.kbTime -= h; knocked = true;
    }

    if (e.state === 'telegraph') {
      e.teleTime -= h;
      if (e.teleTime <= 0) {
        if (def.type === 'melee') G.Core.enemy.meleeStrike(s, e, def);
        else G.Core.enemy.fire(s, e, def);
        e.cd = def.cooldown;
        e.state = 'idle';
      }
      return;                // 예고 중에는 움직이지 않는다
    }
    if (knocked) return;

    var d = geom.dist(e.x, e.y, p.x, p.y);
    var toP = geom.norm(p.x - e.x, p.y - e.y);

    if (def.type === 'melee') {
      var inRange = d <= def.attackRange + p.r;    // 부채꼴이 플레이어 몸에 닿는 거리
      if (!inRange) e.state = 'approach';
      else if (e.cd <= 0) G.Core.enemy.startTelegraph(s, e, def, toP);
      else e.state = 'idle';
    } else {
      if (d > def.attackRange) e.state = 'approach';
      else if (e.cd <= 0) G.Core.enemy.startTelegraph(s, e, def, toP);
      else if (d <= def.alertRange) e.state = 'retreat';   // 벽에 막히면 그 자리에 있는다
      else e.state = 'idle';
    }

    if (e.state === 'approach') { e.x += toP.x * def.moveSpeed * h; e.y += toP.y * def.moveSpeed * h; }
    else if (e.state === 'retreat') { e.x -= toP.x * def.moveSpeed * h; e.y -= toP.y * def.moveSpeed * h; }
  },

  startTelegraph: function (s, e, def, dir) {
    e.state = 'telegraph';
    e.teleTime = def.telegraph;
    e.teleDir = { x: dir.x, y: dir.y };
    if (e.teleDir.x === 0 && e.teleDir.y === 0) e.teleDir = { x: 1, y: 0 };
    G.Core.emit(s, 'telegraph', { uid: e.uid, defId: e.defId });
  },

  meleeStrike: function (s, e, def) {
    var p = s.player;
    var hit = G.Core.geom.circleInFan(e.x, e.y, e.teleDir, def.attackRange, def.attackAngle, p.x, p.y, p.r);
    G.Core.emit(s, 'enemySwing', { x: e.x, y: e.y, dir: e.teleDir, range: def.attackRange, angle: def.attackAngle });
    if (hit) G.Core.player.takeDamage(s, def.damage, e.defId, G.Core.enemy.awayDir(e, p), undefined, 'melee');
  },

  fire: function (s, e, def) {
    s.projectiles.push({
      x: e.x, y: e.y,
      vx: e.teleDir.x * def.projectileSpeed, vy: e.teleDir.y * def.projectileSpeed,
      r: def.projectileDiameter / 2, damage: def.damage, source: e.defId,
      owner: e.uid           // 쏜 적(봇이 어느 예고에서 나온 탄인지 알아보려고. 규칙엔 안 씀)
    });
  },

  // 적 중심에서 플레이어 쪽(= 플레이어가 밀려날 방향)
  awayDir: function (e, p) {
    var d = G.Core.geom.norm(p.x - e.x, p.y - e.y);
    return (d.x === 0 && d.y === 0) ? { x: 0, y: 1 } : d;
  },

  knockback: function (e, dir, dist, time) {
    e.kbVx = dir.x * dist / time; e.kbVy = dir.y * dist / time; e.kbTime = time;
  },

  takeDamage: function (s, e, dmg, crit, dir) {
    e.hp -= dmg;
    if (e.type === 'boss') G.Core.boss.onDamage(s, e, dmg);
    e.lastHitAt = s.time;
    s.stats.damageDealt += dmg;
    G.Core.emit(s, 'enemyHit', { uid: e.uid, dmg: dmg, crit: crit, x: e.x, y: e.y, r: e.r, dir: dir || null });
    if (e.hp <= 0) {
      e.dead = true;
      s.stats.kills++;
      G.Core.emit(s, 'enemyDie', { uid: e.uid, defId: e.defId, x: e.x, y: e.y });
    }
  },

  // 투사체: 벽에 닿으면 사라짐. 플레이어에 닿으면 맞고 사라짐.
  // 무적(대시·피격 직후) 중이면 그대로 지나감 → 임시 규칙
  updateProjectiles: function (s, h) {
    var p = s.player, W = s.map.width, H = s.map.height, keep = [];
    for (var i = 0; i < s.projectiles.length; i++) {
      var b = s.projectiles[i];
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.x < b.r || b.y < b.r || b.x > W - b.r || b.y > H - b.r) continue;
      if (G.Core.geom.circlesOverlap(b.x, b.y, b.r, p.x, p.y, p.r) && !G.Core.player.isInvulnerable(p)) {
        G.Core.player.takeDamage(s, b.damage, b.source, G.Core.geom.norm(b.vx, b.vy), undefined, 'ranged');
        continue;
      }
      keep.push(b);
    }
    s.projectiles = keep;
  }
};
