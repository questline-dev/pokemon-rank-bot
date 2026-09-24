// 포켓몬랭크봇.js(카톡 봇)와 포켓몬랭크봇.html(PWA)의 같은 이름 함수를 비교한다.
// .js 는 Rhino 전용(org.jsoup.Jsoup, response(...))이라 Node 에서 그대로 실행할 수 없다.
// 그래서 검사는 .html 쪽 함수로 돌리고, 이 스크립트로 "계산/파싱 함수 본문이 같은지"를 확인해
// 검사 결과가 카톡 봇에도 그대로 적용되는지 판단한다.
// 비교 전 정규화: 주석 제거, 공백 압축, async/await 제거, getXxx()/fetchGamemasterRaw() 표기 통일.
// 실행: node research/compare-js-html.js

var fs = require("fs");
var path = require("path");
var ROOT = path.resolve(__dirname, "..");

function stripComments(src) {
    var out = "", i = 0, n = src.length, q = null;
    while (i < n) {
        var c = src[i], d = src[i + 1];
        if (q) {
            out += c;
            if (c === "\\") { out += d; i += 2; continue; }
            if (c === q) q = null;
            i++;
        } else if (c === '"' || c === "'") { q = c; out += c; i++; }
        else if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; }
        else if (c === "/" && d === "*") { i = src.indexOf("*/", i + 2) + 2; }
        else { out += c; i++; }
    }
    return out;
}

// 줄 맨 앞의 top-level "function NAME(" / "async function NAME(" 를 찾아 중괄호 짝으로 본문을 자름
function topLevelFunctions(src) {
    var code = stripComments(src);
    var re = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm, m, out = {};
    while ((m = re.exec(code))) {
        var i = code.indexOf("{", m.index), depth = 0, q = null;
        for (; i < code.length; i++) {
            var c = code[i];
            if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
            if (c === '"' || c === "'") { q = c; continue; }
            if (c === "{") depth++;
            else if (c === "}") { depth--; if (depth === 0) break; }
        }
        out[m[1]] = code.substring(m.index, i + 1);
    }
    return out;
}

// .js 는 매번 fetchRawText(URL)로 받고, .html 은 같은 URL을 _cache 에 담는 getXxx()로 받는다.
// 받아오는 데이터가 같으므로 같은 표기로 맞춘 뒤 비교한다.
var DATA_ACCESS = [
    [/fetchRawText\(SPECIES_NAMES_CSV_URL\)/g, "getNamesCsv()"],
    [/fetchRawText\(SPECIES_CSV_URL\)/g, "getSpeciesCsv()"],
    [/fetchRawText\(POKEMON_CSV_URL\)/g, "getPokemonCsv()"],
    [/fetchRawText\(POKEMON_FORMS_CSV_URL\)/g, "getFormsCsv()"],
    [/fetchGamemasterRaw\(\)/g, "getGamemasterRaw()"]
];

function normalize(body) {
    DATA_ACCESS.forEach(function (p) { body = body.replace(p[0], p[1]); });
    return body
        .replace(/\basync\s+/g, "").replace(/\bawait\s+/g, "")
        .replace(/\s+/g, " ").trim();
}

var js = topLevelFunctions(fs.readFileSync(path.join(ROOT, "포켓몬랭크봇.js"), "utf8"));
var html = fs.readFileSync(path.join(ROOT, "포켓몬랭크봇.html"), "utf8");
html = html.substring(html.indexOf("<script>") + 8, html.indexOf("</script>"));
var hf = topLevelFunctions(html);

var same = [], diff = [], onlyJs = [], onlyHtml = [];
Object.keys(js).forEach(function (k) {
    if (!(k in hf)) { onlyJs.push(k); return; }
    (normalize(js[k]) === normalize(hf[k]) ? same : diff).push(k);
});
Object.keys(hf).forEach(function (k) { if (!(k in js)) onlyHtml.push(k); });

console.log("본문 동일 (" + same.length + "): " + same.join(", "));
console.log("\n본문 다름 (" + diff.length + "): " + diff.join(", "));
console.log("\n.js 에만 있음: " + onlyJs.join(", "));
console.log(".html 에만 있음: " + onlyHtml.join(", "));

// 다른 함수는 첫 차이 지점 앞뒤를 보여준다
diff.forEach(function (k) {
    var a = normalize(js[k]), b = normalize(hf[k]), p = 0;
    while (p < a.length && a[p] === b[p]) p++;
    console.log("\n--- " + k + " (첫 차이 위치 " + p + ")");
    console.log("  .js  : …" + a.substring(Math.max(0, p - 60), p + 100));
    console.log("  .html: …" + b.substring(Math.max(0, p - 60), p + 100));
});
