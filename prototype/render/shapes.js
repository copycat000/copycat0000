// 그리기. 그림은 전부 여기에만 둔다.
// 플레이어·적·보스는 render/sprites의 그림(11/22 콘셉트), 화살·공격 부채꼴·예고는 도형 그대로.
// 판정 원은 몸통에 두고 그림은 원 지름의 1.5배 높이로, 머리가 원 위로 나오게 그린다. 회전 없이 좌우만 뒤집음.
var G = globalThis.G = globalThis.G || {};

G.Shapes = (function () {
  var C = {
    bg: '#15171c', floor: '#1d2027', wall: '#3a3f4b',
    // 층별 바닥 색: 내려갈수록 어두워짐. 검은 적보다는 확실히 밝게 둠. 6층부터(무한)는 마지막 색
    floors: ['#4b5240', '#424838', '#3a3f33', '#33372e', '#2d302a', '#282a26'],
    player: '#4da3ff', playerDash: 'rgba(77,163,255,0.35)', facing: '#e8f2ff',
    melee: '#e5534b', ranged: '#e8a33d', retreat: '#c39bff', hitFlash: '#ffffff',
    teleFill: 'rgba(229,83,75,0.25)', teleEdge: 'rgba(229,83,75,0.9)',
    teleLine: 'rgba(232,163,61,0.8)',
    swing: 'rgba(232,242,255,0.35)', enemySwing: 'rgba(229,83,75,0.55)',
    projectile: '#ffcf66', hpBack: 'rgba(0,0,0,0.6)', hpFill: '#7bd88f',
    boss: '#a8323a', bossEdge: '#f0d0a0', bossGroggy: '#6b6f7a', armor: '#ffcf66',
    chargeFill: 'rgba(229,83,75,0.18)', chargeEdge: 'rgba(255,207,102,0.9)'
  };


  // ---- 그림(스프라이트) ----
  // 그림 파일은 이 스크립트 옆 sprites 폴더. 프로토 index.html, 대시보드 replay.html 어디서 열어도 찾도록 스크립트 주소 기준으로 잡음
  var BASE = (function () {
    var cs = typeof document !== 'undefined' && document.currentScript;
    return cs ? cs.src.replace(/[^\/]*$/, '') + 'sprites/' : 'render/sprites/';
  })();
  // 그림이 원래 보는 방향은 왼쪽. pivot: 판정 원 중심이 그림 위에서부터 몇 % 지점인지(몸통)
  var SPR = {
    player: { file: 'player.png', pivot: 0.58 },
    E001:   { file: 'infantry.png', pivot: 0.58 },
    E002:   { file: 'archer.png', pivot: 0.58 },
    B001:   { file: 'boss_knight.png', pivot: 0.56 }
  };
  var SCALE = 1.5;   // 그림 높이 = 판정 원 지름 × 1.5
  if (typeof Image !== 'undefined') {
    Object.keys(SPR).forEach(function (k) {
      var sp = SPR[k], img = new Image();
      img.onload = function () {
        sp.ready = true;
        // 맞았을 때 번쩍임용 흰 실루엣을 미리 만들어 둠
        var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0);
        x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
        sp.white = c;
      };
      img.src = BASE + sp.file;
      sp.img = img;
    });
  }

  // 좌우 방향 기억(uid별). 움직인 방향이 확실할 때만 바꿈
  var faceRight = {}, lastX = {};
  function updateFace(key, dx) {
    if (dx > 0.05) faceRight[key] = true;
    else if (dx < -0.05) faceRight[key] = false;
    return !!faceRight[key];
  }
  function moveFace(e, key) {
    var x = e.baseX !== undefined ? e.baseX : e.x, dx = lastX[key] === undefined ? 0 : x - lastX[key];
    lastX[key] = x;
    if (e.teleDir && (e.state === 'telegraph' || e.state === 'slamTele' || e.state === 'chargeTele' || e.state === 'charging')) return updateFace(key, e.teleDir.x);
    return updateFace(key, Math.abs(dx) > 0.3 ? dx : 0);
  }

  // 그림 크기(판정 원 기준)
  function sprBox(sp, r) {
    var h = r * 2 * SCALE, w = sp.img.width / sp.img.height * h;
    return { w: w, h: h, top: -h * sp.pivot };
  }
  // 판정 원 중심 (x, y)에 그림을 그림. right면 좌우 뒤집음. white면 흰 실루엣
  function drawSprite(ctx, sp, x, y, r, right, white) {
    var b = sprBox(sp, r);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    if (right) ctx.scale(-1, 1);
    ctx.drawImage(white && sp.white ? sp.white : sp.img, -b.w / 2, b.top, b.w, b.h);
    ctx.restore();
  }
  // 발밑 그림자(어두운 바닥에서 자리 잡히게)
  function shadow(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.85, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 그림 머리 위 y
  function headTop(sp, e) { return sp.ready ? e.y + sprBox(sp, e.r).top : e.y - e.r; }

  function star(ctx, x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  function fan(ctx, x, y, dir, range, angleDeg) {
    var a = Math.atan2(dir.y, dir.x), half = angleDeg / 2 * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, range, a - half, a + half); ctx.closePath();
  }

  return {
    colors: C,

    arena: function (ctx, map, floor) {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, map.width, map.height);
      ctx.fillStyle = floor ? C.floors[Math.min(floor, C.floors.length) - 1] : C.floors[0]; ctx.fillRect(4, 4, map.width - 8, map.height - 8);
      ctx.strokeStyle = C.wall; ctx.lineWidth = 8; ctx.strokeRect(0, 0, map.width, map.height);
    },

    player: function (ctx, p, blink) {
      var sp = SPR.player, right = updateFace('player', p.facing.x);
      if (!sp.ready) {   // 그림을 아직 못 불러왔으면 원
        ctx.fillStyle = C.player; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        return;
      }
      if (p.dashTime > 0) {   // 대시 잔상
        ctx.globalAlpha = 0.3;
        drawSprite(ctx, sp, p.x - p.dashDir.x * 20, p.y - p.dashDir.y * 20, p.r, right);
        ctx.globalAlpha = 1;
      }
      shadow(ctx, p.x, p.y, p.r);
      // 공격 방향 표시(그림은 좌우만 돌아서 위·아래·대각 공격 방향은 이걸로 봄)
      ctx.strokeStyle = C.facing; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(p.x + p.facing.x * (p.r - 2), p.y + p.facing.y * (p.r - 2)); ctx.lineTo(p.x + p.facing.x * (p.r + 10), p.y + p.facing.y * (p.r + 10)); ctx.stroke();
      ctx.globalAlpha = (p.hitInvulnTime > 0 && blink) ? 0.35 : 1;
      drawSprite(ctx, sp, p.x, p.y, p.r, right);
      ctx.globalAlpha = 1;
    },

    enemy: function (ctx, e, def, flashing) {
      var sp = SPR[e.defId] || SPR.E001, right = moveFace(e, e.uid);
      shadow(ctx, e.x, e.y, e.r);
      // 맞은 직후 맞은 방향으로 납작해졌다 돌아옴(e.squash 0~1, e.squashDir 각도)
      ctx.save();
      if (e.squash > 0) {
        ctx.translate(e.x, e.y); ctx.rotate(e.squashDir);
        ctx.scale(1 - 0.3 * e.squash, 1 + 0.25 * e.squash);
        ctx.rotate(-e.squashDir); ctx.translate(-e.x, -e.y);
      }
      if (sp.ready) drawSprite(ctx, sp, e.x, e.y, e.r, right, flashing);
      else {
        ctx.fillStyle = flashing ? C.hitFlash : (def.type === 'melee' ? C.melee : C.ranged);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      var w = e.r * 2, ratio = Math.max(0, e.hp / e.maxHp), hy = headTop(sp, e) - 7;
      ctx.fillStyle = C.hpBack; ctx.fillRect(e.x - e.r, hy, w, 4);
      ctx.fillStyle = C.hpFill; ctx.fillRect(e.x - e.r, hy, w * ratio, 4);
    },

    // 예고 동작: 근거리형은 부채꼴이 차오름, 원거리형은 조준선
    telegraph: function (ctx, e, def) {
      var prog = 1 - Math.max(0, e.teleTime) / def.telegraph;
      if (def.type === 'melee') {
        fan(ctx, e.x, e.y, e.teleDir, def.attackRange + e.r, def.attackAngle);
        ctx.strokeStyle = C.teleEdge; ctx.lineWidth = 2; ctx.stroke();
        fan(ctx, e.x, e.y, e.teleDir, (def.attackRange + e.r) * prog, def.attackAngle);
        ctx.fillStyle = C.teleFill; ctx.fill();
      } else {
        ctx.strokeStyle = C.teleLine; ctx.lineWidth = 1 + 3 * prog;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + e.teleDir.x * def.attackRange, e.y + e.teleDir.y * def.attackRange); ctx.stroke();
        ctx.setLineDash([]);
      }
    },

    // 보스: 그림. 돌진 예고 중엔 몸 둘레에 슈퍼아머 게이지(노란 고리)
    // 그로기면 흐려지고 머리 위에 별이 돎. 돌진 중엔 뒤에 잔상
    boss: function (ctx, e, def, flashing, t) {
      var sp = SPR[e.defId] || SPR.B001, right = moveFace(e, e.uid), groggy = e.state === 'groggy';
      if (!sp.ready) {
        ctx.fillStyle = flashing ? C.hitFlash : groggy ? C.bossGroggy : C.boss;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      } else {
        if (e.state === 'charging') {
          for (var g = 1; g <= 3; g++) {
            ctx.globalAlpha = 0.25 / g;
            drawSprite(ctx, sp, e.x - e.teleDir.x * 22 * g, e.y - e.teleDir.y * 22 * g, e.r, right);
          }
          ctx.globalAlpha = 1;
        }
        shadow(ctx, e.x, e.y, e.r);
        ctx.save();
        if (e.squash > 0) {
          ctx.translate(e.x, e.y); ctx.rotate(e.squashDir);
          ctx.scale(1 - 0.12 * e.squash, 1 + 0.1 * e.squash);   // 무거운 몸이라 덜 찌그러짐
          ctx.rotate(-e.squashDir); ctx.translate(-e.x, -e.y);
        }
        if (groggy) ctx.globalAlpha = 0.7;
        drawSprite(ctx, sp, e.x, e.y, e.r, right, flashing);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      // 바라보는 방향(예고·돌진 방향). 그림은 좌우만 돌아서 정확한 방향은 이 선으로 봄
      if (e.teleDir && !groggy) {
        ctx.strokeStyle = C.bossEdge; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(e.x + e.teleDir.x * (e.r - 4), e.y + e.teleDir.y * (e.r - 4));
        ctx.lineTo(e.x + e.teleDir.x * (e.r + 12), e.y + e.teleDir.y * (e.r + 12)); ctx.stroke();
      }
      if (e.state === 'chargeTele' && e.armorMax > 0) {
        var ar = Math.max(0, e.armor / e.armorMax);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = C.armor; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ar); ctx.stroke();
      }
      if (groggy) {
        var top = headTop(sp, e);
        for (var i = 0; i < 3; i++) {
          var a = t * 4 + i * Math.PI * 2 / 3;
          star(ctx, e.x + Math.cos(a) * e.r * 0.8, top - 8 + Math.sin(a) * 6, 7, C.armor);
        }
      }
    },

    bossTelegraph: function (ctx, e, def, map) {
      var prog = 1 - Math.max(0, e.teleTime) / e.teleMax;
      if (e.state === 'slamTele') {
        var R = def.slam.range + e.r;
        fan(ctx, e.x, e.y, e.teleDir, R, def.slam.angle);
        ctx.strokeStyle = C.teleEdge; ctx.lineWidth = 3; ctx.stroke();
        fan(ctx, e.x, e.y, e.teleDir, R * prog, def.slam.angle);
        ctx.fillStyle = C.teleFill; ctx.fill();
      } else if (e.state === 'chargeTele') {
        var L = def.charge.distance, w = e.r;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, map.width, map.height); ctx.clip();
        ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(e.teleDir.y, e.teleDir.x));
        ctx.fillStyle = C.chargeFill; ctx.fillRect(0, -w, L * prog, w * 2);
        ctx.strokeStyle = C.chargeEdge; ctx.lineWidth = 2 + 2 * prog; ctx.setLineDash([12, 9]);
        ctx.strokeRect(0, -w, L, w * 2);
        ctx.setLineDash([]);
        ctx.restore();
      }
    },

    breakBurst: function (ctx, ev, alpha) {
      var k = 1 - alpha;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = C.armor; ctx.lineWidth = 6 * alpha + 1;
      ctx.beginPath(); ctx.arc(ev.x, ev.y, 40 + k * 90, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (var i = 0; i < 10; i++) {
        var a = i * Math.PI / 5;
        ctx.beginPath();
        ctx.moveTo(ev.x + Math.cos(a) * (36 + k * 40), ev.y + Math.sin(a) * (36 + k * 40));
        ctx.lineTo(ev.x + Math.cos(a) * (60 + k * 80), ev.y + Math.sin(a) * (60 + k * 80)); ctx.stroke();
      }
      ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
    },

    wallDust: function (ctx, ev, alpha) {
      ctx.globalAlpha = alpha * 0.8; ctx.fillStyle = '#9aa0ad';
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3 + 0.4, d = 30 + (1 - alpha) * 40;
        ctx.beginPath(); ctx.arc(ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d, 6 * alpha + 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    projectile: function (ctx, b) {
      ctx.fillStyle = C.projectile;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    },

    // 기본 공격: 한쪽 끝에서 반대쪽으로 쓸려가는 궤적. 판정은 누른 순간 이미 끝났고 이건 그림만
    swing: function (ctx, ev, alpha) {
      var prog = 1 - alpha;                          // 0 → 1
      var sweep = Math.min(1, prog / 0.45);          // 앞쪽 45% 시간 동안 끝까지 쓸림
      var a = Math.atan2(ev.dir.y, ev.dir.x), half = ev.angle / 2 * Math.PI / 180;
      var from = a - half, to = from + 2 * half * sweep;
      var fade = prog < 0.45 ? 1 : 1 - (prog - 0.45) / 0.55;
      ctx.globalAlpha = 0.45 * fade;
      ctx.beginPath(); ctx.moveTo(ev.x, ev.y); ctx.arc(ev.x, ev.y, ev.range, from, to); ctx.closePath();
      ctx.fillStyle = C.swing; ctx.fill();
      ctx.globalAlpha = fade;                        // 칼끝 선
      ctx.strokeStyle = C.facing; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ev.x + Math.cos(to) * 12, ev.y + Math.sin(to) * 12);
      ctx.lineTo(ev.x + Math.cos(to) * ev.range, ev.y + Math.sin(to) * ev.range); ctx.stroke();
      ctx.beginPath(); ctx.arc(ev.x, ev.y, ev.range, from, to); ctx.stroke();
      ctx.globalAlpha = 1;
    },

    damageNumber: function (ctx, ev, alpha) {
      var rise = (1 - alpha) * 28, dx = ((ev.seed * 37) % 13) - 6;
      ctx.globalAlpha = Math.min(1, alpha * 1.6);
      ctx.font = (ev.crit ? 'bold 22px' : 'bold 16px') + ' sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      var str = String(Math.round(ev.dmg * 10) / 10) + (ev.crit ? '!' : '');
      ctx.strokeText(str, ev.x + dx, ev.y - 26 - rise);
      ctx.fillStyle = ev.crit ? C.projectile : '#ffffff';
      ctx.fillText(str, ev.x + dx, ev.y - 26 - rise);
      ctx.globalAlpha = 1;
    },

    // 칼이 닿은 자리(적 몸 테두리 중 플레이어 쪽)에서 짧은 선이 튐
    hitSpark: function (ctx, ev, alpha) {
      var a = Math.atan2(ev.dir.y, ev.dir.x), hx = ev.x - ev.dir.x * ev.r, hy = ev.y - ev.dir.y * ev.r;
      var grow = 0.5 + (1 - alpha) * 0.8;
      var len = (ev.crit ? 56 : 40) * grow;
      var color = ev.crit ? C.projectile : '#ffffff';
      // 닿은 자리 번쩍임
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(hx, hy, (ev.crit ? 14 : 10) * (1.2 - (1 - alpha) * 0.6), 0, Math.PI * 2); ctx.fill();
      // 튀는 선
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color; ctx.lineWidth = ev.crit ? 5 : 4; ctx.lineCap = 'round';
      for (var i = -2; i <= 2; i++) {
        var b = a + i * 0.5;              // 맞은 방향(플레이어 반대쪽)으로 튐. 캐릭터를 가리지 않게
        var l = len * (i === 0 ? 1 : (Math.abs(i) === 1 ? 0.75 : 0.55));
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(b) * l * 0.35, hy + Math.sin(b) * l * 0.35);
        ctx.lineTo(hx + Math.cos(b) * l, hy + Math.sin(b) * l); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    },

    deathPuff: function (ctx, ev, alpha) {
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ev.x, ev.y, 16 + (1 - alpha) * 22, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    },

    enemySwing: function (ctx, ev, alpha) {
      ctx.globalAlpha = alpha;
      fan(ctx, ev.x, ev.y, ev.dir, ev.range + 16, ev.angle);
      ctx.fillStyle = C.enemySwing; ctx.fill();
      ctx.globalAlpha = 1;
    }
  };
})();
