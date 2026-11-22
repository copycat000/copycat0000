// 브라우저 쪽 연결: 키 입력 → 규칙 계산(core) → 그리기(render)
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 1280, H = 720;
  canvas.width = W; canvas.height = H;

  var screen = 'start';
  var paused = false;        // 일시정지(P 또는 Esc). 전투 중에만      // start / play
  var s = null, cardSel = 0;
  var effects = [];          // 공격 부채꼴처럼 잠깐 보이는 그림(규칙과 무관)
  var EFFECT_LIFE = { skillClear: 0.35, skillHeal: 0.6, swing: 0.14, enemySwing: 0.15, damageNumber: 0.6, deathPuff: 0.25, hitSpark: 0.2, breakBurst: 0.45, wallDust: 0.35 };
  // 보스 파훼 순간: 평타 히트스톱(H)과 상관없이 항상 멈춤(11/20 타디온: 보스 카운터·파훼 순간에 쓰기로). 임시값
  var BREAK_HITSTOP = 0.3,  /* 0.15에서 2배, 타디온 확정(11/20): 길게 멈춰야 해냈다는 피드백이 강함 */ SHAKE_BREAK = { time: 0.25, amp: 8 }, SHAKE_WALL = { time: 0.18, amp: 6 };
  var LOCKMOVE_ON = true;    // 밀리는 동안 조작 불가(타디온 확정 11/20). L로 켜고 끔(비교용)
  var SQUASH_TIME = 0.12;    // 맞은 적이 찌그러졌다 돌아오는 시간(초)

  // 타격 피드백(그림·시간만, 규칙 계산 결과는 그대로)
  var HITSTOP = 0.09;        // 공격이 맞으면 화면 전체가 이만큼 멈춤(초). 임시값(0.05는 체감 안 돼서 늘림)
  var HITSTOP_CRIT = 0.12;   // 치명타가 섞이면 조금 더 길게
  var SHAKE_PLAYER_HIT = { time: 0.2, amp: 7 };   // 플레이어가 맞았을 때 화면 진동
  var SHAKE_CRIT = { time: 0.1, amp: 3 };         // 치명타 때 약한 진동
  var shakeLeft = 0, shakeTime = 1, shakeAmp = 0;

  // 방향 표시 부드럽게 돌기(그림만). 공격·대시 방향(판정)은 지금처럼 바로 바뀜. T로 켜고 끔(비교용)
  var SMOOTH_FACING = true, FACING_TURN = 0.05;   // 남은 각도가 이 시간(초) 단위로 줄어듦. 임시값
  var visAngle = null;

  // 입력 미리 받기: 쿨타임이 끝나기 조금 전에 누른 공격·대시를 버리지 않고, 끝나는 순간 나가게 함
  // (전투 시간 기준이라 히트스톱 동안에도 유지). B로 켜고 끔(비교용)
  var BUFFER_ON = false, BUFFER_TIME = 0.12;  // 기본 꺼짐(11/20 타디온: 꺼진 쪽이 체감이 나음)
  var HITSTOP_ON = false;                     // 기본 꺼짐(11/20 타디온: 핵슬 느낌이라 평타엔 안 맞음, 보스 카운터·패턴 파훼 같은 순간에 쓸 예정). H로 켜고 끔
  var KNOCKBACK_ON = true;                    // K로 켜고 끔(비교용). 규칙이 바뀌는 항목
  var bufAttack = -1, bufDash = -1;
  function readButtons() {
    if (take('KeyA')) bufAttack = s.time;
    if (take('Space')) bufDash = s.time;
    var p = s.player;
    var wantA = bufAttack >= 0 && s.time - bufAttack <= (BUFFER_ON ? BUFFER_TIME : 0);
    var wantD = bufDash >= 0 && s.time - bufDash <= (BUFFER_ON ? BUFFER_TIME : 0);
    var attack = wantA && p.atkCd <= 0, dash = wantD && p.dashCd <= 0 && p.dashTime <= 0;
    if (attack || !wantA) bufAttack = -1;
    if (dash || !wantD) bufDash = -1;
    return { attack: attack, dash: dash };
  }
  function smoothFacing(p, dtReal) {
    var target = Math.atan2(p.facing.y, p.facing.x);
    if (!SMOOTH_FACING || visAngle === null) { visAngle = target; return p.facing; }
    var diff = Math.atan2(Math.sin(target - visAngle), Math.cos(target - visAngle));
    visAngle += diff * (1 - Math.exp(-dtReal / FACING_TURN));
    return { x: Math.cos(visAngle), y: Math.sin(visAngle) };
  }
  function shake(cfg) { if (cfg.amp >= shakeAmp * (shakeLeft / shakeTime) || shakeLeft <= 0) { shakeLeft = cfg.time; shakeTime = cfg.time; shakeAmp = cfg.amp; } }
  var HIT_SHAKE = 0.15;      // 맞은 적이 떨리는 시간(초)
  var hitstopLeft = 0, hitAt = {}, hitDir = {}, scanned = 0;

  // ---- 봇 다시 보기 ----
  // 주소에 #bot=skilled|mid|novice&seed=숫자(또는 ?bot=...) → 키보드 대신 봇이 입력. 대량 실행과 같은 봇·같은 계산이라 같은 판이 그대로 나옴
  // 카드·층 전환 화면은 봇이 고른 카드를 잠깐 띄워두고 넘어감(시스템 기획 6번). 띄우는 시간은 그림 쪽 임시값
  var BOT_CARD_SHOW = 1.0, BOT_FLOOR_SHOW = 1.0;
  // 주소 뒤(?) 또는 # 뒤 어느 쪽에 붙어도 읽음(아티팩트 링크에서는 ? 가 안 넘어갈 수 있어서)
  var where = location.search + '&' + location.hash.replace(/^#/, '');
  var botLevel = (/(?:^|[?&])bot=(\w+)/.exec(where) || [])[1];
  if (botLevel && !(G.DT.bots.levels || {})[botLevel]) botLevel = null;
  var seedOverride = null;
  // 화면 아래 버튼에서 부름: 봇 다시 보기 시작 / 사람이 하기로 돌아가기
  G.botReplay = function (level, seed) {
    if (!G.DT.bots.levels[level]) return;
    botLevel = level; seedOverride = seed >>> 0; newRun();
  };
  G.humanPlay = function () { botLevel = null; bot = null; seedOverride = null; screen = 'start'; s = null; };
  var slotFor = -1, slotSel = 0, botSlot, bot = null, botPick = -1, botWaitUntil = 0, botFloorAt = -1;
  function botEnd() {
    var end = G.Core.bot.checkEnd(bot, s);
    if (end) { G.Core.bot.finish(bot, s, end); console.log('[bot] ' + botLevel + ' 판 끝: ' + end); }
    return end;
  }

  // ---- 입력 ----
  var held = {}, pressed = {};
  var KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyS', 'KeyD', 'Enter', 'Digit1', 'Digit2', 'Digit3', 'Digit5', 'Space', 'KeyP', 'Escape', 'KeyT', 'KeyB', 'KeyH', 'KeyK', 'KeyL', 'KeyM'];
  window.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;   // 아래 봇 입력칸에 숫자 칠 때는 게임 키로 안 받음
    if (KEYS.indexOf(e.code) >= 0) e.preventDefault();
    if (!e.repeat) pressed[e.code] = true;     // 누르고 있어도 반복하지 않음
    held[e.code] = true;
  });
  window.addEventListener('keyup', function (e) { held[e.code] = false; });
  window.addEventListener('blur', function () { held = {}; if (screen === 'play' && s && s.phase === 'combat') paused = true; });   // 창을 벗어나면 자동 일시정지
  function take(code) { var v = !!pressed[code]; pressed[code] = false; return v; }

  // 대각선 유지: 대각선으로 가다가 두 키 중 하나를 먼저 떼도 FACE_GRACE초 안이면
  // 바라보는 방향은 대각선으로 둔다. 이동 자체는 실제 누른 키 그대로.
  var FACE_GRACE = 0.08, lastDiag = null, lastDiagAt = -1;
  function faceGrace(mx, my, t) {
    if (mx !== 0 && my !== 0) { lastDiag = { x: mx, y: my }; lastDiagAt = t; return lastDiag; }
    if (lastDiag && t - lastDiagAt <= FACE_GRACE && (mx === 0 || mx === lastDiag.x) && (my === 0 || my === lastDiag.y)) {
      return lastDiag;               // 아직 대각선에서 손을 떼는 중
    }
    return { x: mx, y: my };
  }

  // ---- 판 시작 ----
  function seedFromUrl() {
    if (seedOverride !== null) return seedOverride;
    var m = /(?:^|[?&])seed=(\d+)/.exec(location.search + '&' + location.hash.replace(/^#/, ''));
    return m ? parseInt(m[1], 10) >>> 0 : Math.floor(Math.random() * 4294967296) >>> 0;
  }
  function newRun(startWave) {
    var seed = seedFromUrl();
    var wm = /[?&]wave=(\d+)/.exec(location.search);     // 테스트용: ?wave=5 또는 시작 화면에서 5 → 1층 보스 웨이브부터
    s = G.Core.game.create(G.DT, seed, { startWave: startWave || (wm ? parseInt(wm[1], 10) : 1) });
    s.W = W; s.H = H;
    effects = []; cardSel = 0; slotFor = -1; hitAt = {}; hitDir = {}; hitstopLeft = 0; scanned = 0; shakeLeft = 0; paused = false; visAngle = null; bufAttack = bufDash = -1;
    G.lastRun = s;
    bot = null;
    if (botLevel) { bot = G.Core.bot.create(s, botLevel); botPick = -1; botFloorAt = -1; G.lastBot = bot; }
    if (G.Sound) { G.Sound.unlock(); G.Sound.stopLoops(); }   // 시작할 때 소리를 처음 켬(브라우저가 입력 전 소리를 막아서). 시작 화면은 무음
    console.log('[run] seed =', seed, ' (같은 판 다시 보기: ?seed=' + seed + ')');
    screen = 'play';
  }

  // P·Esc를 누르면 일시정지를 켜고 끔. 지금 멈춰 있으면 true
  function togglePause() {
    var p = take('KeyP'), e = take('Escape');
    if (p || e) { paused = !paused; if (paused && G.Sound) G.Sound.stopLoops(); }
    return paused;
  }

  // ---- 고정 간격 루프 ----
  var acc = 0, last = performance.now(), now = 0;
  var fxNow = 0;   // 이펙트용 시계. 히트스톱·일시정지 동안 멈춰서 궤적·불꽃·숫자도 같이 멈춤
  function frame(t) {
    var real = Math.min(0.25, (t - last) / 1000); last = t; now += real;
    var frozen = screen === 'play' && s.phase === 'combat' && (paused || hitstopLeft > 0);
    if (!frozen) fxNow += real;

    if (take('KeyT')) SMOOTH_FACING = !SMOOTH_FACING;
    if (take('KeyB')) BUFFER_ON = !BUFFER_ON;
    if (take('KeyH')) HITSTOP_ON = !HITSTOP_ON;
    if (take('KeyK') && !botLevel) KNOCKBACK_ON = !KNOCKBACK_ON;   // 봇 다시 보기에선 규칙이 바뀌는 토글은 막음(대량 실행과 같은 판이어야 해서)
    if (take('KeyL') && !botLevel) LOCKMOVE_ON = !LOCKMOVE_ON;
    if (s) s.player.hitKnockback.lockMove = LOCKMOVE_ON;
    if (s) s.player.basicAttack.knockback = KNOCKBACK_ON ? G.DT.player.basicAttack.knockback : 0;   // 넉백은 규칙이라 DT 값을 켜고 끔
    if (take('KeyM') && G.Sound) G.Sound.toggle();   // M: 소리 켜기/끄기
    if (G.Sound) G.Sound.showPanel(screen === 'start');
    if (screen === 'start') {
      if (botLevel) newRun();
      else if (take('Enter')) newRun();
      else if (take('Digit5')) newRun(5);
    } else if (s.phase === 'combat' && togglePause()) {
      acc = 0; pressed.KeyA = pressed.Space = pressed.KeyS = pressed.KeyD = false;   // 멈춘 동안 누른 건 버림
    } else if (s.phase === 'combat') {
      if (hitstopLeft > 0) { hitstopLeft -= real; real = 0; }
      acc += real;
      var h = s.h;
      while (acc >= h && s.phase === 'combat') {
        var input;
        if (bot) input = G.Core.bot.think(bot, s);
        else {
        var mx = (held.ArrowRight ? 1 : 0) - (held.ArrowLeft ? 1 : 0);
        var my = (held.ArrowDown ? 1 : 0) - (held.ArrowUp ? 1 : 0);
        var face = faceGrace(mx, my, s.time);
        var btn = readButtons();
        input = {
          moveX: mx, moveY: my, faceX: face.x, faceY: face.y,
          attack: btn.attack,
          dash: btn.dash,
          skill1: take('KeyS'),   // 스킬 1칸
          skill2: take('KeyD')
        };
        }
        savePrev();
        G.Core.game.step(s, input);
        acc -= h;
        if (bot && botEnd()) break;
        for (; scanned < s.events.length; scanned++) {
          var se = s.events[scanned];
          if (se.type === 'swing' && se.hits > 0 && HITSTOP_ON) { hitstopLeft = Math.max(hitstopLeft, HITSTOP); acc = 0; }
          if (se.type === 'enemyHit' && se.crit) { if (HITSTOP_ON) hitstopLeft = Math.max(hitstopLeft, HITSTOP_CRIT); shake(SHAKE_CRIT); }
          if (se.type === 'playerHit') shake(SHAKE_PLAYER_HIT);
          if (se.type === 'bossBreak') { hitstopLeft = Math.max(hitstopLeft, BREAK_HITSTOP); acc = 0; shake(SHAKE_BREAK); }
          if (se.type === 'bossWall') shake(SHAKE_WALL);
        }
        if (hitstopLeft > 0) break;
      }
      if (s.phase !== 'combat') { acc = 0; cardSel = 0; pressed = {}; bufAttack = bufDash = -1; }
    } else if (s.phase === 'card' && bot) {
      if (botPick < 0) { botPick = G.Core.bot.pickCard(bot, s); botSlot = G.Core.bot.pickSlot(bot, s, botPick); cardSel = botPick; botWaitUntil = now + BOT_CARD_SHOW; }
      else if (now >= botWaitUntil) { G.Core.game.chooseCard(s, botPick, botSlot); botPick = -1; pressed = {}; }
    } else if (s.phase === 'floor' && bot) {
      if (!botEnd()) {
        if (botFloorAt < 0) botFloorAt = now + BOT_FLOOR_SHOW;
        else if (now >= botFloorAt) { G.Core.game.nextFloor(s); botEnd(); botFloorAt = -1; pressed = {}; }   // 층 바뀐 순간을 대량 실행과 같은 틱에 기록
      }
    } else if (s.phase === 'card') {
      if (slotFor >= 0) {          // 스킬 카드를 골랐으면 S·D 칸 고르기. Esc는 카드 고르기로 돌아감
        if (take('Escape')) slotFor = -1;
        else {
          if (take('ArrowLeft') || take('ArrowUp')) slotSel = 0;
          if (take('ArrowRight') || take('ArrowDown')) slotSel = 1;
          var slot = (take('KeyS') || take('Digit1')) ? 0 : (take('KeyD') || take('Digit2')) ? 1 : take('Enter') ? slotSel : -1;
          if (slot >= 0) { G.Core.game.chooseCard(s, slotFor, slot); slotFor = -1; pressed = {}; }
        }
      } else {
        if (take('ArrowLeft')) cardSel = (cardSel + s.cardOffer.length - 1) % s.cardOffer.length;
        if (take('ArrowRight')) cardSel = (cardSel + 1) % s.cardOffer.length;
        var choice = take('Digit1') ? 0 : take('Digit2') ? 1 : take('Digit3') ? 2 : take('Enter') ? cardSel : -1;
        if (choice >= 0) {
          if (G.Core.cards.find(s, s.cardOffer[choice].id).group === 'skill') {
            slotFor = choice; cardSel = choice; slotSel = s.player.skills[0] && !s.player.skills[1] ? 1 : 0;   // 빈 칸이 있으면 빈 칸부터
            pressed = {};
          } else { G.Core.game.chooseCard(s, choice); pressed = {}; }
        }
      }
    } else if (s.phase === 'floor') {
      if (take('Enter')) { G.Core.game.nextFloor(s); pressed = {}; }
    } else if (s.phase === 'dead') {
      if (take('Enter')) newRun();
    }
    if (screen !== 'play' || s.phase !== 'combat') pressed.KeyA = pressed.Space = pressed.KeyS = pressed.KeyD = false;   // 전투 밖에서 누른 건 버림

    draw();
    requestAnimationFrame(frame);
  }

  // ---- 그리기 사이 보간 ----
  // 규칙은 1초 60번 계산하지만 모니터는 더 자주(120·144Hz) 그릴 수 있다.
  // 그대로 그리면 빠른 움직임(대시)이 끊겨 보여서, 직전 계산 위치와 지금 위치 사이를 이어서 그린다.
  // 그림에만 쓰고 규칙 계산에는 영향 없음.
  var prev = new WeakMap();
  function savePrev() {
    prev.set(s.player, { x: s.player.x, y: s.player.y });
    for (var i = 0; i < s.enemies.length; i++) prev.set(s.enemies[i], { x: s.enemies[i].x, y: s.enemies[i].y });
    for (i = 0; i < s.projectiles.length; i++) prev.set(s.projectiles[i], { x: s.projectiles[i].x, y: s.projectiles[i].y });
    for (i = 0; i < s.playerShots.length; i++) prev.set(s.playerShots[i], { x: s.playerShots[i].x, y: s.playerShots[i].y });
  }
  function lerped(o) {
    var a = prev.get(o);
    if (!a || s.phase !== 'combat') return o;
    var t = Math.max(0, Math.min(1, acc / s.h)), c = Object.create(o);
    c.x = a.x + (o.x - a.x) * t; c.y = a.y + (o.y - a.y) * t;
    return c;
  }

  // ---- 그리기 ----
  function draw() {
    var Sh = G.Shapes;
    if (screen === 'start') {
      Sh.arena(ctx, { width: W, height: H });
      G.UI.start(ctx, { W: W, H: H });
      return;
    }
    // 규칙 쪽에서 나온 이벤트 중 그림이 필요한 것만 가져감
    for (var i = 0; i < s.events.length; i++) {
      var ev = s.events[i];
      if (G.Sound) G.Sound.play(ev, s);
      if (EFFECT_LIFE[ev.type]) {
        // 맞힌 공격은 궤적이 다 그려진 순간에서 멈추도록 시작점을 당겨둠
        var born = (ev.type === 'swing' && ev.hits > 0 && HITSTOP_ON) ? fxNow - EFFECT_LIFE.swing * 0.45 : fxNow;
        effects.push({ ev: ev, born: born, life: EFFECT_LIFE[ev.type] });
      }
      if (ev.type === 'enemyHit') {
        hitAt[ev.uid] = fxNow;
        hitDir[ev.uid] = ev.dir ? Math.atan2(ev.dir.y, ev.dir.x) : 0;
        if (ev.dir) effects.push({ ev: { type: 'hitSpark', x: ev.x, y: ev.y, r: ev.r, dir: ev.dir, crit: ev.crit }, born: fxNow, life: EFFECT_LIFE.hitSpark });
        effects.push({ ev: { type: 'damageNumber', x: ev.x, y: ev.y, dmg: ev.dmg, crit: ev.crit, seed: ev.uid }, born: fxNow, life: EFFECT_LIFE.damageNumber });
      }
      if (ev.type === 'bossBreak') effects.push({ ev: { type: 'breakBurst', x: ev.x, y: ev.y }, born: fxNow, life: EFFECT_LIFE.breakBurst });
      if (ev.type === 'bossWall') effects.push({ ev: { type: 'wallDust', x: ev.x, y: ev.y }, born: fxNow, life: EFFECT_LIFE.wallDust });
      if (ev.type === 'enemyDie') effects.push({ ev: { type: 'deathPuff', x: ev.x, y: ev.y }, born: fxNow, life: EFFECT_LIFE.deathPuff });
    }
    s.events.length = 0; scanned = 0;
    if (G.Sound) G.Sound.tick(s, !paused);

    // 화면 진동: 그림 전체를 살짝 흔듦(HUD는 제외)
    var shook = shakeLeft > 0;
    if (shook) {
      shakeLeft -= (now - (draw.lastNow || now));
      var k0 = Math.max(0, shakeLeft / shakeTime) * shakeAmp;
      ctx.save(); ctx.translate((Math.random() * 2 - 1) * k0, (Math.random() * 2 - 1) * k0);
    }
    draw.lastNow = now;

    Sh.arena(ctx, s.map, s.floor);
    for (var k = 0; k < s.enemies.length; k++) {
      var e = s.enemies[k], def = s.dt.enemies[e.defId];
      if (e.state === 'telegraph') Sh.telegraph(ctx, e, def);   // 예고 중엔 멈춰 있어서 보간 불필요
      if (e.type === 'boss' && (e.state === 'slamTele' || e.state === 'chargeTele')) Sh.bossTelegraph(ctx, e, def, s.map);
    }
    if (bot) G.UI.botNotice(ctx, s, bot);
    for (k = 0; k < s.enemies.length; k++) {
      var e2 = s.enemies[k];
      var since = hitAt[e2.uid] !== undefined ? fxNow - hitAt[e2.uid] : 99;
      var shown = lerped(e2);
      if (since < HIT_SHAKE) {        // 맞은 적 떨림
        shown = Object.create(shown);
        var amp = 4 * (1 - since / HIT_SHAKE);
        shown.x += Math.sin(since * 90) * amp; shown.y += Math.cos(since * 70) * amp * 0.5;
      }
      if (since < SQUASH_TIME) {
        shown = Object.create(shown);
        shown.squash = 1 - since / SQUASH_TIME; shown.squashDir = hitDir[e2.uid] || 0;
      }
      if (shown.baseX === undefined) { shown = Object.create(shown); shown.baseX = lerped(e2).x; }   // 좌우 방향은 떨림 빼고 실제 위치로 봄
      if (e2.type === 'boss') Sh.boss(ctx, shown, s.dt.enemies[e2.defId], since < 0.06, fxNow);
      else Sh.enemy(ctx, shown, s.dt.enemies[e2.defId], since < 0.08);
    }
    for (k = 0; k < s.projectiles.length; k++) Sh.projectile(ctx, lerped(s.projectiles[k]));
    for (k = 0; k < s.playerShots.length; k++) Sh.playerShot(ctx, lerped(s.playerShots[k]));
    var pv = Object.create(lerped(s.player));
    pv.facing = smoothFacing(s.player, now - (draw.prevNow || now)); draw.prevNow = now;
    Sh.player(ctx, pv, Math.floor(now * 20) % 2 === 0);

    effects = effects.filter(function (fx) {
      var age = fxNow - fx.born; if (age > fx.life) return false;
      Sh[fx.ev.type](ctx, fx.ev, 1 - age / fx.life);
      return true;
    });

    if (shook) ctx.restore();
    G.UI.hud(ctx, s);
    if (bot) G.UI.botTag(ctx, s, bot);
    G.UI.testToggles(ctx, s, { smoothFacing: SMOOTH_FACING, buffer: BUFFER_ON, hitstop: HITSTOP_ON, knockback: KNOCKBACK_ON, lockMove: LOCKMOVE_ON });
    if (paused && s.phase === 'combat') G.UI.pause(ctx, s);
    if (s.phase === 'card') G.UI.card(ctx, s, cardSel, slotFor, slotSel);
    else if (s.phase === 'floor') G.UI.floor(ctx, s);
    else if (s.phase === 'dead') G.UI.result(ctx, s);
  }

  requestAnimationFrame(frame);
})();
