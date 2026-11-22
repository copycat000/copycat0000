// 소리: 파일 없이 Web Audio로 코드에서 만듦. 규칙(core)은 소리를 모르고, main.js가 사건을 보고 부른다.
// 어떤 소리를 낼지는 콘셉트 기획서 '소리' 표를 따름. 켜기/끄기·볼륨은 시스템 기획 '소리 설정'.
// 브라우저는 사용자 입력 전엔 소리를 막아서, 시작(Enter·버튼)할 때 unlock()으로 처음 켬. 시작 화면은 무음.
var G = globalThis.G = globalThis.G || {};

G.Sound = (function () {
  var DT = G.DT.sound, KEY_ON = 'sinkingSwamp.soundOn', KEY_VOL = 'sinkingSwamp.volume';
  var on = DT.defaultOn, vol = DT.defaultVolume;
  // 저장된 값 불러오기. 저장이 막힌 환경이면 기본값 그대로
  try {
    var so = localStorage.getItem(KEY_ON), sv = localStorage.getItem(KEY_VOL);
    if (so !== null) on = so === '1';
    if (sv !== null && !isNaN(parseFloat(sv))) vol = Math.max(0, Math.min(1, parseFloat(sv)));
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY_ON, on ? '1' : '0'); localStorage.setItem(KEY_VOL, String(vol)); } catch (e) {} }

  var ac = null, master = null, noiseBuf = null;
  function applyGain() { if (master) master.gain.value = on ? vol : 0; }
  function unlock() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ac) {
      ac = new AC(); master = ac.createGain(); master.connect(ac.destination); applyGain();
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function ready() { return ac && ac.state === 'running'; }

  // 저역 필터(먹먹하게). 끝은 master로
  function out(lp) {
    if (!lp) return master;
    var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.connect(master); return f;
  }
  // 음 하나: f0에서 f1로 dur초 동안 미끄러짐. o.attack: 서서히 커지는 시간, o.lp: 저역 필터, o.delay: 늦게 시작
  function tone(type, f0, f1, dur, gain, o) {
    o = o || {};
    var t = ac.currentTime + (o.delay || 0), osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (o.attack) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + o.attack); }
    else g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out(o.lp)); osc.start(t); osc.stop(t + dur + 0.05);
    return osc;
  }
  // 잡음: 필터로 걸러서 f0→f1로 훑음
  function noise(filter, f0, f1, dur, gain, o) {
    o = o || {};
    var t = ac.currentTime + (o.delay || 0), src = ac.createBufferSource(), bq = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; bq.type = filter; bq.Q.value = o.q || 1;
    bq.frequency.setValueAtTime(f0, t); bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq); bq.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  }

  // 돌진 예고: 예고 동안 점점 높아지고 커짐. 파훼·돌진 시작·그로기·멈춤이면 끊음
  var chargeLoop = null;
  function stopCharge() {
    if (!chargeLoop) return;
    try { var t = ac.currentTime; chargeLoop.g.gain.cancelScheduledValues(t); chargeLoop.g.gain.setTargetAtTime(0.0001, t, 0.03); chargeLoop.osc.stop(t + 0.2); } catch (e) {}
    chargeLoop = null;
  }
  function startCharge(dur) {
    stopCharge();
    var t = ac.currentTime, osc = ac.createOscillator(), g = ac.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(80, t); osc.frequency.exponentialRampToValueAtTime(260, t + dur);
    g.gain.setValueAtTime(0.04, t); g.gain.linearRampToValueAtTime(0.32, t + dur);
    osc.connect(g); g.connect(out(1400)); osc.start(t); osc.stop(t + dur + 0.1);
    chargeLoop = { osc: osc, g: g };
  }

  // 배경음: 낮게 웅웅거리는 지속음. 층이 깊을수록 조금씩 낮아짐
  var drone = null, droneFloor = 0;
  function droneFreq(f) { return 55 * Math.pow(0.95, Math.min(f, 6) - 1); }
  function startDrone(floor) {
    if (drone || !ready()) return;
    var t = ac.currentTime, g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 2);
    var o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = 'sine'; o2.type = 'triangle';
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o1.start(t); o2.start(t);
    drone = { g: g, o1: o1, o2: o2 }; droneFloor = 0; setDroneFloor(floor);
  }
  function setDroneFloor(floor) {
    if (!drone || floor === droneFloor) return;
    droneFloor = floor;
    var f = droneFreq(floor), t = ac.currentTime;
    drone.o1.frequency.setTargetAtTime(f, t, 1.5); drone.o2.frequency.setTargetAtTime(f * 1.005, t, 1.5);   // 살짝 어긋나게 해서 맥놀이
  }
  function stopDrone(fade) {
    if (!drone) return;
    var t = ac.currentTime, d = drone; drone = null;
    d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(0.0001, t, fade || 0.3);
    d.o1.stop(t + (fade || 0.3) * 5); d.o2.stop(t + (fade || 0.3) * 5);
  }

  // 같은 소리가 아주 짧은 간격 안에 여러 번 오면 한 번만(적 여러 마리가 동시에 맞거나 예고할 때)
  var GAP = 0.05, lastAt = {};
  function throttled(key) { var t = ac.currentTime; if (lastAt[key] !== undefined && t - lastAt[key] < GAP) return true; lastAt[key] = t; return false; }

  // 콘셉트 기획서 '소리' 표 그대로. 크기는 들리는 순서(예고 > 플레이어 피격 > 공격·적 피격 > 나머지)에 맞춤
  var SFX = {
    swing: function () { noise('bandpass', 500, 1500, 0.07, 0.3, { q: 1.5 }); },                       // 짧게 바람 가르는 소리
    dash: function () { noise('bandpass', 350, 900, 0.1, 0.16, { q: 0.8 }); },                         // 공격보다 가벼운 휙
    enemyHit: function (ev) {                                                                           // 둔탁한 퍽. 치명타는 더 크고 날카롭게
      tone('sine', 160, 55, 0.09, 0.4); noise('lowpass', 900, 200, 0.04, 0.18);
      if (ev.crit) { tone('triangle', 520, 140, 0.11, 0.3); noise('bandpass', 2200, 900, 0.05, 0.18, { q: 2 }); }
    },
    enemyDie: function () { tone('sine', 130, 38, 0.28, 0.28); noise('lowpass', 700, 120, 0.22, 0.12); },   // 질척하게 꺼짐
    playerHit: function () {                                                                            // 거칠고 묵직하게, 적 맞는 소리보다 크게
      tone('sawtooth', 120, 45, 0.24, 0.5, { lp: 1300 }); tone('square', 70, 40, 0.18, 0.25, { lp: 600 }); noise('lowpass', 1600, 300, 0.12, 0.35);
    },
    telegraph: function (ev, s) {
      if (ev.pattern === 'charge') {                                                                    // 예고 동안 점점 높아지고 커짐
        var def = s && s.dt.enemies[ev.defId];
        startCharge(def && def.charge ? def.charge.telegraph : 2.5);
      } else if (ev.pattern === 'slam') tone('square', 200, 170, 0.4, 0.3, { lp: 1100 });              // 일반 예고보다 낮고 길게
      else tone('square', 330, 300, 0.12, 0.26, { lp: 1600 });                                         // 짧고 낮은 경고음 한 번
    },
    enemyFire: function () { tone('sine', 700, 260, 0.07, 0.14); },                                    // 작은 퓻
    bossBreak: function () {                                                                            // 크게 깨지는 소리, 가장 시원하게
      stopCharge();
      noise('lowpass', 4000, 300, 0.6, 0.55); tone('sine', 220, 45, 0.5, 0.55); tone('triangle', 700, 160, 0.3, 0.25);
    },
    bossCharge: function () { stopCharge(); },
    bossGroggy: function () { stopCharge(); },
    bossWall: function () { tone('sine', 95, 32, 0.35, 0.6); noise('lowpass', 450, 120, 0.18, 0.35); },   // 둔탁한 쿵
    cardOffer: function () { tone('sine', 110, 104, 0.45, 0.22, { attack: 0.05 }); },                   // 낮은 웅
    cardPick: function () { tone('sine', 98, 96, 0.6, 0.16, { attack: 0.12 }); tone('sine', 147, 144, 0.6, 0.12, { attack: 0.18, delay: 0.04 }); },   // 낮은 음 두 개가 겹쳐 스며듦
    waveClear: function () { [131, 165, 196].forEach(function (f) { tone('sine', f, f, 0.5, 0.1, { attack: 0.02 }); }); },   // 짧고 낮은 화음
    floorClear: function () { tone('sine', 196, 98, 1.3, 0.16, { attack: 0.05 }); tone('sine', 147, 73, 1.3, 0.12, { attack: 0.05 }); },   // 아래로 내려가는 음
    infiniteStart: function () { tone('sine', 55, 48, 1.6, 0.3, { attack: 0.3 }); noise('lowpass', 260, 90, 1.3, 0.16); },   // 문이 열리는 낮은 울림
    death: function () { stopCharge(); stopDrone(0.5); tone('sawtooth', 220, 40, 1.8, 0.25, { lp: 700 }); tone('sine', 110, 30, 2, 0.3); }   // 길게 가라앉음
  };

  // ---- 시작 화면 설정 칸(켜기/끄기 버튼, 볼륨 슬라이더) ----
  var panel = null, btn = null, slider = null, shown = null;
  function refreshPanel() {
    if (!btn) return;
    btn.textContent = on ? '소리 켜짐' : '소리 꺼짐';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    slider.value = Math.round(vol * 100); slider.disabled = !on;
  }
  function buildPanel() {
    panel = document.getElementById('soundBox'); if (!panel) return;
    btn = panel.querySelector('button'); slider = panel.querySelector('input');
    var game = document.getElementById('game');
    btn.addEventListener('click', function () { toggle(); btn.blur(); if (game) game.focus(); });
    slider.addEventListener('input', function () { vol = slider.value / 100; applyGain(); save(); });
    slider.addEventListener('change', function () { slider.blur(); if (game) game.focus(); });   // 다 옮기면 다시 게임 키를 받게
    refreshPanel();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel); else buildPanel();
  }

  function toggle() { on = !on; applyGain(); save(); refreshPanel(); }

  return {
    unlock: unlock,
    toggle: toggle,
    isOn: function () { return on; },
    // 규칙 쪽 사건 하나를 받아서 맞는 소리를 냄. 꺼져 있어도 돌진 예고 끊기 같은 정리는 함
    play: function (ev, s) {
      if (!ready() || !SFX[ev.type]) return;
      if (ev.type !== 'telegraph' || ev.pattern !== 'charge') { if (throttled(ev.type + (ev.pattern || '') + (ev.crit ? 'c' : ''))) return; }
      SFX[ev.type](ev, s);
    },
    // 판이 돌아가는 동안 매 그림마다 부름: 배경음 켜기와 층 따라 음 바꾸기
    tick: function (s, playing) {
      if (!ready()) return;
      if (playing && s.phase !== 'dead') { startDrone(s.floor); setDroneFloor(s.floor); }
      else stopDrone();
    },
    // 일시정지·판 다시 시작 때 이어지는 소리를 끊음
    stopLoops: function () { if (ac) { stopCharge(); } },
    // 시작 화면일 때만 설정 칸을 보임. 시작 화면은 무음
    showPanel: function (v) {
      if (v && ac) { stopCharge(); stopDrone(); }
      if (panel && v !== shown) { shown = v; panel.style.display = v ? 'flex' : 'none'; }
    }
  };
})();
