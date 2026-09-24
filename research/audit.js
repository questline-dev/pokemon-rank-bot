// 조회 누락 전수 점검 스크립트.
// 실행: sh research/fetch-data.sh && node research/audit.js
// 결과: research/out/audit.json (전체), research/out/report.txt (사람이 읽는 요약)
//
// "봇 결과"는 전부 포켓몬랭크봇.html 의 원본 함수를 그대로 불러서 얻는다(load-bot.js).
// "기대 결과(정답)"는 봇 코드와 따로, 아래 규칙으로 직접 만든다.
//   - 진화 방향: PokeAPI pokemon_species.csv 의 evolves_from_species_id 로 자손 도감번호를 구함
//   - 폼 목록: gamemaster.json 에서 그 도감번호들을 쓰는 항목 전부(메가·프라이멀·지역폼 포함)
//   - 제외: 그림자(_shadow / tags "shadow"), tags 에 "duplicate" 가 든 항목 (봇이 일부러 뺌)
// 차이가 나면 gamemaster 의 진화 연결(family.evolutions / family.parent / 메가 태그)을
// 따로 따라가 보고 "코드 누락" / "원본 데이터 문제" / "불확실" 로 나눈다.

var fs = require("fs");
var path = require("path");
var loadBot = require("./load-bot.js").loadBot;

var DATA = path.join(__dirname, "data");
var OUT = path.join(__dirname, "out");

// 검사용 IV·CP 기준: IV 15/15/15, 조회한 종(봇이 고른 target)의 레벨 20 CP
var IV = [15, 15, 15];
var BASE_LEVEL = 20;

// ---------- 봇과 무관한 독립 파서 ----------
function parseCsv(text) {
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
            } else { field += c; }
        } else if (c === '"') { inQ = true; }
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c !== "\r") { field += c; }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    var head = rows.shift();
    return rows.filter(function (r) { return r.length === head.length; }).map(function (r) {
        var o = {};
        head.forEach(function (h, k) { o[h] = r[k]; });
        return o;
    });
}

function read(name) { return fs.readFileSync(path.join(DATA, name), "utf8"); }

function isShadow(e) { return e.speciesId.indexOf("_shadow") !== -1 || (e.tags || []).indexOf("shadow") !== -1; }
function isDup(e) { return (e.tags || []).some(function (t) { return t.indexOf("duplicate") !== -1; }); }
function isMegaLike(e) { return (e.tags || []).indexOf("mega") !== -1 || e.speciesId.indexOf("_mega") !== -1; }

function levenshtein(a, b) {
    var d = [];
    for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (var j = 0; j <= b.length; j++) { d[0][j] = j; }
    for (i = 1; i <= a.length; i++) {
        for (j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return d[a.length][b.length];
}

// 유지보수노트.md "알려진 한계" / "핵심 설계"에 이미 적힌 것
var KNOWN = {
    lycanroc_dusk: "유지보수노트 3번: PvPoke 오타(lycranroc_dusk) 때문에 암멍이(노트 표기 '이니마') 조회 시 황혼폼 누락",
    zygarde_complete: "알려진 한계: 지가르데 퍼펙트폼 (레벨/CP 신뢰 불가)",
    necrozma_ultra: "알려진 한계: 네크로즈마 울트라 (미출시)",
    eternatus_eternamax: "알려진 한계: 에터나투스 이터나맥스 (미출시)",
    silvally: "알려진 한계: 실바리(=PokeAPI 이름 '실버디') (미출시)",
    minior_core: "알려진 한계: 미니오르 두 폼 다 보여줌",
    minior_meteor: "알려진 한계: 미니오르 두 폼 다 보여줌",
    cherrim_overcast: "알려진 한계: 체리코 두 폼 다 보여줌",
    cherrim_sunny: "알려진 한계: 체리코 두 폼 다 보여줌"
};
var GENDER_FORM_DEXES = { 678: "냐오닉스", 876: "에써르(노트엔 '에스퍼로')", 902: "대쓰여너", 916: "퍼퓨돈" };

async function main() {
    var L = loadBot();
    var bot = L.bot;

    var namesCsv = read("pokemon_species_names.csv");
    var gmRaw = read("gamemaster.json");
    var gm = JSON.parse(gmRaw).pokemon;

    var names = parseCsv(namesCsv).filter(function (r) { return r.local_language_id === "3"; });
    var species = parseCsv(read("pokemon_species.csv"));
    var slugOf = {}, parentOf = {}, childrenOf = {};
    species.forEach(function (s) {
        slugOf[s.id] = s.identifier;
        if (s.evolves_from_species_id) {
            parentOf[s.id] = s.evolves_from_species_id;
            (childrenOf[s.evolves_from_species_id] = childrenOf[s.evolves_from_species_id] || []).push(s.id);
        }
    });
    function descendants(id) {
        var out = [], stack = (childrenOf[id] || []).slice();
        while (stack.length) {
            var c = stack.pop();
            if (out.indexOf(c) !== -1) continue;
            out.push(c);
            stack = stack.concat(childrenOf[c] || []);
        }
        return out;
    }
    function ancestors(id) {
        var out = [], cur = parentOf[id], guard = 0;
        while (cur && guard++ < 10) { out.push(cur); cur = parentOf[cur]; }
        return out;
    }

    var byId = {}, byDex = {};
    gm.forEach(function (e) {
        byId[e.speciesId] = e;
        (byDex[e.dex] = byDex[e.dex] || []).push(e);
    });
    var usable = function (e) { return !isShadow(e) && !isDup(e); };

    // ---------- 0. 봇의 gamemaster 파서가 항목을 빠짐없이 읽는지 ----------
    var botEntries = bot.extractPokemonArrayEntries(gmRaw);
    var botParsedIds = {};
    botEntries.forEach(function (s) { try { botParsedIds[JSON.parse(s).speciesId] = true; } catch (e) {} });
    var parserMissing = gm.filter(function (e) { return !botParsedIds[e.speciesId]; }).map(function (e) { return e.speciesId; });

    // ---------- gamemaster 자체의 끊긴 연결(원본 데이터 문제 후보) ----------
    var dangling = [];
    gm.forEach(function (e) {
        if (!e.family) return;
        (e.family.evolutions || []).forEach(function (t) {
            if (!byId[t]) dangling.push({ from: e.speciesId, field: "evolutions", to: t });
        });
        if (e.family.parent && !byId[e.family.parent]) dangling.push({ from: e.speciesId, field: "parent", to: e.family.parent });
    });
    dangling.forEach(function (d) {
        var best = null;
        gm.forEach(function (e) {
            var dist = levenshtein(d.to, e.speciesId);
            if (dist <= 2 && (!best || dist < best.dist)) best = { id: e.speciesId, dist: dist };
        });
        d.closest = best;
    });

    // gamemaster 연결만 따라가는 독립 BFS (분류용). seed = 조회 도감번호의 메가 아닌 항목 전부.
    function gmReach(dex) {
        var seen = {}, queue = (byDex[dex] || []).filter(function (e) { return usable(e) && !isMegaLike(e); })
            .map(function (e) { return e.speciesId; });
        while (queue.length) {
            var id = queue.shift();
            if (seen[id] || !byId[id]) continue;
            seen[id] = true;
            var e = byId[id];
            ((e.family && e.family.evolutions) || []).forEach(function (t) { queue.push(t); });
            gm.forEach(function (c) { if (c.family && c.family.parent === id && usable(c)) queue.push(c.speciesId); });
            // 도달한 도감번호의 메가/프라이멀
            (byDex[e.dex] || []).forEach(function (m) { if (usable(m) && isMegaLike(m)) queue.push(m.speciesId); });
        }
        return seen;
    }

    var records = [];
    var t0 = Date.now();
    names.sort(function (a, b) { return Number(a.pokemon_species_id) - Number(b.pokemon_species_id); });

    for (var ni = 0; ni < names.length; ni++) {
        var sid = names[ni].pokemon_species_id;
        var name = names[ni].name;
        var rec = { dex: Number(sid), name: name, slug: slugOf[sid] };
        records.push(rec);

        // ---------- 1. 이름 조회 ----------
        var found = await bot.findEnglishName(name, namesCsv);
        rec.nameOk = !!(found && found.dex === sid);
        rec.nameFoundDex = found ? found.dex : null;
        if (!found) found = await bot.findEnglishNameBySpeciesId(sid); // 2·3번 검사는 계속 진행

        // ---------- 2. 종족값 조회 ----------
        var gmForDex = (byDex[sid] || []).filter(usable);
        rec.gmEntryCount = gmForDex.length;
        rec.gmAllUnreleased = gmForDex.length > 0 && gmForDex.every(function (e) { return e.released === false; });
        var probe = found ? await bot.getFamilyStats(found.englishName, found.dex, IV[0], IV[1], IV[2], 10) : null;
        if (!probe || !probe.family || probe.family.length === 0) {
            rec.statsOk = false;
            rec.input = name + " 15 15 15 500";
            var rcFail = await L.runCalcText(rec.input);
            rec.botStatus = rcFail.status;
            continue;
        }
        rec.statsOk = true;
        var t = probe.target;
        rec.target = t.speciesId;
        rec.targetBySlug = !!bot.findSpeciesEntry(botEntries, bot.toSpeciesId(found.englishName));
        rec.cp = bot.calcCP(t.baseStats.atk, t.baseStats.def, t.baseStats.hp, IV[0], IV[1], IV[2], bot.levelToIndex(BASE_LEVEL));
        rec.input = name + " " + IV.join(" ") + " " + rec.cp;
        var info = await bot.getFamilyStats(found.englishName, found.dex, IV[0], IV[1], IV[2], rec.cp);
        rec.bot = info.family.map(function (e) { return e.speciesId; });

        // 결과에 나오는 목록이 IV·CP 기준과 무관한지 확인: IV 0/0/0, 레벨 40 CP로 한 번 더
        var alt = t.baseStats;
        var altCp = bot.calcCP(alt.atk, alt.def, alt.hp, 0, 0, 0, bot.levelToIndex(40));
        var infoAlt = await bot.getFamilyStats(found.englishName, found.dex, 0, 0, 0, altCp);
        rec.sameListAtAltIvCp = infoAlt.family.map(function (e) { return e.speciesId; }).join() === rec.bot.join();

        // 화면 출력까지 끝까지 돌려서 에러 없이 줄 수가 맞는지
        var rc = await L.runCalcText(rec.input);
        rec.runCalcError = rc.isError ? rc.status : null;
        rec.runCalcLines = rc.result.split("\n").filter(function (l) { return l.indexOf("- ") === 0; }).length;
        rec.runCalcText = rc.result;

        // ---------- 3. 진화 계열 ----------
        var expDexes = [sid].concat(descendants(sid));
        rec.expectedDexes = expDexes.map(Number);
        var expected = [];
        expDexes.forEach(function (d) { (byDex[d] || []).filter(usable).forEach(function (e) { expected.push(e.speciesId); }); });
        rec.expected = expected;
        var botSet = {}; rec.bot.forEach(function (id) { botSet[id] = true; });
        var expSet = {}; expected.forEach(function (id) { expSet[id] = true; });
        var botDexes = {}; rec.bot.forEach(function (id) { botDexes[byId[id].dex] = true; });
        var reach = gmReach(sid);

        rec.missing = expected.filter(function (id) { return !botSet[id]; }).map(function (id) {
            var e = byId[id];
            var m = { id: id, dex: e.dex, released: e.released !== false, gmLinked: !!reach[id] };
            if (String(e.dex) === sid) m.kind = "same-dex";
            else if (botDexes[e.dex]) m.kind = "other-form-shown";
            else m.kind = "whole-stage";
            var typo = dangling.filter(function (d) { return d.closest && d.closest.id === id; })[0];
            if (typo) m.dataTypo = typo.from + "." + typo.field + ' = "' + typo.to + '"';
            if (KNOWN[id]) m.known = KNOWN[id];
            return m;
        });
        var anc = ancestors(sid);
        rec.extra = rec.bot.filter(function (id) { return !expSet[id]; }).map(function (id) {
            var e = byId[id];
            return { id: id, dex: e.dex, released: e.released !== false, ancestor: anc.indexOf(String(e.dex)) !== -1 };
        });

        if (ni % 100 === 0) console.error("... " + ni + "/" + names.length + " (" + Math.round((Date.now() - t0) / 1000) + "s)");
    }

    // ---------- 1-추가. 암수 접미사 / 특수문자 이름 ----------
    var aliasTests = [
        ["니드런암", "29"], ["니드런암컷", "29"], ["니드런수", "32"], ["니드런수컷", "32"],
        ["폴리곤z", "474"], ["타입널", "772"], ["폴리곤2", "233"]
    ].map(function (p) { return { input: p[0], expect: p[1] }; });
    for (var ai = 0; ai < aliasTests.length; ai++) {
        var f = await bot.findEnglishName(aliasTests[ai].input, namesCsv);
        aliasTests[ai].got = f ? f.dex : null;
        aliasTests[ai].ok = aliasTests[ai].got === aliasTests[ai].expect;
    }
    var bareNidoran = [];
    for (var cpTry of [486, 398, 9999]) {
        var r = await L.runCalcText("니드런 1 11 11 " + cpTry);
        bareNidoran.push({ input: "니드런 1 11 11 " + cpTry, status: r.status, head: r.result.split("\n")[0] });
    }
    // 정규화 후 겹치는 이름 (겹치면 뒤쪽 종은 이름으로 못 찾음)
    var normSeen = {}, normCollisions = [];
    names.forEach(function (r) {
        var k = bot.normalizeKoreanName(r.name);
        if (normSeen[k]) normCollisions.push([normSeen[k], r.name]);
        else normSeen[k] = r.name;
    });

    // ---------- 4. 한 이름(도감번호)에 진화 계열이 둘 이상 ----------
    var multiFamily = [];
    Object.keys(byDex).forEach(function (d) {
        var list = byDex[d].filter(function (e) { return usable(e) && !isMegaLike(e); });
        var fams = {}, noFam = [];
        list.forEach(function (e) {
            if (e.family && e.family.id) (fams[e.family.id] = fams[e.family.id] || []).push(e.speciesId);
            else noFam.push(e.speciesId);
        });
        var famIds = Object.keys(fams);
        if (famIds.length >= 2 || (famIds.length >= 1 && noFam.length >= 1)) {
            var rec2 = records.filter(function (x) { return String(x.dex) === d; })[0];
            multiFamily.push({
                dex: Number(d), name: rec2 ? rec2.name : null, families: fams, noFamily: noFam,
                missingInBot: rec2 && rec2.missing ? rec2.missing.filter(function (m) { return m.kind !== "other-form-shown"; }).map(function (m) { return m.id; }) : null
            });
        }
    });

    // ---------- 5. 암수 폼 4종 ----------
    var genderChecks = [];
    for (var gd in GENDER_FORM_DEXES) {
        var forms = (byDex[gd] || []).filter(function (e) { return usable(e) && !isMegaLike(e); }).map(function (e) { return e.speciesId; });
        var queryDexes = [gd].concat(ancestors(gd));
        queryDexes.forEach(function (qd) {
            var rq = records.filter(function (x) { return String(x.dex) === String(qd); })[0];
            if (!rq) return;
            genderChecks.push({
                formDex: Number(gd), label: GENDER_FORM_DEXES[gd], query: rq.name, input: rq.input,
                forms: forms,
                shown: forms.filter(function (id) { return rq.bot && rq.bot.indexOf(id) !== -1; }),
                text: rq.runCalcText
            });
        });
    }

    var result = {
        generatedAt: new Date().toISOString(),
        gamemasterTimestamp: JSON.parse(gmRaw).timestamp,
        iv: IV, baseLevel: BASE_LEVEL,
        counts: { koreanNames: names.length, gamemasterEntries: gm.length, botParsedEntries: botEntries.length },
        parserMissing: parserMissing,
        dangling: dangling,
        aliasTests: aliasTests, bareNidoran: bareNidoran, normCollisions: normCollisions,
        multiFamily: multiFamily,
        genderChecks: genderChecks,
        records: records,
        fetchCount: L.fetchLog.length
    };
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(result, null, 1));
    console.error("완료: " + records.length + "종, " + Math.round((Date.now() - t0) / 1000) + "초, research/out/audit.json");
}

main().catch(function (e) { console.error(e); process.exit(1); });
