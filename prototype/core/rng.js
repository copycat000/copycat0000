// 시드 무작위. 규칙 계산에서 쓰는 무작위는 전부 이걸로만 굴린다.
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.createRng = function (seed) {
  var s = seed >>> 0;
  function next() {               // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next: next,
    range: function (a, b) { return a + (b - a) * next(); },
    int: function (n) { return Math.floor(next() * n); },
    chance: function (p) { return next() < p; },
    pickWeighted: function (weights) {
      var sum = 0, i;
      for (i = 0; i < weights.length; i++) sum += weights[i];
      var r = next() * sum;
      for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
      return weights.length - 1;
    },
    shuffle: function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  };
};
