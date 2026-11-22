// 카드: 종류를 겹치지 않게 3개 뽑고, 각각 단계를 등장 확률로 뽑는다.
var G = globalThis.G = globalThis.G || {};
G.Core = G.Core || {};

G.Core.cards = {
  eligible: function (s) {
    var out = [], list = s.dt.cards.list;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.requires === 'skill' && !s.hasSkill) continue;
      if (!c.stackable && s.pickedOnce[c.id]) continue;
      if (G.Core.cards.isMaxed(s, c)) continue;     // 이미 상한에 닿은 스탯 카드는 안 나옴
      out.push(c);
    }
    return out;
  },

  offer: function (s) {
    var pool = G.Core.cards.eligible(s).slice();
    s.rng.shuffle(pool);
    var n = Math.min(3, pool.length), offer = [];
    for (var i = 0; i < n; i++) {
      var tier = s.rng.pickWeighted(s.dt.cards.tierChance);   // 0,1,2 = 1,2,3단계
      offer.push({ id: pool[i].id, tier: tier + 1, value: pool[i].tiers[tier] });
    }
    return offer;
  },

  // 상한이 있는 스탯이 이미 끝까지 올랐는지
  isMaxed: function (s, c) {
    var p = s.player, ba = p.basicAttack;
    if (c.stat === 'basicAttack.angle') return ba.angle >= ba.angleMax;
    if (c.stat === 'basicCdReduction') return ba.cooldown * (1 - p.basicCdReduction) <= ba.minCooldown;
    return false;
  },

  find: function (s, id) {
    var list = s.dt.cards.list;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  },

  apply: function (s, pick) {
    var c = G.Core.cards.find(s, pick.id), p = s.player;
    var path = c.stat.split('.'), obj = p;
    for (var i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    var key = path[path.length - 1];
    obj[key] += pick.value;                                   // 같은 카드는 그대로 더함
    if (c.stat === 'maxHp') p.hp += pick.value;               // 최대 체력 카드는 현재 체력도 같이
    if (c.stat === 'basicAttack.angle') obj.angle = Math.min(obj.angle, obj.angleMax);
    s.pickedOnce[c.id] = true;
    s.picks.push({ id: c.id, tier: pick.tier, value: pick.value, floor: s.floor, wave: s.wave });
  }
};
