// 한 판의 상태와 진행. 화면 코드 없이 이 폴더만으로 돌아가야 한다(시뮬용).
// 사용: s = G.Core.game.create(G.DT, seed) → 매 틱 G.Core.game.step(s, input)
// 화면 단계(phase): combat / card / floor / dead
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.emit = function (s, type, data) {
  var ev = { t: Math.round(s.time * 1000) / 1000, type: type, floor: s.floor, wave: s.wave };
  for (var k in data) ev[k] = data[k];
  s.events.push(ev);     // 화면이 가져가서 그림
  s.log.push(ev);        // 기록용(나중에 로그 파트 형식에 맞춤)
};

G.Core.game = {
  // opts.startWave: 테스트용. 1층의 이 웨이브부터 시작(주소 ?wave=5 → 바로 보스)
  create: function (dt, seed, opts) {
    var s = {
      dt: dt, seed: seed >>> 0, rng: G.Core.createRng(seed),
      h: 1 / dt.common.tickRate, tick: 0, time: 0,
      floor: 1, wave: 1, infinite: false,
      phase: 'combat',
      player: G.Core.player.create(dt),
      enemies: [], projectiles: [], nextUid: 1,
      map: null, waveData: null, batchIndex: 0, batchTimer: 0,
      cardOffer: null, picks: [], pickedOnce: {}, hasSkill: false,
      stats: { kills: 0, damageDealt: 0, damageTaken: 0 },
      events: [], log: [], result: null
    };
    G.Core.emit(s, 'runStart', { seed: s.seed });
    G.Core.game.enterFloor(s);
    if (opts && opts.startWave > 1) { s.enemies = []; s.wave = opts.startWave; G.Core.wave.start(s); }
    return s;
  },

  enterFloor: function (s) {
    var pool = s.dt.maps.pool;
    s.map = s.dt.maps.list[pool[s.rng.int(pool.length)]];
    s.player.x = s.map.width / 2; s.player.y = s.map.height / 2;   // 층마다 가운데로
    s.enemies = []; s.projectiles = [];
    s.wave = 1;
    s.phase = 'combat';
    G.Core.wave.start(s);
  },

  // input: { moveX, moveY (-1~1), attack (이번 틱에 눌렀나), dash (이번 틱에 눌렀나) }
  step: function (s, input) {
    if (s.phase !== 'combat') return;
    var h = s.h;
    s.tick++; s.time = s.tick * h;

    G.Core.player.update(s, input, h);
    for (var i = 0; i < s.enemies.length; i++) if (!s.enemies[i].dead) G.Core.enemy.update(s, s.enemies[i], h);
    s.enemies = s.enemies.filter(function (e) { return !e.dead; });
    G.Core.game.resolveBodies(s);
    G.Core.enemy.updateProjectiles(s, h);
    if (s.phase !== 'combat') return;     // 죽었으면 여기서 끝
    G.Core.wave.update(s, h);
  },

  // 몸끼리 겹치지 않게 밀어내고, 벽 안쪽으로 붙잡는다.
  // 대시 중인 플레이어는 적을 뚫고 지나가고, 끝난 자리에서 겹치면 그때부터 밀어낸다
  resolveBodies: function (s) {
    var bodies = [s.player].concat(s.enemies), W = s.map.width, H = s.map.height;
    for (var it = 0; it < 3; it++) {
      for (var i = 0; i < bodies.length; i++) {
        for (var j = i + 1; j < bodies.length; j++) {
          var a = bodies[i], b = bodies[j];
          if (i === 0 && s.player.dashTime > 0) continue;   // 대시 중에는 적과 몸이 겹쳐도 통과(유령 상태)
          // 보스는 밀리지 않음. 겹치면 상대만 다 밀려남
          var wa = a.type === 'boss' ? 0 : 1, wb = b.type === 'boss' ? 0 : 1;
          if (wa + wb === 0) continue;
          var dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          var d = Math.sqrt(d2);
          if (d === 0) { dx = 1; dy = 0; d = 1; }
          var push = (rr - d) / (wa + wb), nx = dx / d, ny = dy / d;
          a.x -= nx * push * wa; a.y -= ny * push * wa;
          b.x += nx * push * wb; b.y += ny * push * wb;
        }
      }
      for (var k = 0; k < bodies.length; k++) {
        var o = bodies[k];
        o.x = Math.max(o.r, Math.min(W - o.r, o.x));
        o.y = Math.max(o.r, Math.min(H - o.r, o.y));
      }
    }
  },

  onWaveClear: function (s) {
    s.projectiles = [];
    s.cardOffer = G.Core.cards.offer(s);
    s.phase = 'card';
    G.Core.emit(s, 'cardOffer', { offer: s.cardOffer.map(function (c) { return c.id + ':' + c.tier; }) });
  },

  chooseCard: function (s, index) {
    if (s.phase !== 'card' || !s.cardOffer[index]) return;
    var pick = s.cardOffer[index];
    G.Core.cards.apply(s, pick);
    G.Core.emit(s, 'cardPick', { id: pick.id, tier: pick.tier });
    s.cardOffer = null;
    if (s.wave >= s.dt.common.wavesPerFloor) {
      s.phase = 'floor';                 // 층 전환 화면
      G.Core.emit(s, 'floorClear', { floor: s.floor });
    } else {
      s.wave++;
      s.phase = 'combat';
      G.Core.wave.start(s);
    }
  },

  // 층 전환 화면에서 넘어갈 때. 5층 이후는 무한 모드(지금은 같은 표로 층 숫자만 오름)
  nextFloor: function (s) {
    if (s.phase !== 'floor') return;
    s.floor++;
    if (s.floor > s.dt.common.floorCount && !s.infinite) { s.infinite = true; G.Core.emit(s, 'infiniteStart', {}); }
    G.Core.game.enterFloor(s);
  },

  onDeath: function (s) {
    s.phase = 'dead';
    s.result = {
      seed: s.seed, floor: s.floor, wave: s.wave, time: s.time,
      picks: s.picks.slice(), stats: JSON.parse(JSON.stringify(s.stats))
    };
    G.Core.emit(s, 'death', { time: s.time });
  }
};
