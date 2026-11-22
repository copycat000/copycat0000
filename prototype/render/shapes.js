// 도형 그리기. 그림은 전부 여기에만 둔다.
// 나중에 이미지로 바꿀 때 이 파일의 함수 안쪽만 갈아끼우면 된다.
var G = globalThis.G = globalThis.G || {};

G.Shapes = (function () {
  var C = {
    bg: '#15171c', floor: '#1d2027', wall: '#3a3f4b',
    player: '#4da3ff', playerDash: 'rgba(77,163,255,0.35)', facing: '#e8f2ff',
    melee: '#e5534b', ranged: '#e8a33d', retreat: '#c39bff', hitFlash: '#ffffff',
    teleFill: 'rgba(229,83,75,0.25)', teleEdge: 'rgba(229,83,75,0.9)',
    teleLine: 'rgba(232,163,61,0.8)',
    swing: 'rgba(232,242,255,0.35)', enemySwing: 'rgba(229,83,75,0.55)',
    projectile: '#ffcf66', hpBack: 'rgba(0,0,0,0.6)', hpFill: '#7bd88f',
    boss: '#a8323a', bossEdge: '#f0d0a0', bossGroggy: '#6b6f7a', armor: '#ffcf66',
    chargeFill: 'rgba(229,83,75,0.18)', chargeEdge: 'rgba(255,207,102,0.9)'
  };

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

    arena: function (ctx, map) {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, map.width, map.height);
      ctx.fillStyle = C.floor; ctx.fillRect(4, 4, map.width - 8, map.height - 8);
      ctx.strokeStyle = C.wall; ctx.lineWidth = 8; ctx.strokeRect(0, 0, map.width, map.height);
    },

    player: function (ctx, p, blink) {
      if (p.dashTime > 0) {
        ctx.fillStyle = C.playerDash;
        ctx.beginPath(); ctx.arc(p.x - p.dashDir.x * 20, p.y - p.dashDir.y * 20, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = (p.hitInvulnTime > 0 && blink) ? 0.35 : 1;
      ctx.fillStyle = C.player;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.facing; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.facing.x * (p.r + 8), p.y + p.facing.y * (p.r + 8)); ctx.stroke();
      ctx.globalAlpha = 1;
    },

    enemy: function (ctx, e, def, flashing) {
      // 맞은 직후 맞은 방향으로 납작해졌다 돌아옴(e.squash 0~1, e.squashDir 각도)
      ctx.save();
      if (e.squash > 0) {
        ctx.translate(e.x, e.y); ctx.rotate(e.squashDir);
        ctx.scale(1 - 0.3 * e.squash, 1 + 0.25 * e.squash);
        ctx.rotate(-e.squashDir); ctx.translate(-e.x, -e.y);
      }
      // 물러나는 중이면 색을 바꿔서 밀리는 것과 구분
      ctx.fillStyle = flashing ? C.hitFlash : e.state === 'retreat' ? C.retreat : (def.type === 'melee' ? C.melee : C.ranged);
      if (def.type === 'melee') {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      } else {
        // 몸 판정이 원이라 원으로 그리고, 근거리형과 구분되게 안에 삼각형 표시
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.bg;
        var k = e.r * 0.55;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - k); ctx.lineTo(e.x + k, e.y + k * 0.8); ctx.lineTo(e.x - k, e.y + k * 0.8);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      var w = e.r * 2, ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = C.hpBack; ctx.fillRect(e.x - e.r, e.y - e.r - 9, w, 4);
      ctx.fillStyle = C.hpFill; ctx.fillRect(e.x - e.r, e.y - e.r - 9, w * ratio, 4);
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

    // 보스: 큰 원 + 두꺼운 테두리. 돌진 예고 중엔 테두리 바깥에 슈퍼아머 게이지(노란 고리)
    // 그로기면 회색으로 바뀌고 머리 위에 별이 돎. 돌진 중엔 뒤에 잔상
    boss: function (ctx, e, def, flashing, t) {
      if (e.state === 'charging') {
        for (var g = 1; g <= 3; g++) {
          ctx.globalAlpha = 0.25 / g; ctx.fillStyle = C.boss;
          ctx.beginPath(); ctx.arc(e.x - e.teleDir.x * 22 * g, e.y - e.teleDir.y * 22 * g, e.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.save();
      if (e.squash > 0) {
        ctx.translate(e.x, e.y); ctx.rotate(e.squashDir);
        ctx.scale(1 - 0.12 * e.squash, 1 + 0.1 * e.squash);   // 무거운 몸이라 덜 찌그러짐
        ctx.rotate(-e.squashDir); ctx.translate(-e.x, -e.y);
      }
      var groggy = e.state === 'groggy';
      ctx.fillStyle = flashing ? C.hitFlash : groggy ? C.bossGroggy : C.boss;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.bossEdge; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r - 2.5, 0, Math.PI * 2); ctx.stroke();
      // 바라보는 방향(예고·돌진 방향)
      if (e.teleDir && !groggy) {
        ctx.strokeStyle = C.bossEdge; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(e.x + e.teleDir.x * e.r * 0.3, e.y + e.teleDir.y * e.r * 0.3);
        ctx.lineTo(e.x + e.teleDir.x * (e.r + 10), e.y + e.teleDir.y * (e.r + 10)); ctx.stroke();
      }
      ctx.restore();
      if (e.state === 'chargeTele' && e.armorMax > 0) {
        var ar = Math.max(0, e.armor / e.armorMax);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = C.armor; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ar); ctx.stroke();
      }
      if (groggy) {
        for (var i = 0; i < 3; i++) {
          var a = t * 4 + i * Math.PI * 2 / 3;
          star(ctx, e.x + Math.cos(a) * e.r * 0.8, e.y - e.r - 14 + Math.sin(a) * 6, 7, C.armor);
        }
      }
    },

    // 보스 예고: 내려찍기는 큰 부채꼴이 차오름, 돌진은 몸 폭만 한 길이 차오름(점선 테두리)
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
