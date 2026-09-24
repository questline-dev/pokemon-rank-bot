// audit.js 에서 찾은 이상 사례의 "원인"을 확인하는 대조 실험.
// 봇 코드는 그대로 두고, 봇 함수(findFamilyMembers, collectReachableFromTarget 등)에
// 넣는 gamemaster 항목만 복사본에서 한 군데씩 바꿔 가며 결과가 어떻게 달라지는지 본다.
// 실행: node research/mechanism.js   (research/data/ 필요)

var fs = require("fs");
var path = require("path");
var loadBot = require("./load-bot.js").loadBot;

var bot = loadBot().bot;
var raw = fs.readFileSync(path.join(__dirname, "data", "gamemaster.json"), "utf8");
var entries = bot.extractPokemonArrayEntries(raw);

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function ids(list) { return list.map(function (e) { return e.speciesId; }); }
function byId(list, id) { return list.filter(function (e) { return e.speciesId === id; })[0]; }

// family 목록(복사본)에 patch 를 적용한 뒤 collectReachableFromTarget 결과를 돌려준다
function reach(family, targetId, cp, patch) {
    var fam = clone(family);
    if (patch) patch(fam);
    return ids(bot.collectReachableFromTarget(fam, byId(fam, targetId), 15, 15, 15, cp));
}
function show(title, list) { console.log("  " + title + ": " + list.join(", ")); }

console.log("[1] 라이츄: 이전 단계(피카츄)가 결과에 나옴");
var pika = bot.findFamilyMembers(entries, "FAMILY_PIKACHU");
show("원본 데이터", reach(pika, "raichu", 1247));
var costume = ["pikachu_horizons", "pikachu_kariyushi", "pikachu_pop_star", "pikachu_rock_star", "pikachu_shaymin"];
show("parent=pichu 인 코스튬 5개를 뺐을 때", reach(pika, "raichu", 1247, function (f) {
    for (var i = f.length - 1; i >= 0; i--) if (costume.indexOf(f[i].speciesId) !== -1) f.splice(i, 1);
}));
show("코스튬 1개(horizons)만 남겼을 때", reach(pika, "raichu", 1247, function (f) {
    for (var i = f.length - 1; i >= 0; i--) if (costume.indexOf(f[i].speciesId) > 0) f.splice(i, 1);
}));

console.log("\n[2] 흉내내: 가라르 마임맨은 나오는데 그 진화형 마임꽁꽁(mr_rime)이 빠짐");
var mime = bot.findFamilyMembers(entries, "FAMILY_MR_MIME");
show("family 목록(봇이 모은 후보)", ids(mime));
show("원본 데이터", reach(mime, "mime_jr", 626));
show("mime_jr.evolutions 에 mr_mime_galarian 을 넣었을 때", reach(mime, "mime_jr", 626, function (f) {
    byId(f, "mime_jr").family.evolutions.push("mr_mime_galarian");
}));

console.log("\n[3] 아이스크: 진화 관계가 없는 껍질몬(shedinja)이 나옴");
var nin = bot.findFamilyMembers(entries, "FAMILY_NINCADA");
show("원본 데이터", reach(nin, "ninjask", 1125));
show("nincada.evolutions 에 shedinja 를 넣었을 때", reach(nin, "ninjask", 1125, function (f) {
    byId(f, "nincada").family.evolutions.push("shedinja");
}));

console.log("\n[4] 차데스/그우린차: PvPoke 데이터의 진화 방향이 거꾸로");
var cha = bot.findFamilyMembers(entries, "FAMILY_SINISTCHA");
show("원본 poltchageist.family", [JSON.stringify(byId(cha, "poltchageist").family)]);
show("원본 sinistcha.family", [JSON.stringify(byId(cha, "sinistcha").family)]);
function fixTea(f) {
    byId(f, "poltchageist").family = { id: "FAMILY_SINISTCHA", evolutions: ["sinistcha"] };
    byId(f, "sinistcha").family = { id: "FAMILY_SINISTCHA", parent: "poltchageist" };
}
show("차데스 조회 - 원본", reach(cha, "poltchageist", 650));
show("차데스 조회 - 방향을 바로잡았을 때", reach(cha, "poltchageist", 650, fixTea));
show("그우린차 조회 - 원본", reach(cha, "sinistcha", 1690));
show("그우린차 조회 - 방향을 바로잡았을 때", reach(cha, "sinistcha", 1690, fixTea));

console.log("\n[5] 피오네: 마나피(manaphy)가 진화형으로 나옴");
show("findChildrenByParent(['phione'])", ids(bot.findChildrenByParent(entries, ["phione"])));
show("manaphy.family", [JSON.stringify(bot.findSpeciesEntry(entries, "manaphy").family)]);

console.log("\n[6] 암멍이(노트 표기 '이니마'): 알려진 오타(lycranroc_dusk)가 있어도 황혼폼이 나오는 이유");
var rock = bot.findFamilyMembers(entries, "FAMILY_ROCKRUFF");
show("rockruff.family.evolutions", byId(rock, "rockruff").family.evolutions);
show("원본 데이터", reach(rock, "rockruff", 543));
// 황혼폼은 BFS(evolutions)로는 못 가지만, 뒤쪽 보정 두 개가 각각 따로 살려 준다:
//  (a) parent 를 따라가 최종진화체가 이미 도달돼 있으면 붙이는 보정 (parent=rockruff)
//  (b) 같은 도감번호(745)를 쓰는 다른 루가루암 폼이 도달해 있으면 레벨을 물려받는 보정
show("parent 만 지웠을 때 (b만 남음)", reach(rock, "rockruff", 543, function (f) {
    delete byId(f, "lycanroc_dusk").family.parent;
}));
show("dex 만 바꿨을 때 (a만 남음)", reach(rock, "rockruff", 543, function (f) {
    byId(f, "lycanroc_dusk").dex = 99999;
}));
show("parent 지우고 dex 도 바꿨을 때", reach(rock, "rockruff", 543, function (f) {
    delete byId(f, "lycanroc_dusk").family.parent;
    byId(f, "lycanroc_dusk").dex = 99999;
}));
