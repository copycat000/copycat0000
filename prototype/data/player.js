// DT: 플레이어
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};

G.DT.player = {
  id: 'P001',
  bodyDiameter: 32,
  maxHp: 100,
  moveSpeed: 200,
  attack: 10,
  defense: 0,
  critChance: 0.1,      // 10% (이정헌 결정 11/22. 그전 테스트값 50%, 문서 값 5%)
  critMult: 1.5,
  basicCdReduction: 0,   // 평타 쿨타임 감소
  skillCdReduction: 0,   // 스킬 쿨타임 감소(첫 판은 스킬 없음)
  regen: 0,              // 자연 회복(초당)
  lifesteal: 0,          // 피해 흡수율
  hitKnockback: { distance: 16, time: 0.1, lockMove: true },   // 플레이어가 맞으면 밀려남(DT 문서 값 16px·0.1초). lockMove: 밀리는 동안 조작(이동·공격·대시) 불가(이정헌 확정 11/20). L로 켜고 끔(비교용)
  hitInvuln: 0.5,        // 피격 무적 시간

  basicAttack: {
    damageMult: 1.0,
    range: 60,
    angle: 90,
    angleMax: 180,       // 각도 카드가 쌓여도 여기서 멈춤
    cooldown: 0.4,
    minCooldown: 0.2,
    knockback: 16,       // 맞은 적이 밀려나는 거리(px). 0이면 넉백 없음. 임시값(11/20 테스트)
    knockbackTime: 0.1   // 밀려나는 데 걸리는 시간(초). 임시값
  },

  dash: {                // 카드로 바뀌지 않는 고정값
    distance: 120,
    cooldown: 1,         // 11/20 테스트로 2 → 1, 플레이 체감상 문제없어서 1초로 확정(이정헌 11/22)
    invuln: 0.2          // 이동 시간 = 무적 시간
  }
};
