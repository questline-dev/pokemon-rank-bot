// research/out/audit.json 을 읽어 research.md "결과 요약"에 쓴 숫자를 다시 뽑는다.
// 실행: node research/report.js   (audit.js 를 먼저 돌려야 함)

var fs = require("fs");
var path = require("path");
var a = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "audit.json"), "utf8"));
var R = a.records;
function line(s) { console.log(s); }

line("gamemaster timestamp: " + a.gamemasterTimestamp + " / 검사 시각(UTC): " + a.generatedAt);
line("한국어 이름 " + a.counts.koreanNames + "개, gamemaster 항목 " + a.counts.gamemasterEntries +
    "개 (봇 파서가 읽은 항목 " + a.counts.botParsedEntries + "개, 못 읽은 항목 " + a.parserMissing.length + "개)");

line("\n[1] 이름 조회");
line("  실패: " + R.filter(function (r) { return !r.nameOk; }).length + " / " + R.length);
line("  암수·특수문자 입력: " + a.aliasTests.map(function (t) { return t.input + (t.ok ? " OK" : " 실패(" + t.got + ")"); }).join(", "));
line("  정규화 후 겹치는 이름: " + a.normCollisions.length);
a.bareNidoran.forEach(function (b) { line("  " + b.input + " → " + (b.status || b.head)); });

line("\n[2] 종족값 조회");
line("  실패(\"종족값 정보를 찾지 못했습니다\"): " + R.filter(function (r) { return !r.statsOk; }).length + " / " + R.length);
line("  화면 출력(runCalc) 오류: " + R.filter(function (r) { return r.runCalcError; }).length +
    ", 출력 줄 수 ≠ family 수: " + R.filter(function (r) { return r.bot && r.runCalcLines !== r.bot.length; }).length);
line("  영어 슬러그로 바로 못 찾아 도감번호 폴백을 탄 종: " + R.filter(function (r) { return r.statsOk && !r.targetBySlug; }).length);
line("  PvPoke 기준 전부 released:false 인 종: " + R.filter(function (r) { return r.gmAllUnreleased; }).length);
line("  IV 0/0/0·레벨40 CP로 바꿔도 목록이 같은 종: " + R.filter(function (r) { return r.sameListAtAltIvCp; }).length + " / " + R.length);

line("\n[3] 진화 계열 (기대 목록과 다른 종)");
R.forEach(function (r) {
    if (!(r.missing && r.missing.length) && !(r.extra && r.extra.length)) return;
    line("  " + r.dex + " " + r.name + "  (입력: " + r.input + ")");
    (r.missing || []).forEach(function (m) {
        line("    빠짐  " + m.id + " [" + m.kind + ", gamemaster 연결 " + (m.gmLinked ? "있음" : "없음") +
            (m.released ? "" : ", 미출시") + (m.dataTypo ? ", 데이터 오타 " + m.dataTypo : "") + (m.known ? ", " + m.known : "") + "]");
    });
    (r.extra || []).forEach(function (x) {
        line("    더나옴 " + x.id + " [" + (x.ancestor ? "이전 단계" : "PokeAPI상 진화 관계 없음") + (x.released ? "" : ", 미출시") + "]");
    });
});

line("\n[4] 한 도감번호에 family.id 가 둘 이상이거나 family 있음/없음이 섞인 경우");
a.multiFamily.forEach(function (m) {
    line("  " + m.dex + " " + m.name + ": " + JSON.stringify(m.families) + " / family 없음: " + JSON.stringify(m.noFamily) +
        " / 봇 결과에서 빠진 것: " + JSON.stringify(m.missingInBot));
});

// 같은 도감번호인데 폼마다 진화 대상(evolutions)이 다른 경우 (예: 나옹 → 페르시온/알로라 페르시온/나이킹)
var gmAll = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "gamemaster.json"), "utf8")).pokemon;
var formsByDex = {};
gmAll.forEach(function (e) {
    if (e.speciesId.indexOf("_shadow") !== -1 || (e.tags || []).some(function (t) { return t.indexOf("duplicate") !== -1; })) return;
    if ((e.tags || []).indexOf("mega") !== -1 || e.speciesId.indexOf("_mega") !== -1) return;
    var ev = (e.family && e.family.evolutions) || [];
    if (ev.length) (formsByDex[e.dex] = formsByDex[e.dex] || {})[ev.slice().sort().join("+")] = true;
});
var divergent = Object.keys(formsByDex).filter(function (d) { return Object.keys(formsByDex[d]).length >= 2; });
line("  폼마다 진화 대상이 다른 도감번호 " + divergent.length + "개:");
divergent.forEach(function (d) {
    var r = R.filter(function (x) { return String(x.dex) === d; })[0];
    var miss = (r.missing || []).filter(function (m) { return m.kind !== "other-form-shown"; }).map(function (m) { return m.id; });
    line("    " + d + " " + r.name + " / 봇 결과에서 빠진 것: " + JSON.stringify(miss));
});

line("\n[5] 암수 폼");
a.genderChecks.forEach(function (g) {
    line("  " + g.label + " ← " + g.query + ": 폼 " + g.forms.join(", ") + " / 결과에 나온 폼 " + g.shown.length + "/" + g.forms.length);
});

line("\n[원본 데이터] 가리키는 항목이 없는 evolutions/parent");
a.dangling.forEach(function (d) {
    line("  " + d.from + "." + d.field + " = \"" + d.to + "\"" + (d.closest ? " (비슷한 항목: " + d.closest.id + ")" : ""));
});

// parent 와 evolutions 가 서로 안 맞는 곳 (그림자·duplicate·메가 제외).
// 지역폼처럼 "원종이 부모"인 정상 사례도 섞여 있으니 research.md 에서 하나씩 판단한다.
var gm = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "gamemaster.json"), "utf8")).pokemon;
var byId = {};
gm.forEach(function (e) { byId[e.speciesId] = e; });
function usable(e) {
    return e.speciesId.indexOf("_shadow") === -1 && !(e.tags || []).some(function (t) { return t.indexOf("duplicate") !== -1; });
}
function megaLike(e) { return (e.tags || []).indexOf("mega") !== -1 || e.speciesId.indexOf("_mega") !== -1; }
line("\n[원본 데이터] parent 는 있는데 부모의 evolutions 에는 없는 항목");
gm.forEach(function (e) {
    if (!usable(e) || megaLike(e) || !e.family || !e.family.parent || !byId[e.family.parent]) return;
    var pe = (byId[e.family.parent].family || {}).evolutions || [];
    if (pe.indexOf(e.speciesId) === -1) {
        line("  " + e.speciesId + " (parent=" + e.family.parent + ", 부모 evolutions=" + JSON.stringify(pe) + (e.released === false ? ", 미출시" : "") + ")");
    }
});
line("\n[원본 데이터] evolutions 가 가리키는 대상의 parent 가 다른 항목");
gm.forEach(function (e) {
    if (!usable(e) || !e.family) return;
    (e.family.evolutions || []).forEach(function (t) {
        if (!byId[t]) return;
        var tp = (byId[t].family || {}).parent || null;
        if (tp !== e.speciesId) line("  " + e.speciesId + " → " + t + " (대상의 parent=" + tp + ")");
    });
});
