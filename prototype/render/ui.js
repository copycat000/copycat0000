// 화면 글자와 UI(HUD, 시작·카드·층 전환·결과 화면)
var G = globalThis.G = globalThis.G || {};

G.UI = (function () {
  var CARD_COLOR = { survive: '#00aeef', attack: '#ec008c', basic: '#fff200', skill: '#00ff00' };   // 인쇄 CMYK 원색에 가까운 값
  var FONT = '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';

  function text(ctx, str, x, y, size, color, align) {
    ctx.font = size + 'px ' + FONT; ctx.fillStyle = color || '#e8eaf0';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  function dim(ctx, s) { ctx.fillStyle = 'rgba(10,11,14,0.78)'; ctx.fillRect(0, 0, s.W, s.H); }

  function fmtValue(card, v) {
    if (card.unit === '%p') return '+' + Math.round(v * 100) + '%p';
    if (card.unit === '배') return '+' + v + '배';
    if (card.unit === '/초') return '+' + v + '/초';
    return '+' + v + (card.unit || '');
  }
  function isBossWave(s) {
    var d = s.waveData && s.waveData[0];
    for (var id in d) if (s.dt.enemies[id] && s.dt.enemies[id].type === 'boss') return true;
    return false;
  }
  function floorName(s, f) { var n = s.dt.common.floorNames; return (n && n[f - 1]) || s.dt.common.infiniteFloorName || ''; }
  function effectText(c, v) { return c.group === 'skill' ? c.desc : c.label + ' ' + fmtValue(c, v); }   // 예: 최대 체력 +10
  function fmtTime(t) { var m = Math.floor(t / 60), sec = Math.floor(t % 60); return m + '분 ' + (sec < 10 ? '0' : '') + sec + '초'; }

  return {
    fmtValue: fmtValue,

    hud: function (ctx, s) {
      var p = s.player;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(16, 16, 260, 22);
      ctx.fillStyle = '#e5534b'; ctx.fillRect(16, 16, 260 * Math.max(0, p.hp / p.maxHp), 22);
      text(ctx, '체력 ' + Math.ceil(p.hp) + ' / ' + p.maxHp, 24, 27, 14);

      // 대시 쿨타임
      var ready = p.dashCd <= 0;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(16, 46, 120, 14);
      ctx.fillStyle = ready ? '#4da3ff' : '#2b4a6b';
      ctx.fillRect(16, 46, 120 * (1 - p.dashCd / p.dash.cooldown), 14);
      text(ctx, ready ? '대시 (Space)' : '대시 ' + p.dashCd.toFixed(1), 22, 53, 12);

      // 스킬 2칸: 칸 안에 키, 아래에 스킬 이름. 쿨타임 중이면 남은 만큼 어둡게 덮고 남은 초
      for (var i = 0; i < 2; i++) {
        var sk = p.skills && p.skills[i], bx = 146 + i * 64, sdef = sk && s.dt.skills.list[sk.id];
        ctx.fillStyle = sk ? 'rgba(0,255,0,0.18)' : 'rgba(0,0,0,0.3)'; ctx.fillRect(bx, 44, 58, 28);
        if (sk && sk.cd > 0) {
          var full = G.Core.skills.cooldown(s, sdef);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, 44, 58, 28 * Math.min(1, sk.cd / full));
        }
        ctx.strokeStyle = sk ? (sk.cd > 0 ? '#3f7a4a' : '#6eff8c') : '#4a4f5c'; ctx.lineWidth = 2; ctx.strokeRect(bx, 44, 58, 28);
        text(ctx, (i === 0 ? 'S' : 'D') + (sk && sk.cd > 0 ? ' ' + sk.cd.toFixed(1) : ''), bx + 29, 58, 12, sk ? '#e8eaf0' : '#6b7180', 'center');
        if (sk) text(ctx, sdef.label, bx + 29, 82, 11, '#b9bfcc', 'center');
      }
      if (G.Sound) text(ctx, 'M 소리 ' + (G.Sound.isOn() ? '켜짐' : '꺼짐'), 282, 58, 12, G.Sound.isOn() ? '#8a90a0' : '#6b7180');

      text(ctx, (s.infinite ? '무한 | ' : '') + s.floor + '층 ' + floorName(s, s.floor) + '  웨이브 ' + s.wave + ' / ' + s.dt.common.wavesPerFloor + (isBossWave(s) ? ' (보스)' : ''), s.W - 20, 27, 18, '#e8eaf0', 'right');

      // 보스 체력 바(화면 아래 가운데, 보스가 12시에서 나와서 위에 두면 가려짐). 돌진 예고 중엔 아래에 슈퍼아머 게이지
      for (var b = 0; b < s.enemies.length; b++) {
        var e = s.enemies[b];
        if (e.type !== 'boss') continue;
        var def = s.dt.enemies[e.defId], bw = 520, bx = s.W / 2 - bw / 2, by = s.H - 76;
        text(ctx, def.label, s.W / 2, by - 12, 15, '#e8eaf0', 'center');
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 14);
        ctx.fillStyle = '#c0414a'; ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 14);
        text(ctx, Math.ceil(Math.max(0, e.hp)) + ' / ' + e.maxHp, s.W / 2, by + 7, 11, '#ffffff', 'center');
        if (e.state === 'chargeTele') {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by + 18, bw, 8);
          ctx.fillStyle = '#ffcf66'; ctx.fillRect(bx, by + 18, bw * Math.max(0, e.armor / e.armorMax), 8);
          text(ctx, '슈퍼아머 (다 깎으면 파훼)', s.W / 2, by + 38, 12, '#ffcf66', 'center');
        } else if (e.state === 'groggy') {
          text(ctx, e.groggyKind === 'break' ? '파훼! 그로기 ' + e.groggyTime.toFixed(1) : '벽 충돌 그로기 ' + e.groggyTime.toFixed(1), s.W / 2, by + 28, 14, '#ffcf66', 'center');
        }
      }
    },

    start: function (ctx, s) {
      dim(ctx, s);
      text(ctx, '가라앉는 늪', s.W / 2, 130, 48, '#e8eaf0', 'center');
      var keys = [['방향키', '이동'], ['A', '기본 공격'], ['Space', '대시'], ['S, D', '스킬'], ['1, 2, 3 또는 ←→ 후 Enter', '카드 선택'], ['P', '일시정지'], ['M', '소리 켜기, 끄기']];
      for (var i = 0; i < keys.length; i++) {
        var ky = 205 + i * 37;
        text(ctx, keys[i][0], s.W / 2 - 18, ky, 22, '#e8eaf0', 'right');
        text(ctx, keys[i][1], s.W / 2 + 18, ky, 22, '#b9bfcc', 'left');
      }
      text(ctx, 'Enter: 게임 시작', s.W / 2, 485, 26, '#4da3ff', 'center');
      text(ctx, '5: 보스전부터 시작 (테스트용)', s.W / 2, s.H - 34, 18, '#8a90a0', 'center');
    },

    card: function (ctx, s, sel, slotFor, slotSel) {
      dim(ctx, s);
      text(ctx, (isBossWave(s) ? '보스 처치' : '웨이브 ' + s.wave + ' 클리어') + '  |  카드 한 장을 고르세요', s.W / 2, 150, 26, '#e8eaf0', 'center');
      var w = 260, h = 350, gap = 40, x0 = s.W / 2 - (w * 3 + gap * 2) / 2;
      for (var i = 0; i < s.cardOffer.length; i++) {
        var pick = s.cardOffer[i], c = G.Core.cards.find(s, pick.id), x = x0 + i * (w + gap), y = 195;
        ctx.fillStyle = '#23262e'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = i === sel ? '#4da3ff' : '#3a3f4b'; ctx.lineWidth = i === sel ? 4 : 2; ctx.strokeRect(x, y, w, h);
        var sdef = c.group === 'skill' ? s.dt.skills.list[c.skill] : null;
        text(ctx, c.group === 'basic' ? '기본 공격 강화' : sdef ? '스킬  |  ' + (sdef.kind === 'attack' ? '공격형' : '유틸형') : '능력치', x + w / 2, y + 22, 13, '#8a90a0', 'center');
        // 카드 그림 자리(임시). 그림이 생기면 여기에 그림
        var ix = x + 24, iy = y + 40, iw = w - 48, ih = 140;
        // 종류별 색: 시안 생존, 마젠타 공격, 옐로 평타(CMYK에서 검정 뺀 세 색)
        ctx.fillStyle = CARD_COLOR[c.color] || '#1a1c22'; ctx.fillRect(ix, iy, iw, ih);
        
        text(ctx, c.name || c.label, x + w / 2, y + 212, 24, '#e8eaf0', 'center');
        text(ctx, effectText(c, pick.value), x + w / 2, y + 248, 18, '#7bd88f', 'center');
        if (sdef) text(ctx, '쿨타임 ' + +G.Core.skills.cooldown(s, sdef).toFixed(1) + '초', x + w / 2, y + 285, 15, '#b9bfcc', 'center');
        else text(ctx, pick.tier + '단계', x + w / 2, y + 285, 15, ['#b9bfcc', '#6fb3ff', '#ffcf66'][pick.tier - 1], 'center');
        text(ctx, '[' + (i + 1) + ']', x + w / 2, y + h - 22, 15, '#8a90a0', 'center');
      }
      // 스킬 카드를 골랐으면 넣을 칸 고르기. 찬 칸을 고르면 원래 스킬은 없어짐
      if (slotFor >= 0) {
        ctx.fillStyle = 'rgba(10,11,14,0.85)'; ctx.fillRect(0, 0, s.W, s.H);
        var sc = G.Core.cards.find(s, s.cardOffer[slotFor].id);
        text(ctx, sc.name + '  |  어느 칸에 넣을까요?', s.W / 2, 220, 26, '#e8eaf0', 'center');
        for (var k = 0; k < 2; k++) {
          var cur = s.player.skills[k], bx2 = s.W / 2 - 230 + k * 240, by2 = 270;
          ctx.fillStyle = '#23262e'; ctx.fillRect(bx2, by2, 220, 120);
          ctx.strokeStyle = k === slotSel ? '#4da3ff' : '#3a3f4b'; ctx.lineWidth = k === slotSel ? 4 : 2; ctx.strokeRect(bx2, by2, 220, 120);
          text(ctx, (k === 0 ? 'S' : 'D') + '  |  스킬 ' + (k + 1), bx2 + 110, by2 + 32, 18, '#8a90a0', 'center');
          text(ctx, cur ? s.dt.skills.list[cur.id].label : '빈칸', bx2 + 110, by2 + 68, 22, cur ? '#e8eaf0' : '#6b7180', 'center');
          if (cur) text(ctx, '바꾸면 이 스킬은 사라짐', bx2 + 110, by2 + 98, 13, '#ff9a8a', 'center');
        }
        text(ctx, 'S, D 또는 ←→ 후 Enter   Esc 카드 다시 고르기', s.W / 2, 430, 16, '#8a90a0', 'center');
      }
    },

    // 비교 테스트용 켜고 끄는 항목 표시(오른쪽 아래)
    testToggles: function (ctx, s, flags) {
      var rows = [['T 방향 표시 부드럽게', flags.smoothFacing, true], ['B 입력 미리 받기', flags.buffer, false], ['H 히트스톱', flags.hitstop, false], ['K 넉백(규칙)', flags.knockback, true], ['L 밀리는 동안 조작 불가(규칙)', flags.lockMove, true]].filter(function (r) { return !!r[1] !== r[2]; });
      for (var i = 0; i < rows.length; i++) {
        text(ctx, rows[i][0] + ': ' + (rows[i][1] ? '켜짐' : '꺼짐'), s.W - 16, s.H - 18 - (rows.length - 1 - i) * 18, 13, rows[i][1] ? '#7bd88f' : '#8a90a0', 'right');
      }
    },

    // 봇 플레이 재생 표시(왼쪽 아래): 실력, 시드, 이 층 지난 시간 / 제한 시간
    botTag: function (ctx, s, bot) {
      var lim = bot.cfg.floorTimeLimit, used = s.time - bot.floorStart;
      text(ctx, '봇 플레이 재생  |  ' + bot.cfg.levels[bot.level].label + '  |  시드 ' + s.seed, 16, s.H - 36, 14, '#ffcf66');
      text(ctx, '이 층 ' + used.toFixed(0) + '초 / 제한 ' + lim + '초   회피 ' + bot.stats.dodges + '회', 16, s.H - 16, 13, used > lim * 0.8 ? '#ff7a7a' : '#b9bfcc');
    },

    // 봇이 알아차린 공격 위에 "!" 표시. 노란색 = 피하는 중, 하늘색 = 돌진을 깎으러 붙음
    botNotice: function (ctx, s, bot) {
      for (var i = 0; i < bot.threats.length; i++) {
        var t = bot.threats[i];
        if (s.time < t.notice) continue;
        var o = t.proj || t.enemy; if (!o) continue;
        text(ctx, '!', o.x, o.y - (o.r || 6) - 10, t.proj ? 14 : 20, t.engaged ? '#6fd3ff' : '#ffcf66', 'center');
      }
    },

    pause: function (ctx, s) {
      dim(ctx, s);
      text(ctx, '일시정지', s.W / 2, s.H / 2 - 20, 40, '#e8eaf0', 'center');
      text(ctx, 'P 또는 Esc를 눌러 계속', s.W / 2, s.H / 2 + 30, 18, '#4da3ff', 'center');
    },

    floor: function (ctx, s) {
      dim(ctx, s);
      var next = s.floor + 1, inf = next > s.dt.common.floorCount;
      text(ctx, s.floor + '층 돌파', s.W / 2, s.H / 2 - 40, 40, '#e8eaf0', 'center');
      text(ctx, (inf ? '무한 모드  |  ' : '') + next + '층  |  ' + floorName(s, next), s.W / 2, s.H / 2 + 20, 28, '#b9bfcc', 'center');
      text(ctx, 'Enter를 눌러 계속', s.W / 2, s.H / 2 + 80, 18, '#4da3ff', 'center');
    },

    result: function (ctx, s) {
      dim(ctx, s);
      var r = s.result;
      var OUT = { death: '사망', clear: '클리어 (5층 돌파)', timeout: '시간 초과' };
      text(ctx, r.outcome ? '결과  |  봇 ' + s.dt.bots.levels[r.botLevel].label + '  |  ' + OUT[r.outcome] : '결과', s.W / 2, 120, r.outcome ? 32 : 40, '#e8eaf0', 'center');
      if (r.outcome) text(ctx, '시드 ' + r.seed, s.W / 2, 150, 14, '#8a90a0', 'center');
      text(ctx, '도달: ' + (s.infinite ? '무한 | ' : '') + r.floor + '층 웨이브 ' + r.wave + '    걸린 시간: ' + fmtTime(r.time), s.W / 2, 180, 20, '#b9bfcc', 'center');
      text(ctx, '고른 카드 (' + r.picks.length + '장)', s.W / 2, 230, 18, '#8a90a0', 'center');
      var cols = 3, colW = 340, x0 = s.W / 2 - colW * cols / 2;
      var maxShow = 30;
      for (var i = 0; i < Math.min(r.picks.length, maxShow); i++) {
        var pk = r.picks[i], c = G.Core.cards.find(s, pk.id);
        var cx = x0 + (i % cols) * colW + 20, cy = 270 + Math.floor(i / cols) * 26;
        text(ctx, pk.floor + '-' + pk.wave + '  ' + (c.name || c.label) + (c.group === 'skill' ? ' (스킬, ' + (pk.slot === 1 ? 'D' : 'S') + '칸)' : ' (' + effectText(c, pk.value) + ', ' + pk.tier + '단계)'), cx, cy, 13, '#e8eaf0');
      }
      if (r.picks.length > maxShow) text(ctx, '외 ' + (r.picks.length - maxShow) + '장', s.W / 2, 270 + 10 * 26, 15, '#8a90a0', 'center');
      text(ctx, r.outcome ? 'Enter: 같은 플레이 다시 재생' : 'Enter를 눌러 다시 시작', s.W / 2, s.H - 70, 20, '#4da3ff', 'center');
    }
  };
})();
