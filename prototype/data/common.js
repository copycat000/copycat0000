// DT: 공통값
// 단위: 거리 px, 속도 px/초, 시간 초, 각도 도(°), 퍼센트는 0~1 소수(0.05 = 5%)
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};

G.DT.common = {
  tickRate: 60,          // 규칙 계산 횟수(초당). 시뮬 재현용 고정값
  minDamage: 1,          // 최소 피해
  batchInterval: 10,     // 묶음 등장 간격(앞 묶음이 나온 순간부터 셈)
  batchesPerWave: 3,     // 한 웨이브의 묶음 수
  floorCount: 5,         // 이 층까지 깨면 무한 모드
  wavesPerFloor: 5       // 한 층의 웨이브 수(5번째는 보스 웨이브)
};
