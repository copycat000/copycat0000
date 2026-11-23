// 기획서 의도 검사 규칙. 규칙 하나 = 이름 / 기획서 문장 / 잴 것 / 맞음 범위
// 사이트용 기획서 페이지가 생기면 sentence를 그 페이지 문장에 붙이고, 이 파일은 거기서 모으는 쪽으로 바꾼다.
// range: [아래, 위]. null은 끝이 없음. range 자체가 null이면 검사 안 함.
// temp: true = 임시 범위(맞음범위_후보.md의 A안). 타디온이 정하면 값 바꾸고 temp를 지움
// get(M): M = sim.agg 결과(M.skilled / M.mid / M.novice). 잰 값 하나를 돌려줌
var G = globalThis.G = globalThis.G || {};
G.Dash = G.Dash || {};

G.Dash.RULES = [
  { id: 'R1', name: '숙련 봇 시간 초과', src: 'DT: 층당 제한 시간',
    sentence: '약한 봇은 시간 초과가 날 수 있다',
    measure: '숙련 봇 시간 초과 비율', unit: '%',
    get: function (M) { return M.skilled.timeout / M.skilled.n * 100; },
    range: [null, 5], temp: true },

  { id: 'R2', name: '1층 보스 처치 시간', src: 'DT: 보스 체력',
    sentence: '카드 없이 약 23초',
    measure: '1층 보스 웨이브 평균 소요 시간(중간 봇)', unit: '초',
    get: function (M) { return M.mid.boss1; },
    range: [20, 26], temp: true },

  { id: 'R3', name: '중간 봇 근거리형 예고', src: 'DT: 봇 실력',
    sentence: '중간은 근거리형 예고를 피하지 못한다',
    measure: '중간 봇이 근거리형 공격에 맞은 비율', unit: '%',
    get: function (M) { return M.mid.hitRate.melee * 100; },
    range: [50, null], temp: true },

  { id: 'R4a', name: '초보 봇 돌진 피하기', src: 'DT: 봇 실력',
    sentence: '초보는 보스 돌진만 피하고 나머지는 거의 맞는다',
    measure: '초보 봇이 돌진에 맞은 비율', unit: '%',
    get: function (M) { return M.novice.hitRate.charge * 100; },
    range: [null, 20], temp: true },

  { id: 'R4b', name: '초보 봇 휘두르기', src: 'DT: 봇 실력',
    sentence: '초보는 보스 돌진만 피하고 나머지는 거의 맞는다',
    measure: '초보 봇이 휘두르기에 맞은 비율', unit: '%',
    get: function (M) { return M.novice.hitRate.slam * 100; },
    range: [70, null], temp: true },

  { id: 'R5', name: '웨이브 4 스폰 그룹 겹침', src: 'DT: 스폰 그룹 간격',
    sentence: '웨이브 4는 앞 그룹을 처치하지 못하고 다음 그룹과 겹친다',
    measure: '웨이브 4에서 앞 그룹이 남은 상태로 다음 그룹이 등장한 비율(중간 봇)', unit: '%',
    get: function (M) { return M.mid.w4over * 100; },
    range: [50, null], temp: true },

  { id: 'R6', name: '근거리형 한 마리는 피할 수 있게', src: 'DT: 대시 쿨타임',
    sentence: '근거리형 한 마리 공격은 매번 피할 수 있게',
    measure: '숙련 봇이 대시 쿨타임 중 근거리형에게 맞은 횟수(플레이 1회당)', unit: '회',
    get: function (M) { return M.skilled.meleeHitDashCd; },
    range: [null, 0.2], temp: true },

  { id: 'R7', name: '평타 쿨타임 감소 한계', src: 'DT: 평타 쿨타임 감소',
    sentence: '플레이 1회에 카드 25장이라 3단계 4장이나 1단계 10장이면 도달할 수 있다',
    measure: '평타 쿨타임이 최소값에 도달한 플레이 비율(세 실력 합)', unit: '%',
    get: function (M) { var t = 0, n = 0; ['skilled', 'mid', 'novice'].forEach(function (l) { t += M[l].cdFloor * M[l].n; n += M[l].n; }); return t / n * 100; },
    range: [5, null], temp: true },

  { id: 'R8', name: '카드가 쌓일수록 파훼 시도', src: '시스템 기획',
    sentence: '카드가 쌓일수록 파훼 시도가 늘어나는 게 드러나게',
    measure: '돌진을 인지했을 때 파훼를 시도한 비율의 5층과 1층 차이(세 실력 중 가장 낮은 값)', unit: '%p',
    get: function (M) {
      var worst = Infinity;
      ['skilled', 'mid', 'novice'].forEach(function (l) {
        var fe = M[l].floorEngage, a = fe[0].rate, b = fe[4].rate;
        if (a !== null && b !== null) worst = Math.min(worst, (b - a) * 100);
      });
      return worst === Infinity ? NaN : worst;
    },
    range: [5, null], temp: true },

  { id: 'R10', name: '공격력, 평타 카드 곱하기', src: '시스템 기획',
    sentence: '공격력, 평타 카드를 같이 모을수록 서로 키워 준다',
    measure: '둘 다 고른 플레이의 초당 피해 증가 − (공격력만 고른 증가 + 평타만 고른 증가), 1층 첫 카드 4장 기준(세 실력 중 가장 낮은 값)', unit: '',
    get: function (M) {
      var worst = Infinity;
      ['skilled', 'mid', 'novice'].forEach(function (l) {
        var s = M[l].syn, base = s.none.dps;
        var v = (s.both.dps - base) - ((s.atk.dps - base) + (s.basic.dps - base));
        if (!isNaN(v)) worst = Math.min(worst, v);
      });
      return worst === Infinity ? NaN : worst;
    },
    fewRuns: function (M) { return ['skilled', 'mid', 'novice'].some(function (l) { return M[l].syn.both.n < 30; }); },
    range: [0, null], temp: true }
];

// 검사: 맞음 / 어긋남 / 범위 미정. 어긋남이면 범위 끝에서 얼마나 벗어났는지(벗어난 양 ÷ 범위 끝 값)로 정도를 나눔
G.Dash.check = function (M) {
  return G.Dash.RULES.map(function (r) {
    var v = r.get(M), res = { id: r.id, v: v };
    if (!r.range) { res.state = 'none'; return res; }
    var lo = r.range[0], hi = r.range[1];
    if (isNaN(v)) { res.state = 'none'; return res; }
    var over = 0, edge = null;
    if (lo !== null && v < lo) { over = lo - v; edge = lo; }
    else if (hi !== null && v > hi) { over = v - hi; edge = hi; }
    if (!over) { res.state = 'ok'; return res; }
    res.state = 'bad'; res.over = over;
    var rel = edge ? over / Math.abs(edge) : Infinity;
    res.level = rel < 0.1 ? 1 : rel < 0.5 ? 2 : 3;          // 1 조금 / 2 많이 / 3 크게
    if (r.fewRuns && r.fewRuns(M)) res.few = true;
    return res;
  });
};
