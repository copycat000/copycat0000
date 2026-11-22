// 웨이브 진행: 한 웨이브 = 3묶음. 앞 묶음을 다 잡거나 간격 시간이 지나면 다음 묶음.
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.wave = {
  start: function (s) {
    var set = s.dt.maps.waveSets[s.map.waveSet];
    var idx = Math.min(s.wave, set.length) - 1;
    s.waveData = set[idx];
    s.batchIndex = -1;
    s.batchTimer = 0;
    s.waveStartTime = s.time;
    G.Core.wave.spawnNext(s);
    G.Core.emit(s, 'waveStart', { floor: s.floor, wave: s.wave, map: s.map.id });
  },

  aliveCount: function (s) {
    var n = 0;
    for (var i = 0; i < s.enemies.length; i++) if (!s.enemies[i].dead) n++;
    return n;
  },

  spawnNext: function (s) {
    s.batchIndex++;
    s.batchTimer = s.dt.common.batchInterval;
    var batch = s.waveData[s.batchIndex];
    var ids = Object.keys(batch).sort();          // 순서 고정(재현용)
    for (var i = 0; i < ids.length; i++) {
      for (var k = 0; k < batch[ids[i]]; k++) {
        var edef = s.dt.enemies[ids[i]];
        var pos = (edef.type === 'boss' && s.map.bossSpawn) ? { x: s.map.bossSpawn.x, y: s.map.bossSpawn.y }   // 보스는 정해진 자리(12시)
          : G.Core.wave.spawnPos(s, edef.bodyDiameter / 2);
        var ne = G.Core.enemy.create(s, ids[i], pos.x, pos.y);
        if (edef.type === 'boss') G.Core.boss.init(s, ne, edef);
        s.enemies.push(ne);
      }
    }
    G.Core.emit(s, 'batch', { index: s.batchIndex + 1 });
  },

  // 방 가장자리를 따라 무작위 위치. 플레이어와 최소 거리 안쪽은 피함
  spawnPos: function (s, r) {
    var W = s.map.width, H = s.map.height, p = s.player, best = null, bestD = -1;
    var per = 2 * (W - 2 * r) + 2 * (H - 2 * r);
    for (var t = 0; t < 30; t++) {
      var u = s.rng.next() * per, x, y;
      var w = W - 2 * r, hh = H - 2 * r;
      if (u < w) { x = r + u; y = r; }
      else if (u < w + hh) { x = W - r; y = r + (u - w); }
      else if (u < 2 * w + hh) { x = W - r - (u - w - hh); y = H - r; }
      else { x = r; y = H - r - (u - 2 * w - hh); }
      var d = G.Core.geom.dist(x, y, p.x, p.y);
      if (d >= s.map.spawnMinDist) return { x: x, y: y };
      if (d > bestD) { bestD = d; best = { x: x, y: y }; }
    }
    return best;
  },

  update: function (s, h) {
    var last = s.batchIndex >= s.waveData.length - 1;   // 보스 웨이브는 묶음 하나
    var alive = G.Core.wave.aliveCount(s);
    if (!last) {
      s.batchTimer -= h;
      if (s.batchTimer <= 0 || alive === 0) G.Core.wave.spawnNext(s);
    } else if (alive === 0) {
      G.Core.emit(s, 'waveClear', { floor: s.floor, wave: s.wave, time: s.time - s.waveStartTime });
      G.Core.game.onWaveClear(s);
    }
  }
};
