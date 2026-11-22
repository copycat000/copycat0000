// DT: 스킬 (시스템 기획 7번, 11/22). 값은 무적 지속 1초(타디온)만 정해진 값이고 나머지는 전부 프로토 임시값 → DT 문서 값 오면 맞춤
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};

G.DT.skills = {
  minCooldown: 1,          // 스킬 최소 쿨타임(스킬 쿨타임 감소가 쌓여도 이 밑으로 안 내려감). 임시값
  list: {
    S001: { id: 'S001', label: '무적',     kind: 'util',   cooldown: 12, duration: 1 },          // 지속 1초(타디온). 쿨타임 임시
    S002: { id: 'S002', label: '회복',     kind: 'util',   cooldown: 20, healRatio: 0.5 },       // 최대 체력의 절반(기획서). 쿨타임 임시
    S003: { id: 'S003', label: '돌진 베기', kind: 'attack', cooldown: 6, distanceMult: 2, damageMult: 1.5 },   // 대시 거리 × 2를 대시 속도로(기획서). 쿨타임·피해 배율 임시
    S004: { id: 'S004', label: '탄 지우기', kind: 'util',   cooldown: 8, radius: 200 },           // 범위·쿨타임 임시
    S005: { id: 'S005', label: '검기',     kind: 'attack', cooldown: 4, damageMult: 1.5, speed: 700, range: 500, diameter: 24 }   // 전부 임시
  }
};
