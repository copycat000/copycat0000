// DT: 적
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};

G.DT.enemies = {
  E001: {
    id: 'E001',
    type: 'melee',          // 근거리형
    label: '잠식된 보병',   // 근거리형 (이름 11/22 콘셉트)
    bodyDiameter: 32,       // 임시값(DT 문서에 없음, 플레이어와 같게)
    hp: 30,
    moveSpeed: 160,
    attackRange: 50,        // 부채꼴 거리
    attackAngle: 90,
    damage: 10,
    cooldown: 2,
    telegraph: 0.6
  },
  E002: {
    id: 'E002',
    type: 'ranged',         // 원거리형
    label: '잠식된 궁수',   // 원거리형
    bodyDiameter: 32,       // 임시값
    hp: 20,
    moveSpeed: 120,
    attackRange: 350,
    alertRange: 150,        // 경계 범위
    damage: 8,
    cooldown: 2.5,
    telegraph: 0.8,
    projectileSpeed: 300,
    projectileDiameter: 12
  }
};
