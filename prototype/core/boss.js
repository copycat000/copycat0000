// 보스 규칙(보스 1, 근접 중장형). 화면 코드 없음.
// 상태(e.state): wait(대기) / follow(따라감) / slamTele(휘두르기 예고) / chargeTele(돌진 예고)
//               / charging(돌진 중) / groggy(그로기)
// 행동 순서(보스 기획서): 첫 행동은 두 패턴 중 무작위 → 패턴 뒤 대기 → 돌진 쿨타임이 끝났으면 돌진
//   → 아니면 플레이어가 휘두르기 사용 거리 안이면 휘두르기, 밖이면 따라감 → 반복
// 보스는 항상 슈퍼아머(넉백·예고 끊김 없음). 돌진 예고 중 슈퍼아머 게이지를 다 깎으면 파훼(그로기)
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.boss = {
  init: function (s, e, def) {
    e.state = 'wait';
    e.waitTime = def.spawnWait;
    e.chargeCd = 0;
    e.firstPick = s.rng.chance(0.5) ? 'charge' : 'slam';   // 첫 행동 무작위
    e.armor = 0; e.armorMax = def.charge.armor;
    e.groggyTime = 0; e.groggyMax = 0; e.groggyKind = null;
    e.chargeLeft = 0; e.chargeHit = false;
    e.teleDir = null; e.teleTime = 0; e.teleMax = 0;
    G.Core.emit(s, 'bossSpawn', { uid: e.uid, defId: e.defId });
  },

  edgeDist: function (e, p) { return G.Core.geom.dist(e.x, e.y, p.x, p.y) - e.r - p.r; },

  update: function (s, e, h) {
    var def = s.dt.enemies[e.defId], p = s.player, B = G.Core.boss;
    if (e.state !== 'charging' && e.state !== 'chargeTele') e.chargeCd = Math.max(0, e.chargeCd - h);

    switch (e.state) {
      case 'wait':
        e.waitTime -= h;
        if (e.waitTime <= 0) B.decide(s, e, def);
        break;

      case 'follow':
        if (B.edgeDist(e, p) <= def.slam.useDist) { B.startSlam(s, e, def); break; }
        if (e.firstPick === null && e.chargeCd <= 0) { B.startCharge(s, e, def); break; }
        var to = G.Core.geom.norm(p.x - e.x, p.y - e.y);
        e.x += to.x * def.moveSpeed * h; e.y += to.y * def.moveSpeed * h;
        break;

      case 'slamTele':
        e.teleTime -= h;
        if (e.teleTime <= 0) B.slam(s, e, def);
        break;

      case 'chargeTele':
        e.teleTime -= h;
        if (e.teleTime <= 0) {
          e.state = 'charging'; e.chargeLeft = def.charge.distance; e.chargeHit = false; e.armor = 0;
          G.Core.emit(s, 'bossCharge', { uid: e.uid, x: e.x, y: e.y, dir: e.teleDir });
        }
        break;

      case 'charging':
        B.chargeStep(s, e, def, h);
        break;

      case 'groggy':
        e.groggyTime -= h;
        if (e.groggyTime <= 0) { e.groggyKind = null; B.decide(s, e, def); }   // 그로기 자체가 쉬는 시간이라 대기 없이 다음 행동(임시)
        break;
    }
  },

  decide: function (s, e, def) {
    var B = G.Core.boss;
    if (e.firstPick === 'charge') { e.firstPick = null; B.startCharge(s, e, def); return; }
    if (e.firstPick === 'slam') {            // 첫 행동이 휘두르기면 닿을 때까지 따라감(그동안 돌진 안 함)
      e.state = 'follow'; return;
    }
    if (e.chargeCd <= 0) { B.startCharge(s, e, def); return; }
    if (B.edgeDist(e, s.player) <= def.slam.useDist) B.startSlam(s, e, def);
    else e.state = 'follow';
  },

  aim: function (e, p) {
    var d = G.Core.geom.norm(p.x - e.x, p.y - e.y);
    return (d.x === 0 && d.y === 0) ? { x: 0, y: 1 } : d;
  },

  startSlam: function (s, e, def) {
    e.state = 'slamTele';
    e.teleDir = G.Core.boss.aim(e, s.player);
    e.teleTime = e.teleMax = def.slam.telegraph;
    G.Core.emit(s, 'telegraph', { uid: e.uid, defId: e.defId, pattern: 'slam' });
  },

  slam: function (s, e, def) {
    var p = s.player, sl = def.slam;
    if (e.firstPick === 'slam') e.firstPick = null;
    var hit = G.Core.geom.circleInFan(e.x, e.y, e.teleDir, sl.range + e.r, sl.angle, p.x, p.y, p.r);
    G.Core.emit(s, 'enemySwing', { x: e.x, y: e.y, dir: e.teleDir, range: sl.range + e.r - 16, angle: sl.angle, boss: true });
    if (hit) G.Core.player.takeDamage(s, sl.damage, e.defId, G.Core.boss.aim(e, p), sl.knockbackMult, 'slam');
    G.Core.boss.toWait(e, def);
  },

  startCharge: function (s, e, def) {
    e.state = 'chargeTele';
    e.teleDir = G.Core.boss.aim(e, s.player);
    e.teleTime = e.teleMax = def.charge.telegraph;
    e.armor = e.armorMax = def.charge.armor;
    G.Core.emit(s, 'telegraph', { uid: e.uid, defId: e.defId, pattern: 'charge' });
  },

  // 돌진: 정해진 거리를 다 갈 때까지 직선으로. 벽에 닿으면 멈추고 짧은 그로기
  chargeStep: function (s, e, def, h) {
    var c = def.charge, p = s.player, W = s.map.width, H = s.map.height;
    var step = Math.min(c.speed * h, e.chargeLeft);
    e.x += e.teleDir.x * step; e.y += e.teleDir.y * step; e.chargeLeft -= step;

    if (!e.chargeHit && G.Core.geom.circlesOverlap(e.x, e.y, e.r, p.x, p.y, p.r)) {
      // 공격이 온 반대쪽(보스 중심에서 플레이어 쪽)으로 2배 넉백. 한 번 돌진에 한 번만 맞음
      if (G.Core.player.takeDamage(s, c.damage, e.defId, G.Core.boss.aim(e, p), c.knockbackMult, 'charge')) e.chargeHit = true;
    }

    if (e.x <= e.r || e.y <= e.r || e.x >= W - e.r || e.y >= H - e.r) {
      e.x = Math.max(e.r, Math.min(W - e.r, e.x)); e.y = Math.max(e.r, Math.min(H - e.r, e.y));
      G.Core.emit(s, 'bossWall', { uid: e.uid, x: e.x, y: e.y });
      G.Core.boss.toGroggy(s, e, def.groggy.wall, 'wall');
      e.chargeCd = c.cooldown;
      return;
    }
    if (e.chargeLeft <= 0) { e.chargeCd = c.cooldown; G.Core.boss.toWait(e, def); }
  },

  toWait: function (e, def) { e.state = 'wait'; e.waitTime = def.waitAfter; },

  toGroggy: function (s, e, time, kind) {
    e.state = 'groggy'; e.groggyTime = e.groggyMax = time; e.groggyKind = kind;
    G.Core.emit(s, 'bossGroggy', { uid: e.uid, kind: kind, time: time });
  },

  // 맞을 때마다(체력은 enemy.takeDamage에서 깎음). 돌진 예고 중이면 슈퍼아머 게이지도 같은 피해만큼 깎임
  onDamage: function (s, e, dmg) {
    if (e.state !== 'chargeTele') return;
    e.armor -= dmg;
    if (e.armor <= 0 && e.hp > 0) {
      e.armor = 0;
      var def = s.dt.enemies[e.defId];
      e.chargeCd = def.charge.cooldown;
      G.Core.emit(s, 'bossBreak', { uid: e.uid, x: e.x, y: e.y });
      G.Core.boss.toGroggy(s, e, def.groggy.break, 'break');
    }
  }
};
