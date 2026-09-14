// 포켓몬 랭크체커 PWA 서비스워커.
// 앱 껍데기(같은 오리진의 HTML/manifest/아이콘)를 "네트워크 우선"으로 서빙한다.
// 이 프로젝트는 수시로 코드가 바뀌므로 캐시를 우선하면 배포해도 예전 화면이 계속
// 보이는 문제가 생긴다(실제로 2026-09-14에 이 문제로 트리토돈 수정이 반영 안 되고
// 예전 버전이 계속 보였음). 그래서 항상 네트워크를 먼저 시도하고, 그 결과로 캐시를
// 갱신해두며, 오프라인일 때만 마지막으로 받아둔 캐시로 대체한다.
// 포켓몬 데이터(raw.githubusercontent.com)는 이 서비스워커가 아예 손대지 않고
// 그냥 네트워크로 흘려보낸다 - 항상 최신 데이터를 받아야 하기 때문.

var CACHE_NAME = "pokemon-rank-checker-v2";
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
        fetch(event.request).then(function (networkRes) {
            var copy = networkRes.clone();
            caches.open(CACHE_NAME).then(function (cache) {
                cache.put(event.request, copy);
            });
            return networkRes;
        }).catch(function () {
            // 오프라인 등 네트워크 실패 시에만 마지막으로 받아둔 캐시를 대신 보여줌
            return caches.match(event.request);
        })
    );
});
