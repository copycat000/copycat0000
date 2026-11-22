// DT: 스킬 (시스템 기획 7번, DT 문서 '스킬' 칸 11/22). DT 쪽도 근거 데이터 없는 임시값이라 돌려보고 고칠 예정
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};

G.DT.skills = {
  minCooldown: 2,          // 스킬 최소 쿨타임(스킬 쿨타임 감소가 쌓여도 이 밑으로 안 내려감)
  list: {
    S001: { id: 'S001', label: '무적',     kind: 'util',   cooldown: 12, duration: 1 },
    S002: { id: 'S002', label: '회복',     kind: 'util',   cooldown: 30, healRatio: 0.5 },
    S003: { id: 'S003', label: '돌진 베기', kind: 'attack', cooldown: 6, distanceMult: 2, damageMult: 2.0 },   // 거리 240px(대시 × 2), 대시 속도라 0.4초
    S004: { id: 'S004', label: '탄 지우기', kind: 'util',   cooldown: 10, radius: 150 },
    S005: { id: 'S005', label: '검기',     kind: 'attack', cooldown: 4, damageMult: 1.5, speed: 500, range: 400, diameter: 24 }
  }
};
