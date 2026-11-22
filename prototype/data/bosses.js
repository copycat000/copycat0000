// DT: 보스. 적 표(G.DT.enemies)에 같은 ID 방식으로 붙여서 웨이브 표에서 ID로 부른다.
// 값은 전부 프로토 임시값(11/20, 지금 플레이어 수치에 맞춰 잡음). DT 문서 '보스 1' 표와 같음
var G = globalThis.G = globalThis.G || {};
G.DT = G.DT || {};
G.DT.enemies = G.DT.enemies || {};

G.DT.enemies.B001 = {
  id: 'B001',
  type: 'boss',
  label: '보스 1 (근접 중장형)',
  bodyDiameter: 64,        // 일반 적(32)의 두 배
  hp: 600,                 // 평타 기대 피해 12.5 / 0.4초 → 쉬지 않고 맞히면 약 20초
  moveSpeed: 120,          // 플레이어(200)보다 느리게
  waitAfter: 0.8,          // 패턴 하나 끝난 뒤 대기
  spawnWait: 1.0,          // 나오고 첫 행동까지
  slam: {                  // 내려찍기(일반 패턴, 슈퍼아머 게이지 없음)
    range: 120,            // 부채꼴 거리(보스 몸 테두리부터)
    angle: 120,
    useDist: 90,           // 몸 테두리끼리 이 거리 안이면 사용. 범위보다 짧게(끝에서 찌르기 방지)
    telegraph: 0.9,
    damage: 20,
    knockbackMult: 1       // 플레이어 넉백 배수
  },
  charge: {                // 돌진(파훼 패턴)
    telegraph: 2.5,        // 1.2 → 2.5(타디온 11/22): 반응하고 다가가는 시간을 넣으면 1.2초는 너무 짧음
    speed: 600,            // 플레이어 대시와 같은 속도
    distance: 500,
    damage: 20,
    cooldown: 8,           // 돌진이 끝난 뒤부터 셈
    armor: 30,             // 예고 동안 생기는 슈퍼아머 게이지. 체력과 같은 피해로 깎임. 테스트용 15에서 문서 값 30으로 되돌림(타디온 11/22)
    knockbackMult: 2       // 플레이어 넉백 2배
  },
  groggy: {
    break: 3,              // 파훼 성공
    wall: 1.5              // 벽 충돌
  }
};
