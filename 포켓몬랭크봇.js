/*
 * ===============================================
 *  포켓몬 IV 랭크체커 봇 (메신저봇R)
 * ===============================================
 *  명령어:
 *   ?포켓몬 <한국어이름> <IV공격> <IV방어> <IV체력> <CP> [최대레벨]
 *   예: ?포켓몬 파이리 0 15 14 395
 *   예(XL 사탕 없이 40렙까지만 키울 예정): ?포켓몬 파이리 0 15 14 395 40
 *
 *   ?포켓몬디버그 <한국어이름>   (이름 조회가 안될 때 진단용)
 *
 * ※ 메신저봇R에서 "네트워크 사용" 권한을 반드시 켜주세요.
 *
 * [동작 원리]
 * 1) PokeAPI 프로젝트의 공개 CSV 데이터(pokemon_species_names.csv)에서
 *    한국어(language_id=3) 이름이 정확히 일치하는 행을 찾아 species_id를 얻고,
 *    pokemon_species.csv에서 그 species_id의 영어 슬러그(예: "charmander")를 찾음
 * 2) PvPoke 프로젝트의 공개 데이터(gamemaster.json)에서 그 영어 슬러그의
 *    종족값(공격/방어/체력)과 진화 계열(같은 family.id) 전체를 가져옴
 *    (메가진화 포함, shadow 폼은 제외)
 * 3) 포켓몬GO의 공개된 CP공식 / CPM표를 이용해서, 슈퍼(1500)/하이퍼(2500)/
 *    마스터(무제한) 리그별로 "입력한 3개 IV가 4096가지 조합 중 몇등인지"를
 *    직접 계산함 (pvpoke.com / stadiumgaming.gg 오픈소스 계산 로직과 동일한 방식)
 *
 * [2026-09 개선: CP 정확도 수정]
 * 이전 버전은 슈퍼/하이퍼리그의 "최적 레벨"도 상한 없이(사실상 50레벨까지)
 * 탐색해버려서, stadiumgaming.gg/rank-checker의 실제 세팅(Min IV: 0,
 * Max Level: 50)과 결과가 어긋나는 경우가 있었음. 표시용 CP/등수 계산의
 * 기본 최대레벨을 사이트 세팅과 동일하게 "50"으로 명시적으로 고정함
 * (XL 사탕 없이 40레벨까지만 키울 예정이면 명령어 맨 뒤에 40을 추가).
 * 여러 포켓몬(파이리~리자몽, 메가리자몽X/Y, 파라꼬 계열)으로 사이트와
 * 직접 대조해서 CP·레벨·등수가 정확히 일치하는 것을 확인했음.
 *
 * [2026-09 개선: IV 입력 순서 버그 수정]
 * 이전 버전은 명령어 순서가 <IV공격> <IV체력> <IV방어> 였는데, 이는 방어/체력
 * IV가 서로 뒤바뀐 채로 계산되는 버그였음. stadiumgaming.gg/pvpoke를 비롯한
 * 표준 도구들은 전부 <공격> <방어> <체력>(ATK/DEF/STA) 순서를 쓰기 때문에,
 * 명령어 순서를 <IV공격> <IV방어> <IV체력>으로 바로잡음. (실제 사이트와 여러
 * 포켓몬으로 대조해서 CP·등수·레벨이 전부 정확히 일치하는 것을 확인했음)
 *
 * [2026-09 개선: 이름 입력 보정]
 * 이름은 콜론(:)/공백/영문 대소문자 차이를 무시하고 비교함 ("타입널", "폴리곤z"도 조회됨).
 * 니드런처럼 한국어 이름이 암수로 나뉜 경우("니드런♀"/"니드런♂")는 "니드런암"/"니드런수"
 * (암컷/수컷, ♀/♂도 가능)로 입력할 수 있고, "니드런"만 치면 입력한 IV로 그 CP가 정확히
 * 나오는 쪽을 골라 계산함. 둘 다 맞거나 둘 다 안 맞으면 암수를 붙여 다시 입력하라고 안내함.
 *
 * [CP 입력값에 대해]
 * 입력한 CP로 "지금 조회한 폼(진화단계)"의 실제 현재 레벨을 역산합니다
 * (이 레벨 역산에는 상한을 두지 않음 - XL 사탕으로 40레벨을 넘겼을 수도
 * 있으므로). 파워업으로 레벨을 낮출 수는 없으므로, 그 현재 레벨에서 다른
 * 진화단계로 진화했을 때의 CP가 리그 상한(슈퍼 1500 / 하이퍼 2500)을
 * 넘으면 그 리그에는 참전이 불가능합니다 -> (X)로 표시합니다.
 * 등수/표시용 CP 자체(몇등인지, 몇 CP인지)는 "최대레벨 50(또는 지정값)"을
 * 기준으로 한 "이 리그에서 낼 수 있는 최선의 CP"이며, (X) 판정과는 별개로
 * 계산됩니다.
 * ===============================================
 */

var Jsoup = org.jsoup.Jsoup;

var SPECIES_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
var SPECIES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species.csv";
var POKEMON_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv";
var POKEMON_FORMS_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_forms.csv";
var KOREAN_LANGUAGE_ID = "3"; // PokeAPI 언어 ID: 1=일본어, 3=한국어, 9=영어 ...
var GAMEMASTER_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json";

// ---------------------------------------------
// 채팅방 화이트리스트
// ---------------------------------------------
// 여기에 방 이름을 넣으면 그 방에서만 봇이 응답합니다 (예: ["포켓몬방", "친구들"]).
// 빈 배열([])로 두면 모든 방에서 응답합니다 (기본값).
var ALLOWED_ROOMS = [];

function isAllowedRoom(room) {
    if (ALLOWED_ROOMS.length === 0) return true;
    return ALLOWED_ROOMS.indexOf(room) !== -1;
}

// ---------------------------------------------
// CPM (레벨별 배수) 표 : 레벨 1 ~ 50, 0.5 단위 (index*0.5 + 1 = 레벨)
// 출처: 포켓몬GO 커뮤니티에 공개된 값 (여러 오픈소스 도구에서 공통으로 사용)
// ---------------------------------------------
var CPM = [0.0939999967813491,0.135137430784308,0.166397869586944,0.192650914456886,0.215732470154762,0.236572655026622,0.255720049142837,0.273530381100769,0.29024988412857,0.306057381335773,0.321087598800659,0.335445032295077,0.349212676286697,0.36245774877879,0.375235587358474,0.387592411085168,0.399567276239395,0.41119354951725,0.422500014305114,0.432926413410414,0.443107545375824,0.453059953871985,0.46279838681221,0.472336077786704,0.481684952974319,0.490855810259008,0.499858438968658,0.508701756943992,0.517393946647644,0.525942508771329,0.534354329109191,0.542635762230353,0.550792694091796,0.558830599438087,0.566754519939422,0.574569148039264,0.582278907299041,0.589887911977272,0.59740000963211,0.604823657502073,0.61215728521347,0.61940411056605,0.626567125320434,0.633649181622743,0.640652954578399,0.647580963301656,0.654435634613037,0.661219263506722,0.667934000492096,0.674581899290818,0.681164920330047,0.687684905887771,0.694143652915954,0.700542893277978,0.706884205341339,0.713169102333341,0.719399094581604,0.725575616972598,0.731700003147125,0.734741011137376,0.737769484519958,0.740785574597326,0.743789434432983,0.746781208702482,0.749761044979095,0.752729105305821,0.75568550825119,0.758630366519684,0.761563837528228,0.764486065255226,0.767397165298461,0.77029727397159,0.77318650484085,0.776064945942412,0.778932750225067,0.781790064808426,0.784636974334716,0.787473583646825,0.790300011634826,0.792803950958807,0.795300006866455,0.79780392148697,0.800300002098083,0.802803892322847,0.805299997329711,0.807803863460723,0.81029999256134,0.812803834895026,0.815299987792968,0.817803806620319,0.820299983024597,0.822803778631297,0.825299978256225,0.827803750922782,0.830299973487854,0.832803753381377,0.835300028324127,0.837803755931569,0.840300023555755];

var ABSOLUTE_MAX_LEVEL_INDEX = CPM.length - 1; // = 98, 레벨 50 (XL 사탕으로 도달 가능한 진짜 최대 레벨)
var DEFAULT_DISPLAY_MAX_LEVEL = 50; // stadiumgaming.gg/rank-checker 세팅값과 동일 (Min IV: 0, Max Level: 50)

function levelToIndex(level) {
    return Math.round((level - 1) * 2);
}

// ---------------------------------------------
// CP / 스탯 계산
// ---------------------------------------------

function calcCP(atk, def, hp, ivA, ivD, ivS, levelIdx) {
    var cpm = CPM[levelIdx];
    var cp = Math.floor((atk + ivA) * Math.sqrt(def + ivD) * Math.sqrt(hp + ivS) * cpm * cpm / 10);
    return Math.max(10, cp);
}

function calcStatProduct(atk, def, hp, ivA, ivD, ivS, levelIdx) {
    var cpm = CPM[levelIdx];
    var aSt = (atk + ivA) * cpm;
    var dSt = (def + ivD) * cpm;
    var sSt = Math.max(10, Math.floor((hp + ivS) * cpm));
    return Math.round(aSt * dSt * sSt);
}

// cap 이하를 만족하는 가장 높은 레벨 인덱스를 이분탐색으로 찾음 (maxLevelIdx를 넘지 않음).
// cap이 null이면 상한이 없다는 뜻 -> maxLevelIdx 그대로 반환.
// 레벨1에서도 cap을 못넘으면 -1(overCap) 반환.
function findBestLevelIndex(atk, def, hp, ivA, ivD, ivS, cap, maxLevelIdx) {
    if (cap == null) return maxLevelIdx;
    if (calcCP(atk, def, hp, ivA, ivD, ivS, 0) > cap) return -1;

    var lo = 0, hi = maxLevelIdx;
    while (lo < hi) {
        var mid = Math.ceil((lo + hi) / 2);
        if (calcCP(atk, def, hp, ivA, ivD, ivS, mid) <= cap) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return lo;
}

// 주어진 종족값 + IV로 특정 CP를 만드는 "진짜" 레벨(인덱스)을 찾음
// (처음 입력받은 CP -> 이 개체의 실제 현재 레벨. XL 사탕으로 40레벨을 넘겼을 수도
//  있으므로 항상 ABSOLUTE_MAX_LEVEL_INDEX(=레벨50)까지 탐색함)
function findLevelForCP(atk, def, hp, ivA, ivD, ivS, targetCP) {
    for (var idx = 0; idx <= ABSOLUTE_MAX_LEVEL_INDEX; idx++) {
        if (calcCP(atk, def, hp, ivA, ivD, ivS, idx) >= targetCP) return idx;
    }
    return ABSOLUTE_MAX_LEVEL_INDEX;
}

// 이 종족값 + IV로 입력한 CP가 "정확히" 나오는 레벨(1~50)이 하나라도 있는지.
// (니드런♀/♂처럼 종족값이 다른 암수 후보 중 실제 개체가 어느 쪽인지 가려낼 때 사용)
function canReachExactCP(stats, ivA, ivD, ivS, targetCP) {
    for (var idx = 0; idx <= ABSOLUTE_MAX_LEVEL_INDEX; idx++) {
        if (calcCP(stats.atk, stats.def, stats.hp, ivA, ivD, ivS, idx) === targetCP) return true;
    }
    return false;
}

// 주어진 종족값(atk,def,hp) + 리그 cap에서, 입력한 IV조합이 4096가지 중 몇 등인지 계산.
// maxLevelIdx: 등수/CP 표시에 사용할 "최대 레벨" 상한 (기본 40레벨, XL 사탕 있으면 50레벨)
// 반환: { rank, overCap, level(레벨 숫자), cp }
function calcRank(atk, def, hp, ivA, ivD, ivS, cap, maxLevelIdx) {
    var levelIdx = findBestLevelIndex(atk, def, hp, ivA, ivD, ivS, cap, maxLevelIdx);
    var overCap = (levelIdx === -1);
    var refLevelIdx = overCap ? 0 : levelIdx;
    var targetSP = calcStatProduct(atk, def, hp, ivA, ivD, ivS, refLevelIdx);
    var targetCP = calcCP(atk, def, hp, ivA, ivD, ivS, refLevelIdx);

    var better = 0;
    for (var a = 0; a <= 15; a++) {
        for (var d = 0; d <= 15; d++) {
            for (var s = 0; s <= 15; s++) {
                var li;
                if (overCap) {
                    li = 0; // 아무도 cap을 못만족하므로 전부 레벨1 기준으로 통일 비교
                } else {
                    li = findBestLevelIndex(atk, def, hp, a, d, s, cap, maxLevelIdx);
                    if (li === -1) continue; // 이 조합은 해당 리그에 아예 참가 불가 -> 비교 제외
                }
                var sp = calcStatProduct(atk, def, hp, a, d, s, li);
                if (sp > targetSP) better++;
            }
        }
    }
    return {
        rank: better + 1,
        overCap: overCap,
        level: 1 + refLevelIdx * 0.5,
        cp: targetCP
    };
}

// ---------------------------------------------
// 한국어 이름 -> 영어 슬러그 (PokeAPI 공개 CSV, raw.githubusercontent.com)
// ---------------------------------------------

function fetchRawText(url) {
    var res = Jsoup.connect(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .ignoreContentType(true)
        .timeout(30000)
        .maxBodySize(0) // 기본 1MB 제한 해제
        .ignoreHttpErrors(true)
        .execute();

    if (res.statusCode() < 200 || res.statusCode() >= 300) {
        throw ("데이터 요청 실패 (HTTP " + res.statusCode() + "): " + url);
    }
    return String(res.body());
}

// 이름 비교용 정규화: 콜론(:)과 공백을 빼고 영문은 대문자로 맞춘다.
// "타입널" = "타입:널", "폴리곤z" = "폴리곤Z" 처럼 입력해도 찾을 수 있게 하기 위함.
// (이름 CSV 안에서 정규화 후 서로 겹치는 이름은 없음을 2026-09-24에 확인)
function normalizeKoreanName(name) {
    return String(name).replace(/[:：\s]/g, "").toUpperCase();
}

// pokemon_species_names.csv 형식: pokemon_species_id,local_language_id,name[,genus]
// 한국어(language_id=3) 행 중 이름이 일치하는 것을 찾아 species_id 반환
// (normalizeKoreanName 기준으로 비교 - 콜론/공백/영문 대소문자 차이는 무시)
function findSpeciesIdByKoreanName(koreanName, csvText) {
    var targetName = normalizeKoreanName(koreanName);
    var lines = csvText.split("\n");
    for (var i = 1; i < lines.length; i++) { // 0번째는 헤더 행
        var line = lines[i];
        if (line.length === 0) continue;
        if (line.charAt(line.length - 1) === '\r') line = line.substring(0, line.length - 1);

        var i1 = line.indexOf(',');
        if (i1 === -1) continue;
        var i2 = line.indexOf(',', i1 + 1);
        if (i2 === -1) continue;

        var langId = line.substring(i1 + 1, i2);
        if (langId !== KOREAN_LANGUAGE_ID) continue;

        var i3 = line.indexOf(',', i2 + 1);
        var name = (i3 === -1) ? line.substring(i2 + 1) : line.substring(i2 + 1, i3);

        if (normalizeKoreanName(name) === targetName) {
            return line.substring(0, i1);
        }
    }
    return null;
}

// ---------------------------------------------
// 암수로 이름이 나뉜 포켓몬 (니드런♀ / 니드런♂)
// ---------------------------------------------
// PokeAPI 한국어 이름에는 니드런만 "니드런♀", "니드런♂"처럼 암수 기호가 붙어 있어서,
// "니드런"만 치면 정확히 일치하는 이름이 없다. 폰에서 ♀♂를 치기 번거로우므로
// 이름 끝의 "암/암컷"은 ♀, "수/수컷"은 ♂로 바꿔서 찾는다.
// (원래 이름으로 못 찾았을 때만 적용 - "루가루암"처럼 원래 "암"으로 끝나는 이름 보호)
var GENDER_ALIASES = [["암컷", "♀"], ["수컷", "♂"], ["암", "♀"], ["수", "♂"]];
var GENDER_SYMBOLS = ["♀", "♂"];

// "니드런암" -> "니드런♀" 의 species_id. 해당 없으면 null.
function findSpeciesIdByGenderAlias(koreanName, namesCsv) {
    for (var i = 0; i < GENDER_ALIASES.length; i++) {
        var suffix = GENDER_ALIASES[i][0];
        if (koreanName.length <= suffix.length) continue;
        if (koreanName.substring(koreanName.length - suffix.length) !== suffix) continue;
        var aliased = koreanName.substring(0, koreanName.length - suffix.length) + GENDER_ALIASES[i][1];
        var speciesId = findSpeciesIdByKoreanName(aliased, namesCsv);
        if (speciesId) return speciesId;
    }
    return null;
}

// "니드런"처럼 암수 표시 없이 입력했을 때, 이름 CSV에 있는 암수 후보들을 돌려줌.
// 반환 예: [{ name: "니드런♀", speciesId: "29" }, { name: "니드런♂", speciesId: "32" }] (없으면 빈 배열)
function findGenderCandidates(koreanName, namesCsv) {
    var result = [];
    for (var i = 0; i < GENDER_SYMBOLS.length; i++) {
        var name = koreanName + GENDER_SYMBOLS[i];
        var speciesId = findSpeciesIdByKoreanName(name, namesCsv);
        if (speciesId) result.push({ name: name, speciesId: speciesId });
    }
    return result;
}

// pokemon_species.csv 형식: id,identifier,generation_id, ...
// species_id에 해당하는 영어 슬러그(identifier, 예: "charmander")를 찾음
function findEnglishSlugBySpeciesId(speciesId, csvText) {
    var lines = csvText.split("\n");
    var needle = speciesId + ",";
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (line.length === 0) continue;
        if (line.charAt(line.length - 1) === '\r') line = line.substring(0, line.length - 1);

        if (line.indexOf(needle) === 0) {
            var i1 = line.indexOf(',');
            var i2 = line.indexOf(',', i1 + 1);
            return (i2 === -1) ? line.substring(i1 + 1) : line.substring(i1 + 1, i2);
        }
    }
    return null;
}

// { dex: "710", englishName: "pumpkaboo" } 형태로 반환 (dex는 getFamilyStats의
// 폴백 검색에 쓰임 - 호바귀처럼 gamemaster에 "기본형" 단독 항목이 없는 경우 대비)
function findEnglishName(koreanName, namesCsv) {
    var speciesId = findSpeciesIdByKoreanName(koreanName, namesCsv) ||
        findSpeciesIdByGenderAlias(koreanName, namesCsv);
    if (!speciesId) return null;
    return findEnglishNameBySpeciesId(speciesId);
}

function findEnglishNameBySpeciesId(speciesId) {
    var speciesCsv = fetchRawText(SPECIES_CSV_URL);
    var englishName = findEnglishSlugBySpeciesId(speciesId, speciesCsv); // 예: "charmander"
    if (!englishName) return null;
    return { dex: speciesId, englishName: englishName };
}

// species_id(=도감번호) -> 한국어 이름 맵 생성 (pokemon_species_names.csv, language_id=3)
// gamemaster.json의 각 폼(리전폼/메가 등)은 dex가 원종과 동일하므로, 이 맵으로
// 어떤 폼이든 "원종 한국어 이름"을 바로 찾을 수 있음.
function buildKoreanNameMap(namesCsv) {
    var map = {};
    var lines = namesCsv.split("\n");
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (line.length === 0) continue;
        if (line.charAt(line.length - 1) === '\r') line = line.substring(0, line.length - 1);

        var i1 = line.indexOf(',');
        if (i1 === -1) continue;
        var i2 = line.indexOf(',', i1 + 1);
        if (i2 === -1) continue;

        var langId = line.substring(i1 + 1, i2);
        if (langId !== KOREAN_LANGUAGE_ID) continue;

        var speciesId = line.substring(0, i1);
        var i3 = line.indexOf(',', i2 + 1);
        var name = (i3 === -1) ? line.substring(i2 + 1) : line.substring(i2 + 1, i3);

        if (!(speciesId in map)) map[speciesId] = name;
    }
    return map;
}

// 진단용
function debugFindEnglishName(koreanName) {
    var msg = "";
    var namesCsv;
    try {
        namesCsv = fetchRawText(SPECIES_NAMES_CSV_URL);
        msg += "이름 CSV 길이: " + namesCsv.length + "\n";
    } catch (e) {
        return msg + "이름 CSV 요청 실패: " + e;
    }

    var speciesId = findSpeciesIdByKoreanName(koreanName, namesCsv);
    msg += "매칭된 species_id: " + speciesId + "\n";
    if (!speciesId) {
        return msg + "'" + koreanName + "' 을(를) 이름 CSV에서 찾지 못했습니다.";
    }

    var speciesCsv;
    try {
        speciesCsv = fetchRawText(SPECIES_CSV_URL);
        msg += "species CSV 길이: " + speciesCsv.length + "\n";
    } catch (e) {
        return msg + "species CSV 요청 실패: " + e;
    }

    var slug = findEnglishSlugBySpeciesId(speciesId, speciesCsv);
    msg += "영어 슬러그: " + slug + "\n";
    if (!slug) return msg;

    var gmRaw;
    try {
        gmRaw = fetchGamemasterRaw();
        msg += "gamemaster 길이: " + gmRaw.length + "\n";
    } catch (e) {
        return msg + "gamemaster 요청 실패: " + e;
    }

    var keyIdx = gmRaw.indexOf('"speciesId"');
    msg += "\"speciesId\" 첫 등장 위치: " + keyIdx + "\n";
    var entries = extractPokemonArrayEntries(gmRaw);
    msg += "추출된 엔트리 개수: " + entries.length + "\n";
    if (entries.length === 0 && keyIdx !== -1) {
        var s = Math.max(0, keyIdx - 100);
        var e = Math.min(gmRaw.length, keyIdx + 200);
        msg += "\"speciesId\" 주변 원본:\n" + gmRaw.substring(s, e) + "\n";
    }

    var target = findSpeciesEntry(entries, toSpeciesId(slug));
    if (target) {
        msg += "species 엔트리 찾음. atk=" + target.baseStats.atk +
            " def=" + target.baseStats.def + " hp=" + target.baseStats.hp +
            " family=" + (target.family ? target.family.id : "(없음)");
    } else {
        msg += "gamemaster에서 speciesId=\"" + toSpeciesId(slug) + "\" 를 찾지 못함.";
        if (entries.length > 0) {
            msg += "\n첫 엔트리 앞부분: " + entries[0].substring(0, 200);
        }
    }
    return msg;
}

// ---------------------------------------------
// 영어 이름 -> 종족값 + 진화계열 (PvPoke gamemaster.json)
// ---------------------------------------------

function toSpeciesId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function fetchGamemasterRaw() {
    var res = Jsoup.connect(GAMEMASTER_URL)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .ignoreContentType(true)
        .timeout(30000)
        .maxBodySize(0) // 기본 1MB 제한 해제 (파일이 수 MB 이상임)
        .execute();
    return String(res.body());
}

// "pokemon":[ {..},{..}, ... ] 부분에서 각 { } 객체를 문자열 단위로 잘라냄
// (중괄호 깊이를 직접 세어가며 자름 - 문자열 안의 따옴표/이스케이프 처리 포함)
function splitTopLevelObjects(s, startIdx) {
    var entries = [];
    var i = startIdx;
    var len = s.length;
    while (i < len) {
        while (i < len) {
            var ch = s.charAt(i);
            if (ch === ',' || ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; }
            else { break; }
        }
        if (i >= len || s.charAt(i) === ']') break;
        if (s.charAt(i) !== '{') break;

        var start = i;
        var depth = 0;
        var inStr = false;
        var escape = false;
        for (; i < len; i++) {
            var c = s.charAt(i);
            if (inStr) {
                if (escape) { escape = false; }
                else if (c === '\\') { escape = true; }
                else if (c === '"') { inStr = false; }
            } else {
                if (c === '"') { inStr = true; }
                else if (c === '{') { depth++; }
                else if (c === '}') {
                    depth--;
                    if (depth === 0) { i++; break; }
                }
            }
        }
        entries.push(s.substring(start, i));
    }
    return entries;
}

function extractPokemonArrayEntries(raw) {
    var anchorKey = '"speciesId"';
    var anchorIdx = raw.indexOf(anchorKey);
    if (anchorIdx === -1) return [];
    var objStart = raw.lastIndexOf('{', anchorIdx);
    if (objStart === -1) return [];
    return splitTopLevelObjects(raw, objStart);
}

function findSpeciesEntry(entries, speciesId) {
    var re = new RegExp('"speciesId"\\s*:\\s*"' + speciesId + '"');
    for (var i = 0; i < entries.length; i++) {
        if (re.test(entries[i])) {
            try {
                var obj = JSON.parse(entries[i]);
                if (obj.speciesId === speciesId) return obj;
            } catch (e) {}
        }
    }
    return null;
}

// 도감번호(dex)로 같은 종의 폼 후보들을 모음 (shadow/메가 제외).
// 호바귀(pumpkaboo)처럼 gamemaster에 "기본형" 단독 항목이 없고
// pumpkaboo_average/large/small/super 처럼 하위 폼으로만 쪼개져 있는 경우를 위한 것.
// gamemaster.json에는 란턴(lanturnw)/골리스콜피(golisopodsh)처럼 tags에 "duplicate"가
// 붙은, 원본과 종족값이 완전히 똑같은 중복 항목이 몇 개 있다. 그대로 두면 결과에
// 똑같은 줄이 두 번 찍히므로 제외한다.
function hasDuplicateTag(obj) {
    if (!obj.tags) return false;
    for (var i = 0; i < obj.tags.length; i++) {
        if (obj.tags[i].indexOf('duplicate') !== -1) return true;
    }
    return false;
}

// 메가/프라이멀 같은 "일시적 변신" 폼 판정. gamemaster.json이 프라이멀도 메가와
// 동일하게 tags:["mega"]로 표시해주므로 그 표식을 우선 쓰고, speciesId에 "_mega"가
// 들어간 경우도 이중으로 걸러서 잡는다.
function isTransientBattleForm(entry) {
    if (entry.tags && entry.tags.indexOf('mega') !== -1) return true;
    return entry.speciesId.indexOf('_mega') !== -1;
}

// 대짱이(swampert_mega)처럼 메가폼인데 family 필드가 아예 없는 경우(진화계열의
// family.id 목록에 절대 안 걸림 - 리자몽 메가처럼 family.id는 있고 parent만
// 건너뛰는 경우와는 다른 패턴)를 위해, dex 목록을 받아 그 dex들과 일치하는
// 메가/프라이멀 폼을 직접 찾아준다.
function findTransientFormsForDexes(entries, dexList) {
    var dexSet = {};
    for (var i = 0; i < dexList.length; i++) dexSet[dexList[i]] = true;
    var result = [];
    for (i = 0; i < entries.length; i++) {
        if (entries[i].indexOf('"mega"') === -1 && entries[i].indexOf('_mega') === -1) continue; // 빠른 사전필터
        try {
            var obj = JSON.parse(entries[i]);
            if (dexSet[obj.dex] &&
                obj.speciesId.indexOf('_shadow') === -1 &&
                isTransientBattleForm(obj) &&
                !hasDuplicateTag(obj)) {
                result.push(obj);
            }
        } catch (e) {}
    }
    return result;
}

// 산호르곤(cursola)처럼, 자기 자신은 family.id/evolutions를 정상적으로 갖고 있지만
// "부모"(코산호 - dex 222, family 필드 자체가 아예 없음)쪽에서는 진화 정보를 전혀 들고
// 있지 않아서 어느 쪽에서도 못 찾아지는 경우를 위한 것. family.parent가 주어진 종
// 목록(들) 중 하나를 가리키는 항목을 역방향으로 찾아준다.
function findChildrenByParent(entries, parentSpeciesIds) {
    var parentSet = {};
    for (var i = 0; i < parentSpeciesIds.length; i++) parentSet[parentSpeciesIds[i]] = true;
    var result = [];
    for (i = 0; i < entries.length; i++) {
        if (entries[i].indexOf('"parent"') === -1) continue; // 빠른 사전필터
        try {
            var obj = JSON.parse(entries[i]);
            var parent = (obj.family && obj.family.parent) ? obj.family.parent : null;
            if (parent && parentSet[parent] &&
                obj.speciesId.indexOf('_shadow') === -1 &&
                !hasDuplicateTag(obj)) {
                result.push(obj);
            }
        } catch (e) {}
    }
    return result;
}

function collectDexCandidates(entries, dex) {
    var re = new RegExp('"dex"\\s*:\\s*' + dex + '\\D');
    var result = [];
    for (var i = 0; i < entries.length; i++) {
        if (re.test(entries[i])) {
            try {
                var obj = JSON.parse(entries[i]);
                if (String(obj.dex) === String(dex) &&
                    obj.speciesId.indexOf('_shadow') === -1 &&
                    obj.speciesId.indexOf('_mega') === -1 &&
                    !hasDuplicateTag(obj)) {
                    result.push(obj);
                }
            } catch (e) {}
        }
    }
    return result;
}

// pokemon.csv: id,identifier,species_id,height,weight,base_experience,order,is_default
function findVarietiesByDex(pokemonCsv, dex) {
    var result = [];
    var lines = pokemonCsv.split("\n");
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (line.length === 0) continue;
        if (line.charAt(line.length - 1) === '\r') line = line.substring(0, line.length - 1);
        var cols = line.split(",");
        if (cols.length < 8) continue;
        if (cols[2] === String(dex)) {
            result.push({ id: cols[0], identifier: cols[1], isDefault: cols[7] === "1" });
        }
    }
    return result;
}

// pokemon_forms.csv: id,identifier,form_identifier,pokemon_id,introduced_in_version_group_id,is_default,is_battle_only,is_mega,form_order,order
function findFormsByPokemonId(formsCsv, pokemonId) {
    var result = [];
    var lines = formsCsv.split("\n");
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (line.length === 0) continue;
        if (line.charAt(line.length - 1) === '\r') line = line.substring(0, line.length - 1);
        var cols = line.split(",");
        if (cols.length < 9) continue;
        if (cols[3] === pokemonId) {
            result.push({ formIdentifier: cols[2], isDefault: cols[5] === "1" });
        }
    }
    return result;
}

// dex의 세부 폼 목록을 (구성단어 배열, 기본폼 여부)로 펼침.
// PokeAPI는 폼 분화를 두 방식으로 표현함: (a) 폼마다 별도 pokemon row (예: 다르만인탄/자시안),
// (b) pokemon row 하나에 폼(form) 여러 개 (예: 버비/체리코) - 둘 다 처리.
function flattenPokemonForms(pokemonCsv, formsCsv, dex) {
    var varieties = findVarietiesByDex(pokemonCsv, dex);
    var flat = [];
    for (var i = 0; i < varieties.length; i++) {
        var v = varieties[i];
        var forms = findFormsByPokemonId(formsCsv, v.id);
        if (forms.length <= 1) {
            flat.push({ words: v.identifier.split("-"), isDefault: v.isDefault });
        } else {
            for (var j = 0; j < forms.length; j++) {
                var words = v.identifier.split("-");
                if (forms[j].formIdentifier) words = words.concat(forms[j].formIdentifier.split("-"));
                flat.push({ words: words, isDefault: forms[j].isDefault });
            }
        }
    }
    return flat;
}

// gamemaster 후보들 중 "기본 폼이 아닌 쪽에만 쓰이는 단어"가 이름에 없는 후보를
// 기본 폼으로 추정. 정확히 하나로 좁혀질 때만 채택하고, 애매하면 null(폴백으로 위임).
// 예: 자시안 - PokeAPI 비기본폼 identifier "zacian-crowned"에서 "crowned"를 뽑아,
//     이 단어가 들어간 gamemaster 후보(zacian_crowned_sword)는 제외 -> zacian_hero만 남음.
function pickDefaultFormEntry(candidates, flatForms) {
    if (flatForms.length <= 1) return null;

    var defaultWords = {};
    var i, j;
    for (i = 0; i < flatForms.length; i++) {
        if (!flatForms[i].isDefault) continue;
        for (j = 0; j < flatForms[i].words.length; j++) defaultWords[flatForms[i].words[j]] = true;
    }

    var forbidden = {};
    for (i = 0; i < flatForms.length; i++) {
        if (flatForms[i].isDefault) continue;
        for (j = 0; j < flatForms[i].words.length; j++) {
            var w = flatForms[i].words[j];
            if (w && !defaultWords[w]) forbidden[w] = true;
        }
    }

    var remaining = [];
    for (i = 0; i < candidates.length; i++) {
        var hasForbidden = false;
        for (var word in forbidden) {
            if (forbidden.hasOwnProperty(word) && candidates[i].speciesId.indexOf(word) !== -1) {
                hasForbidden = true;
                break;
            }
        }
        if (!hasForbidden) remaining.push(candidates[i]);
    }
    return (remaining.length === 1) ? remaining[0] : null;
}

// 정확한 이름 일치로 못 찾았을 때의 대표 폼 결정.
// 1) PokeAPI의 공식 "기본 폼(is_default)" 데이터로 후보를 좁혀봄 (자시안/자마젠타/
//    다르만인탄/에이스간 등 대부분 이렇게 정확히 해결됨)
// 2) 그래도 하나로 안 좁혀지면(미니오르처럼 폼이 너무 많거나 이름 표기가 다른 경우)
//    shadow/메가가 아닌 첫 항목을 최후 수단으로 사용 (완벽하진 않음)
function findDefaultDexEntry(entries, dex) {
    var candidates = collectDexCandidates(entries, dex);
    if (candidates.length <= 1) return candidates[0] || null;
    try {
        var pokemonCsv = fetchRawText(POKEMON_CSV_URL);
        var formsCsv = fetchRawText(POKEMON_FORMS_CSV_URL);
        var flat = flattenPokemonForms(pokemonCsv, formsCsv, dex);
        var picked = pickDefaultFormEntry(candidates, flat);
        if (picked) return picked;
    } catch (e) {
        // 네트워크 실패 등은 조용히 최후 수단으로 넘어감
    }
    return candidates[0];
}

function findFamilyMembers(entries, familyId) {
    var re = new RegExp('"id"\\s*:\\s*"' + familyId + '"');
    var result = [];
    var seen = {};
    for (var i = 0; i < entries.length; i++) {
        if (re.test(entries[i])) {
            try {
                var obj = JSON.parse(entries[i]);
                if (obj.family && obj.family.id === familyId && obj.speciesId.indexOf('_shadow') === -1 && !hasDuplicateTag(obj)) {
                    result.push(obj);
                    seen[obj.speciesId] = true;
                }
            } catch (e) {}
        }
    }

    // 트리토돈(gastrodon)처럼 진화 대상인데 정작 자기 자신은 family 정보가 아예 없어서
    // (family.id로 찾는) 위 스캔에 안 걸리는 경우를 보정: 이미 모은 멤버들의
    // evolutions가 가리키는 대상을 이름으로 직접 찾아서 추가한다(고정점 반복 - 그렇게
    // 추가된 항목이 또 다른 family-less 진화대상을 가리킬 수도 있으므로).
    var changed = true;
    while (changed) {
        changed = false;
        for (var j = 0; j < result.length; j++) {
            var evos = (result[j].family && result[j].family.evolutions) ? result[j].family.evolutions : [];
            for (var k = 0; k < evos.length; k++) {
                if (seen[evos[k]]) continue;
                seen[evos[k]] = true; // 못 찾아도 다시 시도하지 않도록 먼저 표시
                var found = findSpeciesEntry(entries, evos[k]);
                if (found && found.speciesId.indexOf('_shadow') === -1 && !hasDuplicateTag(found)) {
                    result.push(found);
                    changed = true;
                }
            }
        }
    }

    return result;
}

function getFamilyStats(englishName, dex, ivAtk, ivDef, ivSta, cp) {
    var speciesId = toSpeciesId(englishName);
    var raw = fetchGamemasterRaw();
    var entries = extractPokemonArrayEntries(raw);
    var target = findSpeciesEntry(entries, speciesId);
    if (!target && dex) target = findDefaultDexEntry(entries, dex);
    if (!target) return null;
    // family.id가 없는 경우(진화 없는 단일 개체, 또는 자시안/미니오르처럼 진화 대신
    // "폼"으로만 여러 상태가 나뉘는 경우)에는 같은 dex를 쓰는 모든 후보를 보여준다.
    // 봇이 실제 어느 폼(예: 자시안 각성 vs 각성해제, 미니오르 코어 vs 유성)인지 알 방법이
    // 없으므로, 하나를 임의로 고르는 대신 전부 보여주고 사용자가 CP로 맞는 줄을 찾게 한다.
    var family = (!target.family || !target.family.id)
        ? collectDexCandidates(entries, target.dex)
        : findFamilyMembers(entries, target.family.id);
    if (family.length === 0) family = [target];

    // 우파(Wooper)/팔데아 우파처럼, 한글이름 하나가 서로 다른 진화계열(다른 family.id)을
    // 쓰는 지역폼 두 개를 가리킬 수 있다 - PokeAPI 한글이름은 지역폼을 구분 안 해서
    // 둘 다 "우파"로 매칭되는데, 우리는 그중 정확히 slug가 일치한 하나(예: 일반 우파 ->
    // 니드퀸이 아니라 두꺼비집 계열)의 family.id만 펼쳐서 나머지 계열(팔데아 우파 ->
    // 베라모스)이 통째로 빠지고 있었다(2026-09-14, 사용자가 팔데아 우파가 안 나온다고
    // 신고해서 발견). 같은 dex를 쓰는 다른 후보 중 "이미 모은 것과 다른 family.id"를
    // 쓰는 형제가 있으면 그 계열 전체를 findFamilyMembers로 마저 펼쳐서 합친다.
    var dexSiblings = collectDexCandidates(entries, target.dex);
    var knownFamilyIds = {};
    var knownSpeciesIdsSoFar = {};
    var dsi;
    for (dsi = 0; dsi < family.length; dsi++) {
        knownSpeciesIdsSoFar[family[dsi].speciesId] = true;
        if (family[dsi].family && family[dsi].family.id) knownFamilyIds[family[dsi].family.id] = true;
    }
    for (dsi = 0; dsi < dexSiblings.length; dsi++) {
        var sib = dexSiblings[dsi];
        if (knownSpeciesIdsSoFar[sib.speciesId]) continue;
        if (sib.family && sib.family.id) {
            if (knownFamilyIds[sib.family.id]) continue;
            var sibFamily = findFamilyMembers(entries, sib.family.id);
            for (var sfi = 0; sfi < sibFamily.length; sfi++) {
                if (!knownSpeciesIdsSoFar[sibFamily[sfi].speciesId]) {
                    family.push(sibFamily[sfi]);
                    knownSpeciesIdsSoFar[sibFamily[sfi].speciesId] = true;
                }
            }
            knownFamilyIds[sib.family.id] = true;
        } else {
            family.push(sib);
            knownSpeciesIdsSoFar[sib.speciesId] = true;
        }
    }

    // 산호르곤(cursola)처럼, 조회한 종 자체(코산호 등)가 family 정보를 아예 안 갖고 있어서
    // (위에서 collectDexCandidates 경로를 탔을 때) 진화형을 정방향으로 찾을 방법이 없는
    // 경우를 보정한다. family.parent가 지금까지 모은 후보들 중 하나를 가리키는 항목을
    // 역방향으로 찾아서 합친다. 그 항목이 자기 family.id를 갖고 있으면(대개 그럼) 그
    // family.id로 findFamilyMembers를 한 번 더 돌려서 그쪽의 형제/진화형까지 같이 챙긴다.
    if (!target.family || !target.family.id) {
        var baseSpeciesIds = [];
        for (var bi = 0; bi < family.length; bi++) baseSpeciesIds.push(family[bi].speciesId);
        var knownIdsForChildren = {};
        for (bi = 0; bi < family.length; bi++) knownIdsForChildren[family[bi].speciesId] = true;
        var children = findChildrenByParent(entries, baseSpeciesIds);
        for (var ci = 0; ci < children.length; ci++) {
            var child = children[ci];
            if (knownIdsForChildren[child.speciesId]) continue;
            if (child.family && child.family.id) {
                var childFamily = findFamilyMembers(entries, child.family.id);
                for (var cfi = 0; cfi < childFamily.length; cfi++) {
                    if (!knownIdsForChildren[childFamily[cfi].speciesId]) {
                        family.push(childFamily[cfi]);
                        knownIdsForChildren[childFamily[cfi].speciesId] = true;
                    }
                }
            } else {
                family.push(child);
                knownIdsForChildren[child.speciesId] = true;
            }
        }
    }

    // 대짱이(swampert_mega)처럼 메가폼의 family 필드가 아예 없어서(리자몽 메가처럼
    // family.id는 있고 parent만 최종진화체를 건너뛰는 것과는 다른 패턴) 위의
    // findFamilyMembers(family.id 매칭)에 애초에 안 걸리는 경우를 보정한다.
    // family 안의 각 단계와 같은 dex를 쓰는 메가/프라이멀 폼을 별도로 찾아서 합친다.
    var knownIds = {}, knownDex = [], fi;
    for (fi = 0; fi < family.length; fi++) {
        knownIds[family[fi].speciesId] = true;
        knownDex.push(family[fi].dex);
    }
    var missingTransientForms = findTransientFormsForDexes(entries, knownDex);
    for (fi = 0; fi < missingTransientForms.length; fi++) {
        if (!knownIds[missingTransientForms[fi].speciesId]) {
            family.push(missingTransientForms[fi]);
            knownIds[missingTransientForms[fi].speciesId] = true;
        }
    }

    family = collectReachableFromTarget(family, target, ivAtk, ivDef, ivSta, cp);
    return { target: target, family: family };
}

// family(같은 진화계열/사이즈 묶음) 중, "조회한 개체 기준으로 실제 가능한 범위"만 추려냄.
// 이미 진화한 개체는 이전 단계로 되돌아갈 수 없으므로 조상 단계는 제외하고,
// 앞으로 진화 가능한 단계(메가진화 포함)는 유지한다.
// (PvPoke 데이터상 메가폼은 family.parent가 "최종진화체 바로 이전 단계"를 가리켜 최종진화체를
//  건너뛰므로, 단순 정방향 진화(evolutions) 그래프만으로는 못 찾음 - "메가가 최종적으로
//  붙는 정상 진화체가 이미 도달 범위 안에 있는지"로 보정함)
// 호바귀/펌킨인처럼 같은 도감번호에 사이즈(Small/Average/Large/Super)별로 여러 항목이
// 있는 경우, 봇이 실제 개체 사이즈를 알 방법이 없으므로 "조회한 단계"의 사이즈 전부를
// 시작점(seed)으로 삼아 같이 보여준다 (사용자가 자기 CP와 맞는 줄을 직접 찾을 수 있게).
//
// 사이즈마다 종족값이 달라서 "같은 CP를 만드는 실제 레벨"도 사이즈별로 다르다
// (예: IV12/12/12 CP1497 -> Small은 lvl24, Super는 lvl20.5에서 각각 정확히 나옴).
// 그래서 (X) 판정에 쓰는 "현재 레벨"은 사이즈(=시작점) 단위로 각자 따로 구하고,
// 그 사이즈에서 진화한 단계/메가는 같은 레벨을 그대로 물려받는다(진화해도 레벨은 안 바뀌므로).
// 결과 배열의 각 항목에 그 레벨(_currentLevelIdx)을 붙여서 돌려준다.
function collectReachableFromTarget(family, target, ivAtk, ivDef, ivSta, cp) {
    var map = {}, i;
    for (i = 0; i < family.length; i++) map[family[i].speciesId] = family[i];

    var isEvolutionTarget = {};
    for (i = 0; i < family.length; i++) {
        var evos = (family[i].family && family[i].family.evolutions) ? family[i].family.evolutions : [];
        for (var j = 0; j < evos.length; j++) isEvolutionTarget[evos[j]] = true;
    }

    function walkToLeaf(speciesId) {
        var current = speciesId, guard = 0;
        while (guard < 20) {
            var entry = map[current];
            var evolutions = (entry && entry.family && entry.family.evolutions) ? entry.family.evolutions : [];
            if (evolutions.length === 0) return current;
            current = evolutions[0];
            guard++;
        }
        return current;
    }

    // 메가/프라이멀 같은 "일시적 변신" 폼은 dex가 원종(예: 리자몽/케이오가)과 같지만
    // 독립적으로 조회되는 개체가 아니라 "그 원종이 일시적으로 변신한 상태"라 따로 CP를
    // 역산하면 안 된다. gamemaster.json이 프라이멀도 메가와 동일하게 tags:["mega"]로
    // 표시해주므로(케이오가/그란돈 프라이멀 확인됨) 그 표식을 우선 쓰고, speciesId에
    // "_mega"가 들어간 경우도 이중으로 걸러서 제외한다.
    // (예외: 이 표식이 없는 극소수 변신폼 - 예: 지가르데 퍼펙트폼 - 은 아직 못 잡아냄.
    // 이런 폼은 실제 게임에서 흔히 조회될 일이 적어 이번 라운드에서는 보류함)
    var seeds = [];
    for (i = 0; i < family.length; i++) {
        if (family[i].dex === target.dex && !isTransientBattleForm(family[i])) {
            seeds.push(family[i].speciesId);
        }
    }
    if (seeds.length === 0) seeds = [target.speciesId];

    var reachable = {};
    var levelIdxOf = {};
    var queue = [];
    for (i = 0; i < seeds.length; i++) {
        var seedEntry = map[seeds[i]];
        var seedLevelIdx = seedEntry
            ? findLevelForCP(seedEntry.baseStats.atk, seedEntry.baseStats.def, seedEntry.baseStats.hp, ivAtk, ivDef, ivSta, cp)
            : 0;
        queue.push({ sid: seeds[i], levelIdx: seedLevelIdx });
    }
    while (queue.length > 0) {
        var node = queue.shift();
        if (reachable[node.sid] || !map[node.sid]) continue;
        reachable[node.sid] = true;
        levelIdxOf[node.sid] = node.levelIdx;
        var evolutions2 = (map[node.sid].family && map[node.sid].family.evolutions) ? map[node.sid].family.evolutions : [];
        for (var k = 0; k < evolutions2.length; k++) {
            queue.push({ sid: evolutions2[k], levelIdx: node.levelIdx }); // 진화해도 레벨은 그대로
        }
    }

    for (i = 0; i < family.length; i++) {
        var p = family[i];
        if (reachable[p.speciesId] || isEvolutionTarget[p.speciesId]) continue;
        var parent = (p.family && p.family.parent) ? p.family.parent : null;
        if (!parent) continue;
        var leaf = walkToLeaf(parent);
        if (reachable[leaf]) {
            reachable[p.speciesId] = true;
            levelIdxOf[p.speciesId] = levelIdxOf[leaf]; // 메가 등도 같은 레벨을 물려받음
        }
    }

    // 프라이멀/대짱이 메가처럼 family 필드 자체가 없어서(진화 그래프에 안 걸림) 위
    // 부모추적으로도 못 찾는 변신폼 보정: 같은 dex를 쓰는, 이미 도달한 다른 단계가
    // 있으면(꼭 시작점(seed)일 필요는 없음 - 예: 대짱이 메가는 물짱이가 아니라
    // "진화해서 도달한 대짱이"와 dex가 같음) 그 레벨을 그대로 물려받게 한다.
    // 뮤츠처럼 같은 dex에 "일반개체"와 "별도 코스튬/폼"이 둘 다 독립 시작점으로 있는
    // 경우(아머드뮤츠), 메가/프라이멀은 항상 이름에 접미사가 안 붙은 "plain" 쪽에서만
    // 가능하므로(예: 메가뮤츠는 아머드뮤츠가 아니라 일반 뮤츠에서만 진화) speciesId에
    // "_"가 없는 후보를 우선한다. 그런 후보가 없으면 아무거나(첫 번째) 물려받는다.
    var changed = true;
    while (changed) {
        changed = false;
        for (i = 0; i < family.length; i++) {
            var q = family[i];
            if (reachable[q.speciesId]) continue;
            var bestMatch = null;
            for (var s = 0; s < family.length; s++) {
                var r = family[s];
                if (!reachable[r.speciesId] || r.dex !== q.dex) continue;
                if (!bestMatch || (bestMatch.speciesId.indexOf('_') !== -1 && r.speciesId.indexOf('_') === -1)) {
                    bestMatch = r;
                }
            }
            if (bestMatch) {
                reachable[q.speciesId] = true;
                levelIdxOf[q.speciesId] = levelIdxOf[bestMatch.speciesId];
                changed = true;
            }
        }
    }

    var result = [];
    for (i = 0; i < family.length; i++) {
        if (reachable[family[i].speciesId]) {
            family[i]._currentLevelIdx = levelIdxOf[family[i].speciesId];
            result.push(family[i]);
        }
    }
    return result;
}

// ---------------------------------------------
// 표시용 이름 변환: "Charizard (Mega X)" -> "Mega Charizard X"
// ---------------------------------------------

function formatDisplayName(name) {
    var m = name.match(/^(.+) \(Mega( X| Y)?\)$/);
    if (m) {
        return "Mega " + m[1] + (m[2] ? m[2] : "");
    }
    return name;
}

// 카카오톡 답장은 일반 텍스트라 색상/굵기를 줄 수 없어서, 250위 이내는 🔴로 강조
// 단, (X)로 참전 불가능한 경우는 어차피 못 쓰는 값이라 강조하지 않음
// [lvl.. cp..] 상세 표시는 "실제로 쓸 수 있는 값"일 때만 보여줌:
// 등수가 1500위를 넘거나(=상위 36.6% 밖), (X)로 참전 자체가 불가능하면 생략
function fmtRankPart(label, r, dim) {
    var mark = (r.rank <= 250 && !dim) ? "🔴" : "";
    var text = mark + label + r.rank;
    if (r.rank <= 1500 && !dim) {
        text += "[lvl" + r.level + " cp" + r.cp + "]";
    }
    if (dim) {
        text += "(X)";
    }
    return text;
}


// ---------------------------------------------
// 명령어 처리
// ---------------------------------------------

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {

    if (!isAllowedRoom(room)) {
        return;
    }

    if (msg === "?포켓몬테스트") {
        replier.reply("포켓몬랭크봇 작동중");
        return;
    }

    if (msg.indexOf("?포켓몬디버그") === 0) {
        var name = msg.substring("?포켓몬디버그".length).replace(/^\s+|\s+$/g, "");
        if (name.length === 0) {
            replier.reply("사용법: ?포켓몬디버그 <한국어이름>");
            return;
        }
        try {
            replier.reply(debugFindEnglishName(name));
        } catch (e) {
            replier.reply("디버그 중 오류: " + e);
        }
        return;
    }

    if (msg.indexOf("?포켓몬") === 0) {
        var rest = msg.substring("?포켓몬".length).replace(/^\s+/, "");
        var parts = rest.split(/\s+/).filter(function (x) { return x.length > 0; });

        if (parts.length < 5) {
            replier.reply("사용법: ?포켓몬 <한국어이름> <IV공격> <IV방어> <IV체력> <CP> [최대레벨]\n예: ?포켓몬 파이리 0 15 14 395\n(기본값은 최대레벨 50. XL 사탕 없이 40레벨까지만 계산: ?포켓몬 파이리 0 15 14 395 40)");
            return;
        }

        var koreanName = parts[0];
        var ivAtk = parseInt(parts[1], 10);
        var ivDef = parseInt(parts[2], 10);
        var ivSta = parseInt(parts[3], 10);
        var cp = parseInt(parts[4], 10);
        var maxLevel = DEFAULT_DISPLAY_MAX_LEVEL;

        if (parts.length >= 6) {
            var maxLevelInput = parseInt(parts[5], 10);
            if (maxLevelInput !== 40 && maxLevelInput !== 50) {
                replier.reply("최대레벨 값은 50(기본, XL 사탕) 또는 40(XL 사탕 없음) 중 하나여야 합니다.");
                return;
            }
            maxLevel = maxLevelInput;
        }
        var displayMaxLevelIdx = levelToIndex(maxLevel);

        if (isNaN(ivAtk) || isNaN(ivSta) || isNaN(ivDef) ||
            ivAtk < 0 || ivAtk > 15 || ivSta < 0 || ivSta > 15 || ivDef < 0 || ivDef > 15) {
            replier.reply("IV 값은 0~15 사이 숫자여야 합니다.\n순서: <IV공격> <IV방어> <IV체력>");
            return;
        }
        if (isNaN(cp) || cp <= 0) {
            replier.reply("CP 값이 올바르지 않습니다.");
            return;
        }

        try {
            var namesCsv = fetchRawText(SPECIES_NAMES_CSV_URL);
            var found = findEnglishName(koreanName, namesCsv);
            var info = null;
            var genderNote = "";
            if (!found) {
                // "니드런"처럼 암수 표시 없이 입력한 경우: 암수 후보 중 입력한 IV로 이 CP가
                // 정확히 나오는 쪽이 하나뿐이면 그쪽으로 계산하고, 가려낼 수 없으면
                // (둘 다 나오거나 둘 다 안 나오면) 암수를 붙여서 다시 입력하게 한다.
                var genderCandidates = findGenderCandidates(koreanName, namesCsv);
                if (genderCandidates.length > 0) {
                    var matched = [];
                    for (var gi = 0; gi < genderCandidates.length; gi++) {
                        var gFound = findEnglishNameBySpeciesId(genderCandidates[gi].speciesId);
                        if (!gFound) continue;
                        var gInfo = getFamilyStats(gFound.englishName, gFound.dex, ivAtk, ivDef, ivSta, cp);
                        if (gInfo && gInfo.target && canReachExactCP(gInfo.target.baseStats, ivAtk, ivDef, ivSta, cp)) {
                            matched.push({ name: genderCandidates[gi].name, found: gFound, info: gInfo });
                        }
                    }
                    if (matched.length !== 1) {
                        replier.reply("'" + koreanName + "'은 암수가 따로 있습니다. " +
                            koreanName + "암 또는 " + koreanName + "수로 입력해주세요. (예: ?포켓몬 " +
                            koreanName + "암 " + parts.slice(1).join(" ") + ")");
                        return;
                    }
                    found = matched[0].found;
                    info = matched[0].info;
                    genderNote = "※ '" + koreanName + "'은 암수가 따로 있어서, CP " + cp + "에 맞는 " +
                        matched[0].name + "로 계산했습니다.\n\n";
                }
            }
            if (!found) {
                replier.reply("'" + koreanName + "'에 해당하는 영어 이름을 찾지 못했습니다. (?포켓몬디버그 " + koreanName + " 으로 확인해보세요)");
                return;
            }
            var englishName = found.englishName;
            var koreanNameMap = buildKoreanNameMap(namesCsv);

            if (!info) info = getFamilyStats(englishName, found.dex, ivAtk, ivDef, ivSta, cp);
            if (!info || !info.family || info.family.length === 0) {
                replier.reply(englishName + "(" + koreanName + ") 의 종족값 정보를 찾지 못했습니다.");
                return;
            }

            // 처음 입력한 CP로부터, 실제 조회한 종(입력한 그 폼)의 "진짜 현재 레벨"을 구함.
            // XL 사탕으로 40레벨을 넘겼을 수도 있으므로 상한 없이(최대 50레벨까지) 탐색함.
            var tp = info.target.baseStats;
            var currentLevelIdx = findLevelForCP(tp.atk, tp.def, tp.hp, ivAtk, ivDef, ivSta, cp);

            var lines = [];
            for (var i = 0; i < info.family.length; i++) {
                var p = info.family[i];
                var atk = p.baseStats.atk, def = p.baseStats.def, hp = p.baseStats.hp;

                var s = calcRank(atk, def, hp, ivAtk, ivDef, ivSta, 1500, displayMaxLevelIdx);
                var h = calcRank(atk, def, hp, ivAtk, ivDef, ivSta, 2500, displayMaxLevelIdx);
                var m = calcRank(atk, def, hp, ivAtk, ivDef, ivSta, null, displayMaxLevelIdx);
                var l = calcRank(atk, def, hp, ivAtk, ivDef, ivSta, 500, displayMaxLevelIdx);

                // (X) 판정: "지금 실제 레벨"로 이 진화단계까지 갔을 때 나오는 CP가
                // 그 리그의 CP상한을 넘는지로 직접 판정한다.
                // (표시용 CP/등수의 "최대레벨" 설정과는 무관 - 파워업으로 레벨을
                //  낮출 수 없다는 실제 게임 규칙을 그대로 반영)
                // "실제 레벨"은 사이즈(호바귀/펌킨인 등)별로 다르므로 p._currentLevelIdx
                // (collectReachableFromTarget에서 사이즈별로 따로 구해 붙여준 값)를 쓴다.
                var cpAtCurrentLevel = calcCP(atk, def, hp, ivAtk, ivDef, ivSta, p._currentLevelIdx);
                var sDim = cpAtCurrentLevel > 1500;
                var hDim = cpAtCurrentLevel > 2500;
                var mDim = false; // 마스터리그는 CP 상한이 없음
                var lDim = cpAtCurrentLevel > 500;

                var displayName = formatDisplayName(p.speciesName);
                var koreanFormName = koreanNameMap[String(p.dex)];
                if (koreanFormName) displayName += " (" + koreanFormName + ")";
                lines.push(
                    "- " + displayName +
                    " / " + fmtRankPart("S", s, sDim) +
                    " / " + fmtRankPart("H", h, hDim) +
                    " / " + fmtRankPart("M", m, mDim) +
                    " / " + fmtRankPart("L", l, lDim)
                );
            }

            var header = "● " + koreanName + " " + ivAtk + " " + ivDef + " " + ivSta + " " + cp +
                " : lvl" + (1 + currentLevelIdx * 0.5);

            replier.reply(genderNote + header + "\n\n" + lines.join("\n\n"));
        } catch (e) {
            replier.reply("오류가 발생했습니다: " + e);
        }
        return;
    }
}
