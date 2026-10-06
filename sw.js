/*
 * sw.js — 서비스 워커 (오프라인 실행 + 업데이트 통제)
 *  - 설치 시 앱 파일 전체를 기기에 저장(캐시)하고, 이후에는 캐시에서만 앱을 연다.
 *  - 새 버전이 올라오면 내려받아 "대기"만 한다. 앱 화면의 [업데이트]를 눌러야 교체된다.
 *  - 코드를 수정해 올릴 때는 반드시 아래 VERSION 값을 올린다. (이 파일이 바뀌어야 브라우저가 새 버전을 감지함)
 */
const VERSION='1.0.4';
const CACHE='work-schedule-'+VERSION;
const FILES=['./','./index.html','./app.css','./app.js','./xlsx.js','./store.js','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(u=>new Request(u,{cache:'reload'})))));
  // skipWaiting() 하지 않음 → 사용자가 [업데이트]를 눌러야 교체
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('work-schedule-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(req,{ignoreSearch:true})||(req.mode==='navigate'?await c.match('./index.html'):null);
    return hit||fetch(req);
  }));
});
self.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.type==='SKIP_WAITING')self.skipWaiting();
  if(d.type==='GET_VERSION'&&e.source)e.source.postMessage({type:'VERSION',version:VERSION,role:d.role});
});
