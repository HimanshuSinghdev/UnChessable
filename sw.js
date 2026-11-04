const V='unchessable-v1';
const FILES=['./','index.html','app.js','manifest.json','icon.svg','vendor/chess.js','engine/stockfish-19-lite.js','engine/stockfish-19-lite.wasm','engine/stockfish-19-lite-single.js','engine/stockfish-19-lite-single.wasm','engine/stockfish-19-asm.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
// Adds COOP/COEP so SharedArrayBuffer (multi-threaded Stockfish) works on static hosts like GitHub Pages.
const iso=r=>{if(!r||r.status===0||r.status===206)return r;const h=new Headers(r.headers);h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Resource-Policy','same-origin');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})};
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)).then(iso))});
