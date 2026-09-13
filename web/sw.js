const CACHE='systema-web-goals-v3-2';
const CORE=[
  './','./index.html','./styles.css?v=6','./app.js?v=6','./manifest.webmanifest','./progress.css?v=6',
  './assets/app-icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-512.png',
  './assets/backgrounds/noise.svg','./assets/backgrounds/grid.svg','./assets/backgrounds/navy.svg'
];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('systema-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response && response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):undefined))
  );
});
