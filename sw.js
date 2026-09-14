// 포켓몬 랭크체커 PWA 서비스워커.
// 앱 껍데기(같은 오리진의 HTML/manifest/아이콘)만 캐시해서 오프라인에서도 화면은 뜨게 한다.
// 포켓몬 데이터(raw.githubusercontent.com)는 항상 최신이어야 하므로 여기서 캐시하지 않고
// 그냥 네트워크로 흘려보낸다 - 오프라인이면 원래대로 "데이터 요청 실패" 에러가 뜬다.

var CACHE_NAME = "pokemon-rank-checker-v1";
var APP_SHELL = [
    "./포켓몬랭크봇.html",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(function (key) { return key !== CACHE_NAME; })
                    .map(function (key) { return caches.delete(key); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", function (event) {
    var url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return; // 다른 오리진(gamemaster.json 등)은 캐시 안 타고 기본 네트워크 동작
    }
    event.respondWith(
        caches.match(event.request).then(function (cached) {
            return cached || fetch(event.request);
        })
    );
});
