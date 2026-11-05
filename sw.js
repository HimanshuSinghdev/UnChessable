const V='unchessable-v2';
const APP=['./','index.html','app.js','manifest.json','icon.svg','vendor/chess.js'];
const STATIC=['engine/stockfish-19-lite.js','engine/stockfish-19-lite.wasm','engine/stockfish-19-lite-single.js','engine/stockfish-19-lite-single.wasm','engine/stockfish-19-asm.js',
'pieces/merida/wK.svg','pieces/merida/wQ.svg','pieces/merida/wR.svg','pieces/merida/wB.svg','pieces/merida/wN.svg','pieces/merida/wP.svg','pieces/merida/bK.svg','pieces/merida/bQ.svg','pieces/merida/bR.svg','pieces/merida/bB.svg','pieces/merida/bN.svg','pieces/merida/bP.svg','pieces/cburnett/wK.svg','pieces/cburnett/wQ.svg','pieces/cburnett/wR.svg','pieces/cburnett/wB.svg','pieces/cburnett/wN.svg','pieces/cburnett/wP.svg','pieces/cburnett/bK.svg','pieces/cburnett/bQ.svg','pieces/cburnett/bR.svg','pieces/cburnett/bB.svg','pieces/cburnett/bN.svg','pieces/cburnett/bP.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll([...APP,...STATIC])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
// Adds COOP/COEP so SharedArrayBuffer (multi-threaded Stockfish) works on static hosts like GitHub Pages.
const iso=r=>{if(!r||r.status===0||r.status===206)return r;const h=new Headers(r.headers);h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Resource-Policy','same-origin');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})};
// Engine and piece files never change: cache first. The app itself (html/js): network first, so a new deploy shows up on the next load.
const isStatic=p=>p.startsWith('/engine/')||p.includes('/engine/')||p.includes('/pieces/');
const fresh=req=>fetch(req,{cache:'no-cache'}).then(r=>{if(r&&r.ok&&r.status===200){const copy=r.clone();caches.open(V).then(c=>c.put(req,copy)).catch(()=>{})}return r});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 const cached=()=>caches.match(e.request,{ignoreSearch:true});
 e.respondWith((isStatic(u.pathname)?cached().then(r=>r||fresh(e.request)):fresh(e.request).catch(()=>cached())).then(iso))});
