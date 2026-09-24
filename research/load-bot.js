// 포켓몬랭크봇.html 의 <script> 를 한 글자도 바꾸지 않고 Node vm 안에서 실행한다.
// 흉내 내는 건 브라우저 쪽 바깥 환경뿐이다.
//   - document.getElementById: 입력창/결과창 등 7개 요소를 값만 담는 가짜 객체로
//   - navigator: 빈 객체 (serviceWorker 등록 분기를 건너뜀)
//   - window: addEventListener만 있는 빈 객체
//   - fetch: 같은 URL을 인터넷 대신 research/data/ 에 미리 받아둔 파일로 응답
//            (fetch-data.sh 로 받은 "실제" 데이터 그대로. 파일이 없으면 에러로 멈춘다)
// 봇의 계산/파싱 함수(findEnglishName, getFamilyStats, collectReachableFromTarget,
// runCalc 등)는 vm 컨텍스트의 전역으로 그대로 노출되므로 원본 코드를 직접 호출한다.

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.resolve(__dirname, "..");
var DATA_DIR = path.join(__dirname, "data");
var HTML_PATH = path.join(ROOT, "포켓몬랭크봇.html");

function extractScript(html) {
    var open = html.indexOf("<script>");
    var close = html.indexOf("</script>", open);
    if (open === -1 || close === -1) throw new Error("포켓몬랭크봇.html 에서 <script> 를 찾지 못함");
    return html.substring(open + "<script>".length, close);
}

function makeElement(id) {
    return {
        id: id, value: "", innerHTML: "", textContent: "", className: "", disabled: false,
        style: {}, addEventListener: function () {}, focus: function () {}
    };
}

function loadBot() {
    var html = fs.readFileSync(HTML_PATH, "utf8");
    var code = extractScript(html);

    var elements = {};
    var fetchLog = [];
    var fileCache = {};

    function fakeFetch(url) {
        var file = path.join(DATA_DIR, path.basename(url));
        fetchLog.push(url);
        if (!fs.existsSync(file)) {
            return Promise.reject(new Error("데이터 파일 없음: " + file + " (research/fetch-data.sh 먼저 실행)"));
        }
        if (!(file in fileCache)) fileCache[file] = fs.readFileSync(file, "utf8");
        var body = fileCache[file];
        return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(body); } });
    }

    var sandbox = {
        console: console,
        fetch: fakeFetch,
        navigator: {},
        window: { addEventListener: function () {} },
        document: {
            getElementById: function (id) {
                if (!elements[id]) elements[id] = makeElement(id);
                return elements[id];
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: "포켓몬랭크봇.html#script" });

    // 화면 입력 그대로 runCalc 를 돌리고, 결과창/상태줄 텍스트를 돌려준다.
    // (HTML 입력창은 "?포켓몬" 없이 "<이름> <IV공격> <IV방어> <IV체력> <CP>" 형식)
    async function runCalcText(input) {
        elements.cmdInput.value = input;
        await sandbox.runCalc();
        var result = elements.result.innerHTML.replace(/<[^>]+>/g, "")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        return { status: elements.status.textContent, isError: elements.status.className === "error", result: result };
    }

    return { bot: sandbox, elements: elements, fetchLog: fetchLog, runCalcText: runCalcText, scriptLength: code.length };
}

module.exports = { loadBot: loadBot, DATA_DIR: DATA_DIR, ROOT: ROOT };
