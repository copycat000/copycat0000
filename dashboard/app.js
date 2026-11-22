// 대시보드 화면. 계산은 sim.js, 검사 규칙은 rules.js, 기본 데이터는 base.js
(function () {
  var S = G.Dash.sim, RULES = G.Dash.RULES, LV = S.LEVELS;
  var LV_NAME = { skilled: '숙련', mid: '중간', novice: '초보' };
  var LV_COLOR = { skilled: 'var(--sk)', mid: 'var(--md)', novice: 'var(--nv)' };
  var KIND = [['melee', '근거리형', 'var(--h1)'], ['ranged', '원거리형', 'var(--h2)'], ['slam', '보스 휘두르기', 'var(--h3)'], ['charge', '보스 돌진', 'var(--h4)']];
  var STORE = 'nn-dashboard-conds-v1';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fx = function (v, d) { return (v === null || v === undefined || isNaN(v)) ? '–' : (+v).toFixed(d === undefined ? 1 : d); };
  var pct = function (v, d) { return fx(v * 100, d === undefined ? 0 : d) + '%'; };

  // ---- 조건 목록 ----
  // 조건 = { name, knobs, n, runs, M, checks, ms }
  var conds = [], cur = 0, waveKey = 'time', oddKey = 'time';

  function makeCond(knobs, n, runs, ms) {
    var M = S.agg(runs);
    return { knobs: knobs, n: n, runs: runs, M: M, checks: G.Dash.check(M), ms: ms };
  }
  function changed(knobs) {
    return S.KNOBS.filter(function (k) { return Math.abs(knobs[k.id] - k.doc) > 1e-9; });
  }
  function condName(c) {
    var ch = changed(c.knobs);
    if (!ch.length) return '문서 값';
    return ch.map(function (k) { return k.label + ' ' + k.doc + '→' + c.knobs[k.id] + k.unit; }).join(', ');
  }
  function badCount(c) { return c.checks.filter(function (x) { return x.state === 'bad'; }).length; }
  function testedCount(c) { return c.checks.filter(function (x) { return x.state !== 'none'; }).length; }

  function save() {
    try {
      var keep = conds.slice(1).slice(-10).map(function (c) { return { knobs: c.knobs, n: c.n, runs: c.runs, ms: c.ms }; });
      try { localStorage.setItem(STORE, JSON.stringify(keep)); }
      catch (e) { localStorage.setItem(STORE, JSON.stringify(keep.slice(-3))); }
    } catch (e) { /* 저장 안 되는 환경이면 그냥 넘어감 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE); if (!raw) return;
      JSON.parse(raw).forEach(function (c) { conds.push(makeCond(c.knobs, c.n, c.runs, c.ms)); });
    } catch (e) { }
  }

  // ---- 조정판 ----
  function buildKnobs() {
    var html = '';
    S.KNOBS.forEach(function (k) {
      html += '<div class="knob" id="k_' + k.id + '"><div class="top"><label for="kn_' + k.id + '">' + k.label + (k.unit ? ' (' + k.unit + ')' : '') + '</label>' +
        '<input type="number" id="kn_' + k.id + '" min="' + k.min + '" max="' + k.max + '" step="' + k.step + '" value="' + k.doc + '"></div>' +
        '<input type="range" id="kr_' + k.id + '" min="' + k.min + '" max="' + k.max + '" step="' + k.step + '" value="' + k.doc + '" aria-label="' + k.label + '">' +
        '<div class="doc">문서 값 ' + k.doc + k.unit + '</div></div>';
    });
    $('knobs').innerHTML = html;
    S.KNOBS.forEach(function (k) {
      var n = $('kn_' + k.id), r = $('kr_' + k.id);
      n.addEventListener('input', function () { r.value = n.value; markKnob(k); });
      r.addEventListener('input', function () { n.value = r.value; markKnob(k); });
    });
    $('nRuns').addEventListener('input', estimate);
    estimate();
  }
  function readKnobs() {
    var o = {};
    S.KNOBS.forEach(function (k) { var v = parseFloat($('kn_' + k.id).value); if (isNaN(v)) v = k.doc; o[k.id] = Math.min(k.max, Math.max(k.min, v)); });
    return o;
  }
  function setKnobs(o) {
    S.KNOBS.forEach(function (k) { $('kn_' + k.id).value = o[k.id]; $('kr_' + k.id).value = o[k.id]; markKnob(k); });
  }
  function markKnob(k) {
    var v = parseFloat($('kn_' + k.id).value);
    $('k_' + k.id).classList.toggle('changed', Math.abs(v - k.doc) > 1e-9);
  }
  function estimate() {
    var n = parseInt($('nRuns').value, 10) || 0, ms = G.Dash.lastMs || G.Dash.BASE.msPerRun || 50;
    $('nEst').textContent = '한 번에 ' + n * 3 + '판, 대략 ' + Math.round(n * 3 * ms / 1000) + '초 (판당 ' + Math.round(ms) + 'ms 기준)';
  }

  // ---- 실행: 화면이 멈추지 않게 조금씩 나눠 돌림 ----
  var running = false;
  function run() {
    if (running) return;
    var knobs = readKnobs(), n = Math.max(10, Math.min(200, parseInt($('nRuns').value, 10) || 100));
    var dt = S.makeDT(G.DT, knobs), jobs = [];
    LV.forEach(function (lv) { for (var s = 1; s <= n; s++) jobs.push([lv, s]); });
    var runs = [], i = 0, t0 = performance.now();
    running = true; $('runBtn').disabled = true; $('prog').classList.remove('hidden');
    (function chunk() {
      var start = performance.now();
      while (i < jobs.length && performance.now() - start < 40) { runs.push(S.runOne(dt, jobs[i][1], jobs[i][0])); i++; }
      $('prog').firstChild.style.width = (i / jobs.length * 100) + '%';
      $('progTxt').textContent = i + ' / ' + jobs.length + '판';
      if (i < jobs.length) { setTimeout(chunk, 0); return; }
      var ms = (performance.now() - t0) / jobs.length;
      G.Dash.lastMs = ms; estimate();
      conds.push(makeCond(knobs, n, runs, ms)); cur = conds.length - 1;
      running = false; $('runBtn').disabled = false; $('prog').classList.add('hidden');
      $('progTxt').textContent = jobs.length + '판 끝 (' + Math.round(ms * jobs.length / 1000) + '초)';
      save(); render();
    })();
  }

  // ---- 그리기 ----
  function render() {
    var c = conds[cur], prev = cur > 0 ? conds[cur - 1] : null;
    var ch = changed(c.knobs);
    $('condLine').innerHTML = '지금 보는 결과: ' + (ch.length ? ch.map(function (k) { return '<b>' + k.label + ' ' + c.knobs[k.id] + k.unit + '</b> (문서 ' + k.doc + k.unit + ')'; }).join(', ') : '<b>문서 값</b>') +
      ', 실력마다 ' + c.n + '판, 시드 1~' + c.n + (c.ms ? ', 판당 계산 ' + Math.round(c.ms) + 'ms' : '') +
      (prev ? ', 흐린 표시는 바로 앞 조건(' + esc(condName(prev)) + ')' : '');
    var tag = '실력마다 ' + c.n + '판';
    ['resTag', 'hitTag', 'waveTag', 'dpsTag', 'cardTag', 'oddTag'].forEach(function (id) { $(id).textContent = tag; });
    renderCheck(c);
    renderResults(c, prev);
    renderHits(c, prev);
    renderWave(c, prev);
    renderDps(c, prev);
    renderCards(c);
    renderOdd(c);
  }

  function sevPill(x) {
    if (x.state === 'ok') return '<span class="pill ok">맞음</span>';
    if (x.state === 'none') return '<span class="pill none">범위 미정</span>';
    return '<span class="pill l' + x.level + '">어긋남 ' + ['', '조금', '많이', '크게'][x.level] + '</span>';
  }
  function rangeText(r) {
    if (!r.range) return '–';
    var lo = r.range[0], hi = r.range[1];
    var t = (lo !== null && hi !== null) ? lo + '~' + hi + r.unit : lo !== null ? lo + r.unit + ' 이상' : hi + r.unit + ' 이하';
    return t + (r.temp ? '<div class="note">임시</div>' : '');
  }

  function renderCheck(c) {
    var bad = badCount(c), tested = testedCount(c);
    $('checkTag').textContent = '규칙 ' + RULES.length + '개';
    $('bigCount').innerHTML = tested
      ? '<span class="n' + (bad ? ' bad' : '') + '">' + bad + '</span><span class="of">어긋남 / 검사 ' + tested + '</span>'
      : '<span class="of">맞음 범위가 아직 없어 검사한 규칙 없음. 잰 값은 아래에</span>';
    // 조건 목록
    var h = '<thead><tr><th>#</th><th>조건</th><th class="r">판 수</th><th class="r">어긋남</th><th>규칙별</th></tr></thead><tbody>';
    conds.forEach(function (k, i) {
      h += '<tr class="cond' + (i === cur ? ' sel' : '') + '" data-i="' + i + '" tabindex="0"><td class="mono">' + (i + 1) + '</td><td>' + esc(condName(k)) + '</td><td class="r mono">' + k.n + '</td>' +
        '<td class="r mono">' + (testedCount(k) ? badCount(k) + ' / ' + testedCount(k) : '–') + '</td><td><span class="dots">' +
        k.checks.map(function (x) { var r = RULES.filter(function (q) { return q.id === x.id; })[0]; return '<i class="' + (x.state === 'bad' ? 'l' + x.level : x.state) + '" title="' + esc(r.name) + '"></i>'; }).join('') + '</span></td></tr>';
    });
    $('condTable').innerHTML = h + '</tbody>';
    Array.prototype.forEach.call($('condTable').querySelectorAll('tr.cond'), function (tr) {
      var go = function () { cur = +tr.getAttribute('data-i'); setKnobs(conds[cur].knobs); render(); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    // 규칙별
    $('ruleTitle').textContent = (cur + 1) + '번 조건 규칙별 결과';
    var prev = cur > 0 ? conds[cur - 1] : null;
    var t = '<thead><tr><th>규칙</th><th>기획서 문장</th><th>잰 것</th><th class="r">잰 값</th><th class="r">맞음 범위</th><th>결과</th></tr></thead><tbody>';
    var order = c.checks.slice().sort(function (a, b) { return (b.state === 'bad' ? b.level : -1) - (a.state === 'bad' ? a.level : -1); });
    order.forEach(function (x) {
      var r = RULES.filter(function (q) { return q.id === x.id; })[0];
      var pv = prev ? prev.checks.filter(function (q) { return q.id === x.id; })[0] : null;
      t += '<tr class="' + (x.state === 'bad' ? 'bad' : '') + '"><td><b>' + esc(r.name) + '</b><div class="note">' + esc(r.src) + '</div></td><td>"' + esc(r.sentence) + '"</td><td class="note">' + esc(r.measure) + '</td>' +
        '<td class="r mono">' + fx(x.v) + r.unit + (pv ? '<div class="note">앞 조건 ' + fx(pv.v) + r.unit + '</div>' : '') + '</td><td class="r mono">' + rangeText(r) + '</td><td>' + sevPill(x) + (x.few ? '<div class="note">판 수가 적어 우연일 수 있음</div>' : '') + '</td></tr>';
    });
    $('ruleTable').innerHTML = t + '</tbody>';
    $('ruleNote').textContent = (RULES.some(function (r) { return r.temp; }) ? '"임시"가 붙은 맞음 범위는 기획서 문장을 숫자로 옮겨 본 임시값. 확정되면 바뀜. ' : '') + '어긋난 정도: 맞음 범위 끝에서 벗어난 양 ÷ 범위 끝 값. 10% 미만 조금, 50% 미만 많이, 그 이상 크게. 검사로는 맞음, 어긋남과 벗어난 정도까지만 확인. 원인은 값을 하나씩 바꿔 다시 돌려서 좁힘';
  }

  function renderResults(c, prev) {
    var h = '';
    LV.forEach(function (lv) {
      var m = c.M[lv], p = prev ? prev.M[lv] : null;
      var seg = function (mm) { return [['clear', 'var(--clear)'], ['death', 'var(--death)'], ['timeout', 'var(--timeout)']].map(function (o) { return [mm[o[0]] / mm.n, o[1]]; }); };
      var bar = seg(m).map(function (s) { return '<div style="width:' + s[0] * 100 + '%;background:' + s[1] + '">' + (s[0] >= 0.08 ? pct(s[0]) : '') + '</div>'; }).join('');
      var gh = p ? '<div class="ghostline">' + seg(p).map(function (s) { return '<div style="width:' + s[0] * 100 + '%;background:' + s[1] + '"></div>'; }).join('') + '</div>' : '';
      var num = function (lab, v, pv, d) { return '<span>' + lab + ' <b>' + fx(v, d) + '</b>' + (pv !== undefined && pv !== null ? ' <s>(' + fx(pv, d) + ')</s>' : '') + '</span>'; };
      h += '<div class="brow"><b>' + LV_NAME[lv] + '</b><div><div class="stack" title="클리어 ' + m.clear + ', 사망 ' + m.death + ', 시간 초과 ' + m.timeout + '">' + bar + '</div>' + gh + '</div>' +
        '<div class="nums">' + num('도달 층', m.avgFloor, p && p.avgFloor, 2) + num('받은 피해', m.avgTaken, p && p.avgTaken) + num('전투 시간', m.avgTime, p && p.avgTime, 0) + '<span>초</span></div></div>';
    });
    $('resBars').innerHTML = h + '<p class="note">괄호 안은 바로 앞 조건. 받은 피해와 전투 시간은 판당 평균</p>';
  }

  function renderHits(c, prev) {
    var max = 0;
    LV.forEach(function (lv) { var t = 0; KIND.forEach(function (k) { t += c.M[lv].hitBy[k[0]]; }); max = Math.max(max, t); if (prev) { var u = 0; KIND.forEach(function (k) { u += prev.M[lv].hitBy[k[0]]; }); max = Math.max(max, u); } });
    var h = '';
    LV.forEach(function (lv) {
      var m = c.M[lv], p = prev ? prev.M[lv] : null;
      var bar = KIND.map(function (k) { var v = m.hitBy[k[0]]; return '<div style="width:' + (max ? v / max * 100 : 0) + '%;background:' + k[2] + '" title="' + k[1] + ' 판당 ' + fx(v) + '"></div>'; }).join('');
      var gh = p ? '<div class="ghostline">' + KIND.map(function (k) { return '<div style="width:' + (max ? p.hitBy[k[0]] / max * 100 : 0) + '%;background:' + k[2] + '"></div>'; }).join('') + '</div>' : '';
      var rate = function (k, lab) { return '<span>' + lab + ' <b>' + pct(m.hitRate[k], 1) + '</b>' + (p ? ' <s>(' + pct(p.hitRate[k], 1) + ')</s>' : '') + '</span>'; };
      h += '<div class="brow"><b>' + LV_NAME[lv] + '</b><div><div class="hbar">' + bar + '</div>' + gh + '</div><div class="nums">' + rate('melee', '근거리') + rate('slam', '휘두르기') + rate('charge', '돌진') + '</div></div>';
    });
    $('hitBars').innerHTML = h + '<p class="note">막대 길이는 판당 받은 피해(가장 긴 막대 ' + fx(max) + '). 맞은 비율 = 맞은 횟수 ÷ 그 공격이 나온 횟수. 원거리형은 탄이 여러 갈래라 비율 없음</p>';
    var t = '<thead><tr><th>실력</th><th class="r">돌진 알아차림</th><th class="r">붙기로 함</th><th class="r">붙어서 깸</th><th class="r">알아차리기 전에 깨짐</th><th class="r">벽 충돌</th><th>층별 붙은 비율 (1→5층)</th></tr></thead><tbody>';
    LV.forEach(function (lv) {
      var m = c.M[lv];
      t += '<tr><td>' + LV_NAME[lv] + '</td><td class="r mono">' + m.chargeSeen + '</td><td class="r mono">' + m.chargeEngage + '</td><td class="r mono">' + m.breakEngaged + '</td><td class="r mono">' + m.breakEarly +
        ' <span class="note">(' + pct(m.breakEarly / ((m.breakEngaged + m.breakEarly) || 1)) + ')</span></td><td class="r mono">' + m.walls + '</td><td class="mono">' +
        m.floorEngage.map(function (f) { return f.rate === null ? '–' : pct(f.rate); }).join(' → ') + '</td></tr>';
    });
    $('brkTable').innerHTML = t + '</tbody>';
  }

  // 선 그래프(웨이브 25칸)
  function renderWave(c, prev) {
    var W = 760, H = 240, L = 40, R = 10, T = 12, B = 30, iw = W - L - R, ih = H - T - B;
    var x = function (i) { return L + iw * (i + 0.5) / 25; };
    var get = function (m) { return waveKey === 'time' ? m.waveTime : waveKey === 'hp' ? m.waveHp : null; };
    var max = 0, svg = '';
    var series = function (cc) { return LV.map(function (lv) { return { lv: lv, v: waveKey === 'end' ? cc.M[lv].waveDead.map(function (d, i) { return d + cc.M[lv].waveTimeout[i]; }) : get(cc.M[lv]), n: cc.M[lv].waveN }; }); };
    var cs = series(c), ps = prev ? series(prev) : null;
    [cs, ps].forEach(function (ss) { if (ss) ss.forEach(function (s) { s.v.forEach(function (v) { if (v !== null && v > max) max = v; }); }); });
    if (waveKey === 'hp') max = Math.max(max, 100);
    max = max || 1;
    var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), stepV = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (v) { return v >= raw; })[0], top = stepV * 4;
    var y = function (v) { return T + ih - ih * v / top; };
    for (var g = 0; g <= 4; g++) { var gv = top * g / 4; svg += '<line class="ax" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '"/><text x="' + (L - 4) + '" y="' + (y(gv) + 3) + '" text-anchor="end">' + Math.round(gv) + '</text>'; }
    for (var f = 0; f < 5; f++) { svg += '<text x="' + (L + iw * (f * 5 + 2.5) / 25) + '" y="' + (H - 8) + '" text-anchor="middle">' + (f + 1) + '층</text>'; if (f) svg += '<line class="ax" x1="' + (L + iw * f / 5) + '" x2="' + (L + iw * f / 5) + '" y1="' + T + '" y2="' + (T + ih) + '" stroke-dasharray="2 3"/>'; }
    for (var i = 0; i < 25; i++) if (i % 5 === 4) svg += '<text x="' + x(i) + '" y="' + (H - 18) + '" text-anchor="middle">보스</text>';
    if (waveKey === 'end') {
      var bw = iw / 25 / 4;
      cs.forEach(function (s, k) {
        s.v.forEach(function (v, i) {
          var pv = ps ? ps[k].v[i] : 0;
          if (ps && pv) svg += '<rect x="' + (x(i) - bw * 1.5 + k * bw) + '" y="' + y(pv) + '" width="' + (bw - 1) + '" height="' + (T + ih - y(pv)) + '" fill="none" stroke="var(--ghost)" stroke-dasharray="2 2"/>';
          if (v) svg += '<rect x="' + (x(i) - bw * 1.5 + k * bw) + '" y="' + y(v) + '" width="' + (bw - 1) + '" height="' + (T + ih - y(v)) + '" fill="' + LV_COLOR[s.lv] + '"><title>' + LV_NAME[s.lv] + ' ' + Math.floor(i / 5 + 1) + '층 ' + (i % 5 + 1) + '웨이브: ' + v + '판 (사망 ' + c.M[s.lv].waveDead[i] + ', 시간 초과 ' + c.M[s.lv].waveTimeout[i] + ')</title></rect>';
        });
      });
    } else {
      var path = function (s, ghost) {
        var d = '', on = false;
        s.v.forEach(function (v, i) { if (v === null || s.n[i] < 5) { on = false; return; } d += (on ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); on = true; });
        return '<path d="' + d + '" fill="none" stroke="' + (ghost ? 'var(--ghost)' : LV_COLOR[s.lv]) + '" stroke-width="' + (ghost ? 1.5 : 2) + '"' + (ghost ? ' stroke-dasharray="4 3"' : '') + '/>';
      };
      if (ps) ps.forEach(function (s) { svg += path(s, true); });
      cs.forEach(function (s) {
        svg += path(s, false);
        s.v.forEach(function (v, i) { if (v === null || s.n[i] < 5) return; svg += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.5" fill="' + LV_COLOR[s.lv] + '"><title>' + LV_NAME[s.lv] + ' ' + Math.floor(i / 5 + 1) + '층 ' + (i % 5 + 1) + '웨이브: ' + fx(v) + (waveKey === 'time' ? '초' : '') + ' (' + s.n[i] + '판)</title></circle>'; });
      });
    }
    $('waveChart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="웨이브별 그래프">' + svg + '</svg>';
    $('waveLegend').innerHTML = LV.map(function (lv) { return '<span><i style="background:' + LV_COLOR[lv] + '"></i>' + LV_NAME[lv] + '</span>'; }).join('') + (prev ? '<span><i class="ghost"></i>바로 앞 조건</span>' : '');
    $('waveNote').textContent = waveKey === 'time' ? '웨이브를 끝낸 판만 평균. 그 웨이브까지 간 판이 5판 미만이면 표시 안 함. 점에 올리면 판 수 표시'
      : waveKey === 'hp' ? '웨이브를 끝냈을 때 남은 체력 평균(최대 체력 100, 카드로 늘 수 있음). 웨이브 사이 회복 없음'
      : '판이 끝난 웨이브. 사망과 시간 초과를 합친 판 수. 막대에 올리면 나눠서 표시';
  }

  function renderDps(c, prev) {
    var p0 = G.DT.player, ba = p0.basicAttack, dtDps = p0.attack * ba.damageMult / ba.cooldown;
    var max = dtDps * 1.4;
    LV.forEach(function (lv) { max = Math.max(max, c.M[lv].dps * 1.1); });
    var h = '';
    LV.forEach(function (lv) {
      var m = c.M[lv], p = prev ? prev.M[lv] : null;
      h += '<div class="brow"><b>' + LV_NAME[lv] + '</b><div class="meter"><div class="fill" style="width:' + (m.dps / max * 100) + '%;background:' + LV_COLOR[lv] + '"></div>' +
        '<div class="mark" style="left:' + (dtDps / max * 100) + '%" title="DT 계산값 ' + fx(dtDps) + '"></div>' + (p ? '<div class="gm" style="left:' + (p.dps / max * 100) + '%" title="앞 조건 ' + fx(p.dps) + '"></div>' : '') + '</div>' +
        '<div class="nums"><span>초당 피해 <b>' + fx(m.dps) + '</b> / ' + fx(dtDps) + ' (' + pct(m.dps / dtDps) + ')</span><span>헛스윙 <b>' + pct(m.whiff, 1) + '</b></span></div></div>';
    });
    $('dpsBars').innerHTML = h + '<p class="note">검은 세로선 = DT 계산값 ' + fx(dtDps) + '. 실제 초당 피해 = 판 전체에 준 피해 ÷ 전투 시간(카드, 치명타 포함). 헛스윙 = 아무도 안 맞은 평타 ÷ 전체 평타.' + (prev ? ' 회색 선은 바로 앞 조건.' : '') + '</p>';
  }

  function renderCards(c) {
    var list = G.DT.cards.list;   // 스킬이 생겨서 스킬 쿨감(C008)도 나옴(11/22)
    var h = '';
    LV.forEach(function (lv) {
      var a = c.runs.filter(function (r) { return r.level === lv; });
      var rows = list.map(function (k) {
        var yes = a.filter(function (r) { return r.picks4.some(function (p) { return p.split(':')[0] === k.id; }); });
        var no = a.filter(function (r) { return yes.indexOf(r) < 0; });
        var cr = function (arr) { return arr.length ? arr.filter(function (r) { return r.outcome === 'clear'; }).length / arr.length : NaN; };
        var p1 = cr(yes), p2 = cr(no), d = p1 - p2;
        // 판 수에 비해 차이가 작으면(두 비율 차이가 표준오차 2배 안쪽) 흐리게. 숫자로는 안 보여줌
        var pp = cr(a), se = Math.sqrt(pp * (1 - pp) * (1 / Math.max(1, yes.length) + 1 / Math.max(1, no.length)));
        return { k: k, d: d, n: yes.length, weak: isNaN(d) || Math.abs(d) < 2 * se || yes.length < 10 };
      });
      var mx = 0.3; rows.forEach(function (r) { if (!isNaN(r.d)) mx = Math.max(mx, Math.abs(r.d)); });
      h += '<div class="ccol"><h3>' + LV_NAME[lv] + '</h3>' + rows.map(function (r) {
        var w = isNaN(r.d) ? 0 : Math.abs(r.d) / mx * 50, left = r.d >= 0 ? 50 : 50 - w;
        return '<div class="crow' + (r.weak ? ' weak' : '') + '" title="' + esc(r.k.label) + ': 고른 판 ' + r.n + '판"><span>' + esc(r.k.label) + '</span><div class="cbar"><div class="mid"></div><div class="b" style="left:' + left + '%;width:' + w + '%;background:' + (r.d >= 0 ? 'var(--clear)' : 'var(--death)') + '"></div></div><span class="d">' + (isNaN(r.d) ? '–' : (r.d >= 0 ? '+' : '') + Math.round(r.d * 100) + '%p') + '</span></div>';
      }).join('') + '</div>';
    });
    $('cardGrid').innerHTML = h;
  }

  function renderOdd(c) {
    var W = 760, rowH = 46, L = 48, R = 16, T = 8, H = T + rowH * 3 + 22, iw = W - L - R;
    var val = function (r) { return oddKey === 'time' ? r.time : oddKey === 'maxHit' ? r.maxHit : r.taken; };
    var max = 0; c.runs.forEach(function (r) { max = Math.max(max, val(r)); }); max = max || 1;
    var x = function (v) { return L + iw * v / max; };
    var svg = '', odd = [];
    var q = function (arr, p) { var i = (arr.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return arr[lo] + (arr[hi] - arr[lo]) * (i - lo); };
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; svg += '<line class="ax" x1="' + x(gv) + '" x2="' + x(gv) + '" y1="' + T + '" y2="' + (T + rowH * 3) + '"/><text x="' + x(gv) + '" y="' + (H - 6) + '" text-anchor="middle">' + Math.round(gv) + (oddKey === 'time' ? '초' : '') + '</text>'; }
    LV.forEach(function (lv, k) {
      var a = c.runs.filter(function (r) { return r.level === lv; });
      var v = a.map(val).sort(function (p, q2) { return p - q2; });
      var q1 = q(v, 0.25), q2 = q(v, 0.5), q3 = q(v, 0.75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      var wl = v.filter(function (t) { return t >= lo; })[0], wh = v.filter(function (t) { return t <= hi; }).pop();
      var cy = T + rowH * k + rowH / 2, col = LV_COLOR[lv];
      svg += '<text x="4" y="' + (cy + 3) + '">' + LV_NAME[lv] + '</text>';
      svg += '<line x1="' + x(wl) + '" x2="' + x(wh) + '" y1="' + cy + '" y2="' + cy + '" stroke="' + col + '"/>';
      svg += '<rect x="' + x(q1) + '" y="' + (cy - 9) + '" width="' + Math.max(1, x(q3) - x(q1)) + '" height="18" fill="color-mix(in srgb,' + col + ' 20%,transparent)" stroke="' + col + '"/>';
      svg += '<line x1="' + x(q2) + '" x2="' + x(q2) + '" y1="' + (cy - 9) + '" y2="' + (cy + 9) + '" stroke="' + col + '" stroke-width="2"/>';
      a.forEach(function (r) {
        var t = val(r), out = t < lo || t > hi, to = r.outcome === 'timeout';
        if (!out && !to) return;
        odd.push({ r: r, v: t, out: out, to: to });
        svg += '<a href="' + replayUrl(c, r) + '" target="_blank"><circle cx="' + x(t) + '" cy="' + (cy + (to ? -14 : 14)) + '" r="3.5" fill="' + (to ? 'var(--timeout)' : col) + '"><title>' + LV_NAME[lv] + ' 시드 ' + r.seed + ': ' + fx(t) + (oddKey === 'time' ? '초' : '') + (to ? ' (시간 초과)' : '') + ', 누르면 다시 보기</title></circle></a>';
      });
    });
    $('oddChart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="실력별 상자 그림">' + svg + '</svg>' +
      '<p class="note">상자 = 가운데 절반의 판, 굵은 선 = 가운데 값. 상자 밖으로 상자 길이의 1.5배 넘게 떨어진 판이 튀는 판. 위쪽 노란 점 = 시간 초과 판, 아래쪽 점 = 튀는 판.</p>';
    var h = '';
    LV.forEach(function (lv) {
      var o = odd.filter(function (d) { return d.r.level === lv; });
      var nOut = o.filter(function (d) { return d.out; }).length, nTo = o.filter(function (d) { return d.to; }).length;
      h += '<div style="margin-top:10px"><b style="font-size:13px">' + LV_NAME[lv] + '</b> <span class="note">튀는 판 ' + nOut + ', 시간 초과 ' + nTo + '</span><div class="odd">' +
        o.slice(0, 40).map(function (d) { return '<a class="' + (d.to ? 'to' : '') + '" href="' + replayUrl(c, d.r) + '" target="_blank">시드 ' + d.r.seed + ', ' + fx(d.v, 0) + (oddKey === 'time' ? '초' : '') + (d.to ? ' 시간 초과' : '') + '</a>'; }).join('') +
        (o.length > 40 ? '<span class="note">외 ' + (o.length - 40) + '판</span>' : '') + '</div></div>';
    });
    $('oddList').innerHTML = h;
  }

  function replayUrl(c, r) {
    var q = 'bot=' + r.level + '&seed=' + r.seed;
    S.KNOBS.forEach(function (k) { q += '&' + k.id + '=' + c.knobs[k.id]; });
    return 'replay.html?' + q;
  }

  // ---- 파일 ----
  function download() {
    var data = { made: new Date().toISOString(), conds: conds.slice(1).map(function (c) { return { knobs: c.knobs, n: c.n, runs: c.runs, ms: c.ms }; }) };
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'dashboard-conditions.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function upload(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        (d.conds || []).forEach(function (c) { conds.push(makeCond(c.knobs, c.n, c.runs, c.ms)); });
        cur = conds.length - 1; save(); render();
        $('progTxt').textContent = (d.conds || []).length + '개 조건 불러옴';
      } catch (e) { $('progTxt').textContent = '불러오기 실패: 이 대시보드에서 받은 파일인지 확인'; }
    };
    fr.readAsText(file);
  }

  // ---- 시작 ----
  function init() {
    buildKnobs();
    var B = G.Dash.BASE;
    conds.push(makeCond(B.knobs, B.n, B.runs, B.msPerRun));
    load();
    cur = conds.length - 1;
    setKnobs(conds[cur].knobs);
    $('runBtn').addEventListener('click', run);
    $('resetBtn').addEventListener('click', function () { setKnobs(S.docKnobs()); });
    $('saveBtn').addEventListener('click', download);
    $('loadFile').addEventListener('change', function (e) { if (e.target.files[0]) upload(e.target.files[0]); e.target.value = ''; });
    $('clearBtn').addEventListener('click', function () { conds = conds.slice(0, 1); cur = 0; save(); setKnobs(conds[0].knobs); render(); });
    var tabs = function (id, set) {
      Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call($(id).querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          set(b.getAttribute('data-k')); render();
        });
      });
    };
    tabs('waveTabs', function (k) { waveKey = k; });
    tabs('oddTabs', function (k) { oddKey = k; });
    render();
  }
  init();
})();
