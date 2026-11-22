// 거리·각도·판정 계산
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.geom = {
  dist: function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },

  norm: function (x, y) {
    var l = Math.sqrt(x * x + y * y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  },

  // 부채꼴(중심 cx,cy / 방향 dir / 거리 range / 전체 각도 angleDeg)에
  // 원(x,y,r)이 조금이라도 걸리는지. 몸이 걸리면 맞은 걸로 본다.
  circleInFan: function (cx, cy, dir, range, angleDeg, x, y, r) {
    var dx = x - cx, dy = y - cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > range + r) return false;
    if (d <= r) return true;
    var half = (angleDeg / 2) * Math.PI / 180;
    var diff = Math.abs(Math.atan2(dx * dir.y - dy * dir.x, dx * dir.x + dy * dir.y));
    if (diff <= half) return true;
    // 부채꼴 양쪽 변(선분)과 원의 거리
    var edges = [half, -half];
    for (var i = 0; i < 2; i++) {
      var a = Math.atan2(dir.y, dir.x) + edges[i];
      var ex = Math.cos(a), ey = Math.sin(a);
      var t = Math.max(0, Math.min(range, dx * ex + dy * ey));
      var px = dx - ex * t, py = dy - ey * t;
      if (px * px + py * py <= r * r) return true;
    }
    return false;
  },

  circlesOverlap: function (ax, ay, ar, bx, by, br) {
    var dx = bx - ax, dy = by - ay, rr = ar + br;
    return dx * dx + dy * dy < rr * rr;
  }
};
