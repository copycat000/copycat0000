// DT: 카드
// name: 카드 화면에 크게 나오는 이름(11/22 콘셉트). label: 효과 이름(카드 화면 이름 아래, 대시보드)
// stat: 플레이어 DT에서 올릴 항목 경로. tiers: 1·2·3단계 증가폭
// stackable: 중복 가능 여부. requires: 이 조건이 있을 때만 후보로 나옴
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};

G.DT.cards = {
  tierChance: [0.6, 0.3, 0.1],   // 단계별 등장 확률

  list: [
    { id: 'C001', name: '불어나는 몸', group: 'stat',  label: '최대 체력',       stat: 'maxHp',            tiers: [10, 20, 30],          unit: '',    stackable: true },
    { id: 'C002', name: '가벼워진 발', group: 'stat',  label: '이동 속도',       stat: 'moveSpeed',        tiers: [10, 20, 30],          unit: '',    stackable: true },
    { id: 'C003', name: '검게 물든 팔', group: 'stat',  label: '공격력',          stat: 'attack',           tiers: [2, 4, 6],             unit: '',    stackable: true },
    { id: 'C004', name: '굳어가는 살갗', group: 'stat',  label: '방어력',          stat: 'defense',          tiers: [1, 2, 3],             unit: '',    stackable: true },
    { id: 'C005', name: '약점이 보이는 눈', group: 'stat',  label: '치명타 확률',     stat: 'critChance',       tiers: [0.05, 0.10, 0.15],    unit: '%p',  stackable: true },
    { id: 'C006', name: '파고드는 진흙', group: 'stat',  label: '치명타 피해 배율', stat: 'critMult',         tiers: [0.1, 0.2, 0.3],       unit: '배',  stackable: true },
    { id: 'C007', name: '쉬지 않는 손', group: 'stat',  label: '평타 쿨타임 감소', stat: 'basicCdReduction', tiers: [0.05, 0.10, 0.15],    unit: '%p',  stackable: true },
    { id: 'C008', name: '빨라진 맥박', group: 'stat',  label: '스킬 쿨타임 감소', stat: 'skillCdReduction', tiers: [null, null, null],    unit: '%p',  stackable: true, requires: 'skill' },
    { id: 'C009', name: '스며드는 늪물', group: 'stat',  label: '자연 회복',       stat: 'regen',            tiers: [0.5, 1, 1.5],         unit: '/초', stackable: true },
    { id: 'C010', name: '빨아들이는 피부', group: 'stat',  label: '피해 흡수',       stat: 'lifesteal',        tiers: [0.02, 0.04, 0.06],    unit: '%p',  stackable: true },
    { id: 'C101', name: '무거워진 칼날', group: 'basic', label: '평타 피해 배율',   stat: 'basicAttack.damageMult', tiers: [0.1, 0.2, 0.3], unit: '배', stackable: true },
    { id: 'C102', name: '늘어난 칼끝', group: 'basic', label: '평타 거리',       stat: 'basicAttack.range',      tiers: [10, 20, 30],     unit: 'px', stackable: true },
    { id: 'C103', name: '휘어지는 팔', group: 'basic', label: '평타 각도',       stat: 'basicAttack.angle',      tiers: [15, 30, 45],     unit: '°',  stackable: true }
  ]
};
