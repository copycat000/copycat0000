// DT: 봇 설정 (시스템 기획 6번 봇 기준)
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};

G.DT.bots = {
  // 실력 3단계는 반응 시간 구간으로만 나뉨. 예고마다 구간 안에서 무작위로 뽑음
  // 적 예고 시간을 바꿔도 이 구간은 따라 바꾸지 않음(시스템 기획 6번)
  levels: {
    skilled: { label: '숙련', reaction: [0.2, 0.4] },
    mid:     { label: '중간', reaction: [0.4, 0.7] },
    novice:  { label: '초보', reaction: [0.7, 1.0] }
  },
  levelOrder: ['skilled', 'mid', 'novice'],

  floorTimeLimit: 120,   // 한 층(보스 포함) 제한 시간(초, 전투 시간만). 넘기면 "시간 초과"로 끝. 이정헌 가정값(11/20), 처음 결과 보고 조정
  clearAtFloor: 5,       // 이 층을 깨면 무한 모드 가기 전에 "클리어"로 끝

  // 피하기 방향 고를 때 쓰는 값(구현하면서 정한 임시값, 다시 보기로 확인)
  dodgeDirs: 16,         // 몇 방향을 후보로 놓고 고르는지
  safeMargin: 6,         // 위험 범위에서 이만큼 더 떨어져야 안전으로 봄(px)
  stopInside: 4          // 평타가 닿는 거리보다 이만큼 안쪽에서 멈춤(px)
};
