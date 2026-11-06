import {Chess} from './vendor/chess.js';
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const $=s=>document.querySelector(s), sleep=ms=>new Promise(r=>setTimeout(r,ms));
const NS='http://www.w3.org/2000/svg';

/* ---------- settings ---------- */
const DEF={theme:'slate',mode:'auto',pieces:'merida',time:3000,hash:64,thr:Math.min(navigator.hardwareConcurrency||2,8),depth:12,ponder:true,sound:true};
const set={...DEF,...(()=>{try{return JSON.parse(localStorage.getItem('uc.set')||'{}')}catch{return{}}})()};
/* v3: map the old board themes, give old saved settings the stronger defaults once */
if(set.v!==3){set.v=3;if(set.time<3000)set.time=3000;if(!set.pieces)set.pieces='merida';set.theme=({midnight:'slate',emerald:'sage',wood:'walnut'})[set.theme]||set.theme;if(set.depth===14)set.depth=12}
if(!['slate','sage','walnut'].includes(set.theme))set.theme='slate';if(!['auto','light','dark'].includes(set.mode))set.mode='auto';
const saveSet=()=>{try{localStorage.setItem('uc.set',JSON.stringify(set))}catch{}};

/* ---------- IndexedDB (eval cache + vault) ---------- */
const idb=new Promise((res,rej)=>{const r=indexedDB.open('unchessable',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('evals');d.createObjectStore('games',{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const db=async(store,mode,fn)=>{try{const d=await idb;return await new Promise((res,rej)=>{const t=d.transaction(store,mode),o=fn(t.objectStore(store));t.oncomplete=()=>res(o&&o.result);t.onerror=()=>rej(t.error)})}catch{return undefined}};

/* ---------- audio synth ---------- */
let AC;const ctx=()=>AC||(AC=new (window.AudioContext||window.webkitAudioContext)());
function tone(f,t0,dur,vol,type='sine'){const c=ctx(),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(vol,c.currentTime+t0);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+t0+dur);o.connect(g).connect(c.destination);o.start(c.currentTime+t0);o.stop(c.currentTime+t0+dur+.02)}
function thud(vol,freq,dur){const c=ctx(),n=c.sampleRate*dur,b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,4);
 const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=1.4;const g=c.createGain();g.gain.value=vol;s.connect(f).connect(g).connect(c.destination);s.start();tone(freq/4,0,dur,vol*.5)}
function sfx(k){if(!set.sound)return;try{ctx().resume();
 if(k==='move')thud(.9,1400,.07);else if(k==='cap'){thud(1.6,700,.14)}else if(k==='check'){thud(.9,1200,.07);tone(1320,.06,.25,.15);tone(1760,.12,.3,.1)}
 else if(k==='end'){[392,494,587,784].forEach((f,i)=>tone(f,i*.07,1.1,.12,'triangle'))}}catch{}}

/* ---------- pieces (SVG files in /pieces, shown as CSS backgrounds) ---------- */
const PIECE_SETS={merida:'Staunton',cburnett:'Classic'};
const PKEYS=['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP'];
const pieceKey=(t,c)=>c+t.toUpperCase();
function applyPieces(){const s=PIECE_SETS[set.pieces]?set.pieces:'merida';let st=document.getElementById('pcStyle');
 if(!st){st=document.createElement('style');st.id='pcStyle';document.head.append(st)}
 st.textContent=PKEYS.map(k=>`[data-p=${k}]{background-image:url("pieces/${s}/${k}.svg")}`).join('');
 for(const k of PKEYS){const i=new Image();i.src=`pieces/${s}/${k}.svg`}}

/* ---------- opening book (SAN lines → trie lookup) ---------- */
const BOOK=`e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3
e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8
e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7
e4 e5 Nf3 Nc6 Bc4 Nf6 d4 exd4 O-O Nxe4 Re1 d5 Bxd5 Qxd5 Nc3 Qa5
e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7 c4 Nb4
e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O
e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O
e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Nd5 Qa5
e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O Qc7 Qe2 d6 c4 g6
e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb5 dxe5 Nxe5 Bd7
e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5 Qd2 Nc6
e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4 f6 exf6 Nxf6 O-O Bd6
e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6
e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7 c4 dxc4
e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6 Nd5 Qd8
d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7
d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O Nbd7 Qe2 Bg6
d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Qe2 b5 Bb3 Nc6 Rd1 Qc7
d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3 f5
d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7
d4 Nf6 c4 e6 Nf3 d5 g3 Be7 Bg2 O-O O-O dxc4 Qc2 a6 a4 Bd7 Qxc4 Bc6
d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Rb1 O-O Be2 Nc6 d5 Ne5
d4 Nf6 Nf3 e6 Bf4 c5 e3 Nc6 Nbd2 d5 c3 Bd6 Bg3 O-O Bd3 b6
d4 d5 Nf3 Nf6 Bf4 e6 e3 Bd6 Bg3 O-O Nbd2 c5 c3 Nc6 Bd3 Qe7
c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 d3 O-O
c4 c5 Nf3 Nf6 Nc3 d5 cxd5 Nxd5 e3 Nc6 Bc4 Nb6 Be2 e6 O-O Be7 d4 cxd4 exd4 O-O
c4 Nf6 Nc3 e6 e4 d5 e5 d4 exf6 dxc3 bxc3 Qxf6 Nf3 c5 Bd3 Nc6 O-O Be7
Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6 Re1 b5
Nf3 Nf6 c4 e6 g3 d5 Bg2 Be7 O-O O-O d4 dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7`.split('\n').map(l=>l.trim().split(/\s+/));
function bookMove(hist){if(hist.length>24)return null;const c=[];for(const l of BOOK){if(l.length>hist.length&&hist.every((m,i)=>l[i]===m))c.push(l[hist.length])}
 if(!c.length)return null;const s=c[Math.floor(Math.random()*c.length)],t=new Chess(),h=[];try{for(const m of hist)t.move(m);const m=t.move(s);return m.from+m.to+(m.promotion||'')}catch{return null}}

/* ---------- UCI engine wrapper with crash recovery ---------- */
const scoreNum=s=>s.mate!=null?Math.sign(s.mate)*(30000-Math.abs(s.mate)):s.cp;
function parseInfo(l){const t=l.split(' '),o={},g=k=>{const i=t.indexOf(k);return i<0?null:t[i+1]};
 o.depth=+g('depth');o.mpv=+(g('multipv')||1);const i=t.indexOf('score');if(i>=0){o.score=t[i+1]==='mate'?{mate:+t[i+2]}:{cp:+t[i+2]}}
 const p=t.indexOf('pv');o.pv=p>=0?t.slice(p+1):[];o.nps=+g('nps')||0;return o}
const BM=/^bestmove (\S+)(?: ponder (\S+))?/;
class Engine{
 constructor(single=false,hash=null){this.single=single;this.hash=hash;this.waiters=[];this.pond=null;this.quiet=false;this.stm='w';this.onInfo=()=>{};this.lastInfo=null;this.name='';this.threads=1;this.ok=false;this.w=null;this.rp=null}
 send(s){if(!this.w)throw new Error('engine not started');this.w.postMessage(s)}
 /* every wait has a timeout, so a dead worker can never leave the game hanging */
 wait(re,ms=0){return new Promise((res,rej)=>{const e={re,res,rej,t:0};if(ms)e.t=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==e);rej(new Error('engine timeout'))},ms);this.waiters.push(e)})}
 failAll(err){const w=this.waiters;this.waiters=[];for(const e of w){clearTimeout(e.t);e.rej(err)}}
 line(l){l=String(l);for(const e of this.waiters.slice()){const m=l.match(e.re);if(m){this.waiters=this.waiters.filter(x=>x!==e);clearTimeout(e.t);e.res(m)}}
  if(!this.quiet&&l.startsWith('info')&&l.includes(' pv ')){const i=parseInfo(l);if(i.score){this.lastInfo=i;this.onInfo(i,this.stm)}}}
 async start(){this.ok=false;const c=[];if(!this.single&&self.crossOriginIsolated&&typeof SharedArrayBuffer!=='undefined')c.push('stockfish-19-lite.js');c.push('stockfish-19-lite-single.js','stockfish-19-asm.js');
  for(const f of c){try{await this.spawn('engine/'+f);this.name=f;this.threads=f==='stockfish-19-lite.js'?set.thr:1;await this.options();this.ok=true;return f}catch(e){console.warn('engine fail',f,e);try{this.w.terminate()}catch{}}}
  throw new Error('No engine could start')}
 async spawn(url){const w=this.w=new Worker(url);w.onmessage=e=>this.line(e.data);
  w.onerror=e=>{this.ok=false;this.failAll(new Error(e.message||'engine worker error'))};
  let p=this.wait(/^uciok/,20000);this.send('uci');await p;p=this.wait(/^readyok/,20000);this.send('isready');await p}
 async options(){for(const[k,v]of[['Skill Level',20],['UCI_LimitStrength','false'],['MultiPV',1],['Hash',this.hash??set.hash],['Threads',this.threads],['Move Overhead',20],['Ponder','true']])this.send(`setoption name ${k} value ${v}`);
  const p=this.wait(/^readyok/,20000);this.send('isready');await p}
 async fresh(){await this.stopPonder();this.send('ucinewgame');const p=this.wait(/^readyok/,10000);this.send('isready');await p}
 pos(fen,moves){return `position fen ${fen}${moves.length?' moves '+moves.join(' '):''}`}
 /* Pondering. The engine may finish a ponder search by itself (e.g. it found a forced mate) and print its
    bestmove before we ever send ponderhit/stop, so that bestmove is captured here instead of being waited for later. */
 ponder(fen,moves,pm,mt){const mv=[...moves,pm],pd={key:mv.join(' '),done:false,best:null,ponder:null};this.pond=pd;this.quiet=true;
  pd.p=this.wait(BM).then(m=>{pd.done=true;pd.best=m[1];pd.ponder=m[2]},()=>{pd.done=true});
  this.send(this.pos(fen,mv));this.send(`go ponder movetime ${mt}`)}
 async stopPonder(){const pd=this.pond;if(!pd)return;this.pond=null;
  try{if(!pd.done){this.send('stop');await Promise.race([pd.p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('engine timeout')),4000))])}}
  finally{this.quiet=false}}
 stop(){return this.stopPonder()}
 async think(fen,moves,mt){this.stm=moves.length%2===0?fen.split(' ')[1]:(fen.split(' ')[1]==='w'?'b':'w');
  const pd=this.pond;
  if(pd){
   if(pd.key===moves.join(' ')){ /* you played the predicted move: keep the ponder search going */
    this.pond=null;this.quiet=false;
    if(pd.done){if(pd.best&&pd.best!=='(none)')return{best:pd.best,ponder:pd.ponder}}
    else{const p=this.wait(BM,mt+6000);this.send('ponderhit');const m=await p;return{best:m[1],ponder:m[2]}}
   }else await this.stopPonder()}
  this.lastInfo=null;this.quiet=false;const p=this.wait(BM,mt+6000);this.send(this.pos(fen,moves));this.send(`go movetime ${mt}`);const m=await p;return{best:m[1],ponder:m[2]}}
 async analyze(fen,depth){await this.stopPonder();this.stm=fen.split(' ')[1];this.lastInfo=null;const p=this.wait(/^bestmove (\S+)/,120000);this.send(`position fen ${fen}`);this.send(`go depth ${depth}`);const m=await p;
  const i=this.lastInfo;return{best:m[1]==='(none)'?null:m[1],cp:i?scoreNum(i.score):0,pv:i?i.pv:[],depth}}
 terminate(){this.ok=false;try{this.w&&this.w.terminate()}catch{}this.failAll(new Error('engine terminated'))}
 restart(){return this.rp||(this.rp=(async()=>{try{this.w&&this.w.terminate()}catch{};this.failAll(new Error('engine restarted'));this.pond=null;this.quiet=false;this.ok=false;try{await this.start()}finally{this.rp=null}})())}
}
const eng=new Engine();

/* ---------- state ---------- */
let bootDone;let bootP=new Promise(r=>bootDone=r);
const S={gameId:Date.now(),gid:0,task:null,thinking:false,chess:new Chess(),startFen:START,orient:'w',human:'w',busy:false,mode:'play',sel:null,ann:{arrows:[],sq:[]},hint:null,rv:null,ply:0,branch:null,drag:null};
const ucis=()=>S.chess.history({verbose:true}).map(m=>m.from+m.to+(m.promotion||''));
const sqXY=sq=>{const f=sq.charCodeAt(0)-97,r=+sq[1]-1;return S.orient==='w'?[f,7-r]:[7-f,r]};
const xySq=(x,y)=>{const f=S.orient==='w'?x:7-x,r=S.orient==='w'?7-y:y;return String.fromCharCode(97+f)+(r+1)};
const wpct=cp=>50+50*(2/(1+Math.exp(-0.00368208*cp))-1);
const fmtScore=(cp,mate)=>mate!=null?`${mate<0?'−':'+'}M${Math.abs(mate)}`:((cp>=0?'+':'')+(cp/100).toFixed(1)).replace('-','−');

/* ---------- rendering ---------- */
function view(){
 if(S.mode==='review'&&S.rv){if(S.branch)return{fen:S.branch.fen,last:S.branch.last};const i=S.ply;const h=S.rv.hist[i-1];return{fen:S.rv.fens[i],last:h?[h.from,h.to]:null}}
 const h=S.chess.history({verbose:true}).pop();return{fen:S.chess.fen(),last:h?[h.from,h.to]:null}}
function rect(sq,fill,op=1){const [x,y]=sqXY(sq);const r=document.createElementNS(NS,'rect');r.setAttribute('x',x*100);r.setAttribute('y',y*100);r.setAttribute('width',100);r.setAttribute('height',100);r.setAttribute('fill',fill);r.setAttribute('opacity',op);return r}
function arrow(a,b,col,op=.85){const [x1,y1]=sqXY(a),[x2,y2]=sqXY(b),X1=x1*100+50,Y1=y1*100+50;let X2=x2*100+50,Y2=y2*100+50;const dx=X2-X1,dy=Y2-Y1,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
 const g=document.createElementNS(NS,'g');g.setAttribute('opacity',op);const ex=X2-ux*28,ey=Y2-uy*28;
 g.innerHTML=`<line x1="${X1}" y1="${Y1}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="16" stroke-linecap="round"/><polygon fill="${col}" points="${X2},${Y2} ${ex-uy*26},${ey+ux*26} ${ex+uy*26},${ey-ux*26}"/>`;return g}
const ACOL={n:'#7fbf6a',s:'#e0645c',c:'#4aa3e0',a:'#e6cc5a'};
function render(){
 const {fen,last}=view(),ch=new Chess(fen),under=$('#under'),over=$('#over'),pcs=$('#pcs');under.innerHTML='';over.innerHTML='';pcs.innerHTML='';
 if(last){under.append(rect(last[0],'#ffd23f',.45),rect(last[1],'#ffd23f',.62))}
 if(S.sel)under.append(rect(S.sel,'#7fbf6a',.45));
 S.ann.sq.forEach(s=>under.append(rect(s.sq,ACOL[s.c],.5)));
 if(ch.inCheck()){const k=ch.board().flat().find(p=>p&&p.type==='k'&&p.color===ch.turn());if(k){const [x,y]=sqXY(k.square),c=document.createElementNS(NS,'circle');c.setAttribute('cx',x*100+50);c.setAttribute('cy',y*100+50);c.setAttribute('r',52);c.setAttribute('fill','#e0645c');c.setAttribute('class','chk');under.append(c)}}
 if(S.sel&&S.mode==='play'){for(const m of ch.moves({square:S.sel,verbose:true})){const [x,y]=sqXY(m.to),c=document.createElementNS(NS,'circle');c.setAttribute('cx',x*100+50);c.setAttribute('cy',y*100+50);
  if(m.captured||m.flags.includes('e')){c.setAttribute('r',44);c.setAttribute('fill','none');c.setAttribute('stroke','#1a1405');c.setAttribute('stroke-opacity',.45);c.setAttribute('stroke-width',9)}else{c.setAttribute('r',15);c.setAttribute('fill','#1a1405');c.setAttribute('fill-opacity',.38)}under.append(c)}}
 const cv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
 for(let i=0;i<8;i++){const t=document.createElementNS(NS,'text'),u=document.createElementNS(NS,'text');
  t.textContent=S.orient==='w'?8-i:i+1;t.setAttribute('x',6);t.setAttribute('y',i*100+22);u.textContent=String.fromCharCode(97+(S.orient==='w'?i:7-i));u.setAttribute('x',i*100+84);u.setAttribute('y',792);
  t.setAttribute('fill',cv(i%2===0?'--dk':'--lt'));u.setAttribute('fill',cv(i%2===0?'--lt':'--dk'));for(const e of[t,u]){e.setAttribute('font-size',20);e.setAttribute('font-weight',700);under.append(e)}}
 for(const p of ch.board().flat()){if(!p)continue;const d=document.createElement('div'),[x,y]=sqXY(p.square);d.className='pc';d.dataset.sq=p.square;d.dataset.c=p.color;d.style.transform=`translate3d(${x*100}%,${y*100}%,0)`;d.dataset.p=pieceKey(p.type,p.color);pcs.append(d)}
 S.ann.arrows.forEach(a=>over.append(arrow(a.from,a.to,ACOL[a.c])));
 if(S.hint)over.append(arrow(S.hint.slice(0,2),S.hint.slice(2,4),'#6fbf8e',.8));
 if(S.mode==='review'&&S.rv&&!S.branch){const e=S.rv.ev[S.ply];if(e&&e.best)over.append(arrow(e.best.slice(0,2),e.best.slice(2,4),'#6fbf8e',.7));
}
 if(S.mode==='play')drawMoves();else drawReview();updateGo();
}
function setBar(cp,mate){const p=mate!=null?(mate>0?100:0):wpct(cp);$('#barw').style.width=p+'%';$('#barl').textContent=fmtScore(cp,mate)}
function drawMoves(){const h=S.chess.history();let o='';for(let i=0;i<h.length;i+=2)o+=`<span class="n">${i/2+1}.</span><span>${h[i]}</span><span>${h[i+1]||''}</span>`;const m=$('#moves');m.innerHTML=o;m.scrollTop=1e6;m.scrollLeft=1e6}
function status(t){$('#status').textContent=t}
function gameStatus(){const c=S.chess;if(c.isCheckmate())return(c.turn()==='w'?'Black':'White')+' wins by checkmate';if(c.isStalemate())return'Draw by stalemate';if(c.isThreefoldRepetition())return'Draw by repetition';if(c.isInsufficientMaterial())return'Draw: insufficient material';if(c.isDrawByFiftyMoves?.()||c.isDraw())return'Draw (50-move rule)';return null}

/* ---------- play ---------- */
async function afterMove(m,animate){
 S.hint=null;S.sel=null;S.ann={arrows:[],sq:[]};S.rv=null;
 if(animate){const legs=[[m.from,m.to]];if(m.flags.includes('k')||m.flags.includes('q')){const r=m.color==='w'?1:8,ks=m.flags.includes('k');legs.push([(ks?'h':'a')+r,(ks?'f':'d')+r])}
  let any=false;for(const[a,b]of legs){const el=$(`#pcs [data-sq=${a}]`);if(el){const[x,y]=sqXY(b);el.style.transition='transform .18s ease-out';el.style.zIndex=5;el.style.transform=`translate3d(${x*100}%,${y*100}%,0)`;any=true}}
  if(any)await sleep(190)}
 render();const over=gameStatus();sfx(over?'end':S.chess.inCheck()?'check':m.captured?'cap':'move');
 if(over){status(over);S.busy=false;S.thinking=false;saveGame();$('#bRun').classList.add('pri');updateGo();return true}
 status(S.chess.turn()===S.human?'Your move':'Engine is thinking…');return false}
const startEngine=()=>{if(S.thinking)return;S.task=engineTurn()};
const engineToMove=()=>S.mode==='play'&&!S.busy&&!S.chess.isGameOver()&&S.chess.turn()!==S.human;
function updateGo(){const b=$('#bGo');if(b)b.hidden=!engineToMove()}
function maybeEngine(){if(engineToMove())startEngine();updateGo()}
async function tryMove(from,to,promo){
 if(S.busy||S.mode!=='play'||S.chess.turn()!==S.human)return false;
 const legal=S.chess.moves({square:from,verbose:true}).filter(m=>m.to===to);if(!legal.length)return false;
 if(legal[0].promotion&&!promo){promo=await askPromo();if(!promo)return false}
 let m;try{m=S.chess.move({from,to,promotion:promo})}catch{return false}
 S.busy=true;const done=await afterMove(m,false);if(!done)startEngine();return true}
async function engineTurn(attempt=0){
 const gid=S.gid;S.busy=true;S.thinking=true;status('Engine is thinking…');updateGo();
 try{await bootP;if(eng.rp){try{await eng.rp}catch{}}if(gid!==S.gid)return;if(!eng.ok)throw new Error('engine not ready');
  const hist=S.chess.history();let uci=S.startFen===START?bookMove(hist):null,ponder;
  if(uci)await sleep(450);else{const r=await eng.think(S.startFen,ucis(),set.time);uci=r.best;ponder=r.ponder}
  if(gid!==S.gid)return;
  if(!uci||uci==='(none)'){S.busy=false;S.thinking=false;status(gameStatus()||'The engine has no legal move');updateGo();return}
  let m;try{m=S.chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]})}catch{throw new Error('illegal engine move '+uci)}
  S.thinking=false;const done=await afterMove(m,true);if(gid!==S.gid)return;S.busy=false;updateGo();
  if(!done&&set.ponder&&ponder){try{eng.ponder(S.startFen,ucis(),ponder,set.time)}catch{}}}
 catch(e){if(gid!==S.gid)return;console.error(e);S.thinking=false;
  if(attempt<2){setChip('Restarting engine','err');try{await eng.restart();setChip(engLabel(),'ok')}catch{setChip('Engine unavailable','err');S.busy=false;status('The engine could not restart. Tap Engine move to try again.');updateGo();return}
   if(gid!==S.gid)return;return engineTurn(attempt+1)}
  S.busy=false;status('The engine stopped responding. Tap Engine move to try again.');updateGo()}}
function askPromo(){return new Promise(res=>{const d=$('#dPromo'),p=$('#promo');p.innerHTML='';for(const t of['q','r','b','n']){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',{q:'Queen',r:'Rook',b:'Bishop',n:'Knight'}[t]);b.innerHTML=`<div class="pi" data-p="${pieceKey(t,S.human)}"></div>`;b.onclick=()=>{d.close();res(t)};p.append(b)}d.onclose=()=>res(null);d.showModal()})}
async function cancelEngine(){S.gid++;S.reviewing=false;$('#prog').hidden=true;const t=S.task;
 if(S.thinking){try{eng.send('stop')}catch{}
  if(t){const ok=await Promise.race([t.then(()=>1,()=>1),sleep(1500).then(()=>0)]);if(!ok){try{await eng.restart()}catch{}}}}
 S.thinking=false;S.busy=false}
async function newGame(fen=START,chess=null){
 S.busy=true;await cancelEngine();S.busy=true;const gid=S.gid;   // input stays locked until the engine has been reset
 S.chess=chess||new Chess(fen);S.startFen=chess?(chess.getHeaders().FEN||START):fen;S.gameId=Date.now();S.human=$('#side').value;S.orient=S.human;S.mode='play';S.rv=null;S.branch=null;S.thinking=false;S.sel=null;S.hint=null;S.ann={arrows:[],sq:[]};
 showTab('play');$('#bRun').classList.remove('pri');$('#line').textContent='';setBar(0);render();status(eng.ok?(S.chess.turn()===S.human?'Your move':'Engine is thinking…'):'Starting engine…');
 await bootP;if(gid!==S.gid)return;
 try{await eng.stop();if(eng.ok)await eng.fresh()}catch{}
 if(gid!==S.gid)return;S.busy=false;status(gameStatus()||(S.chess.turn()===S.human?'Your move':'Engine is thinking…'));maybeEngine()}
async function undo(){
 if(S.mode!=='play'||(S.busy&&!S.thinking))return;
 await cancelEngine();try{await eng.stop()}catch{}
 const c=S.chess,h=c.history().length,k=c.turn()===S.human?2:1;   // take back to the last position where it is your move
 if(h<k){status(h?'Nothing more to take back':'Nothing to take back');maybeEngine();return}
 for(let i=0;i<k;i++)c.undo();
 S.hint=null;S.sel=null;S.rv=null;S.ann={arrows:[],sq:[]};$('#bRun').classList.remove('pri');$('#line').textContent='';setBar(0);render();status('Your move');maybeEngine()}
async function hint(){
 if(S.busy||S.mode!=='play'||S.chess.isGameOver()||S.chess.turn()!==S.human)return;
 S.busy=true;status('Looking for a hint…');
 try{await bootP;await eng.stop();const r=await eng.analyze(S.chess.fen(),12);S.hint=r.best}
 catch(e){console.error(e);try{await eng.restart()}catch{}}
 finally{S.busy=false}
 render();status('Your move')}
function saveGame(){const c=S.chess;if(!c.history().length)return;c.setHeader('White',S.human==='w'?'You':'UnChessable');c.setHeader('Black',S.human==='b'?'You':'UnChessable');c.setHeader('Date',new Date().toISOString().slice(0,10).replace(/-/g,'.'));
 const r=c.isCheckmate()?(c.turn()==='w'?'0-1':'1-0'):'1/2-1/2';c.setHeader('Result',r);db('games','readwrite',s=>s.put({id:S.gameId,pgn:c.pgn(),date:Date.now(),white:S.human==='w'?'You':'UnChessable',black:S.human==='b'?'You':'UnChessable',result:r}))}

/* ---------- board input ---------- */
const board=$('#board');
const evSq=e=>{const b=board.getBoundingClientRect(),s=b.width/8;return xySq(Math.min(7,Math.max(0,Math.floor((e.clientX-b.left)/s))),Math.min(7,Math.max(0,Math.floor((e.clientY-b.top)/s))))};
board.addEventListener('contextmenu',e=>e.preventDefault());
let rc=null;
board.addEventListener('pointerdown',e=>{
 if(e.button===2){rc={sq:evSq(e),c:e.shiftKey?'s':e.ctrlKey||e.metaKey?'c':e.altKey?'a':'n'};return}
 if(S.ann.arrows.length||S.ann.sq.length){S.ann={arrows:[],sq:[]}}
 if(S.mode!=='play'||S.busy)return render();
 const sq=evSq(e),p=S.chess.get(sq);
 if(S.sel&&S.sel!==sq){const from=S.sel;S.sel=null;tryMove(from,sq).then(ok=>{if(!ok&&p&&p.color===S.human){S.sel=sq}render()});return}
 if(p&&p.color===S.human&&S.chess.turn()===S.human){S.sel=S.sel===sq?null:sq;const el=$(`#pcs [data-sq=${sq}]`);render();const el2=$(`#pcs [data-sq=${sq}]`);
  if(el2){const b=board.getBoundingClientRect();S.drag={from:sq,el:el2,sz:b.width/8,moved:false,x:e.clientX,y:e.clientY};el2.classList.add('drag');board.setPointerCapture(e.pointerId);moveDrag(e)}}
 else{S.sel=null;render()}});
function moveDrag(e){const d=S.drag;if(!d)return;const b=board.getBoundingClientRect();if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>4)d.moved=true;d.el.style.transform=`translate3d(${e.clientX-b.left-d.sz/2}px,${e.clientY-b.top-d.sz/2}px,0)`}
board.addEventListener('pointermove',moveDrag);
board.addEventListener('pointercancel',()=>{const d=S.drag;if(!d)return;S.drag=null;S.sel=null;render()});
board.addEventListener('pointerup',async e=>{
 if(e.button===2&&rc){const sq=evSq(e);if(sq===rc.sq){const i=S.ann.sq.findIndex(s=>s.sq===sq&&s.c===rc.c);i>=0?S.ann.sq.splice(i,1):S.ann.sq.push({sq,c:rc.c})}
  else{const i=S.ann.arrows.findIndex(a=>a.from===rc.sq&&a.to===sq&&a.c===rc.c);i>=0?S.ann.arrows.splice(i,1):S.ann.arrows.push({from:rc.sq,to:sq,c:rc.c})}rc=null;return render()}
 const d=S.drag;if(!d)return;S.drag=null;const to=evSq(e);
 if(d.moved&&to!==d.from){S.sel=null;const ok=await tryMove(d.from,to);if(!ok){S.sel=null}render()}else{d.el.classList.remove('drag');render()}});

/* ---------- eval/engine line display ---------- */
function pvSan(fen,pv,n=6){const c=new Chess(fen),o=[];for(const u of pv.slice(0,n)){try{o.push(c.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}).san)}catch{break}}return o}
eng.onInfo=(i,stm)=>{if(S.mode!=='play'||!S.busy)return;const cp=i.score.cp!=null?(stm==='w'?i.score.cp:-i.score.cp):null,mate=i.score.mate!=null?(stm==='w'?i.score.mate:-i.score.mate):null;
 setBar(mate!=null?(mate>0?3000:-3000):cp,mate);$('#line').textContent=`d${i.depth}  ${fmtScore(cp??0,mate)}  ${pvSan(S.chess.fen(),i.pv).join(' ')}  ·  ${Math.round(i.nps/1000)} kn/s`};

/* ---------- review ---------- */
const VAL={p:1,n:3,b:3,r:5,q:9,k:0};
const mat=(fen,c)=>{let s=0;for(const p of new Chess(fen).board().flat())if(p)s+=(p.color===c?1:-1)*VAL[p.type];return s};
const clamp=v=>Math.max(-1500,Math.min(1500,v));
const terminalEval=(fen,depth)=>{const c=new Chess(fen);if(c.isCheckmate())return{best:null,cp:-30000,pv:[],depth};if(c.isDraw()||c.isStalemate())return{best:null,cp:0,pv:[],depth};return null};
/* Analyse every position of a game. Cached and terminal positions are free; the rest run on a pool of
   single-thread engines in parallel (much faster than one multi-thread engine on tiny searches). */
async function evalMany(fens,depth,gid,onDone){
 const ev=new Array(fens.length),groups=new Map();let done=0;const total=fens.length;
 await Promise.all(fens.map(async(f,i)=>{const t=terminalEval(f,depth)||await db('evals','readonly',s=>s.get(f+'|'+depth));if(t){ev[i]=t;done++}else(groups.get(f)||groups.set(f,[]).get(f)).push(i)}));
 onDone(done,total);
 const todo=[...groups.keys()];
 const put=(f,r)=>{db('evals','readwrite',s=>s.put(r,f+'|'+depth));for(const i of groups.get(f))ev[i]=r;done+=groups.get(f).length;onDone(done,total)};
 if(todo.length){
  const n=Math.max(1,Math.min(todo.length,4,(navigator.hardwareConcurrency||2)-1)),pool=Array.from({length:n},()=>new Engine(true,16));let next=0;
  try{
   const ok=(await Promise.allSettled(pool.map(p=>p.start()))).map((r,i)=>r.status==='fulfilled'?pool[i]:null).filter(Boolean);
   await Promise.all(ok.map(async w=>{while(next<todo.length&&gid===S.gid){const f=todo[next++];let r;try{r=await w.analyze(f,depth)}catch(e){next--;console.warn('review worker failed',e);return}if(gid!==S.gid)return;put(f,r)}}))}
  finally{pool.forEach(p=>p.terminate())}
  if(gid!==S.gid)return null;
  for(const f of todo){if(ev[groups.get(f)[0]])continue;   // any position the pool could not finish goes to the main engine
   await bootP;if(!eng.ok)await eng.restart();put(f,await eng.analyze(f,depth));if(gid!==S.gid)return null}}
 return ev}
async function runReview(){
 if(S.busy&&!S.thinking)return;const hist=S.chess.history({verbose:true});if(!hist.length)return status('Play or import a game first');
 await cancelEngine();const gid=S.gid;await bootP;try{await eng.stop()}catch{}S.busy=true;S.reviewing=true;showTab('rev');$('#prog').hidden=false;const bar=$('#prog i');bar.style.width='0';
 const fens=[hist[0].before,...hist.map(h=>h.after)];status('Analysing…');let ev;
 try{ev=await evalMany(fens,set.depth,gid,(d,t)=>{bar.style.width=(d/t*100)+'%';if(gid===S.gid)status(`Analysing ${d} of ${t}`)})}
 catch(e){console.error(e);if(gid!==S.gid)return;S.busy=false;S.reviewing=false;$('#prog').hidden=true;showTab('play');status('Analysis stopped. The engine was restarted, try again.');try{await eng.restart()}catch{}return}
 if(gid!==S.gid)return;if(!ev){S.busy=false;S.reviewing=false;$('#prog').hidden=true;return}
 const u=hist.map(m=>m.from+m.to+(m.promotion||'')),cls=[],acc={w:[],b:[]};
 for(let i=0;i<hist.length;i++){const a=ev[i],b=ev[i+1],mv=hist[i].color;let best=clamp(a.cp),played=clamp(-b.cp);let cpl=u[i]===a.best?0:Math.max(0,best-played);if(u[i]===a.best)played=best;
  const drop=Math.max(0,wpct(best)-wpct(played));let name;
  let sac=false;if(b.pv&&b.pv[0]){try{const t=new Chess(fens[i+1]);t.move({from:b.pv[0].slice(0,2),to:b.pv[0].slice(2,4),promotion:b.pv[0][4]});sac=mat(fens[i],mv)-mat(t.fen(),mv)>=2.5}catch{}}
  if(cpl<20&&sac&&played>=-50&&best<700)name='Brilliant';else if(cpl>300||(cpl>150&&drop>=35))name='Blunder';else if(cpl>150)name='Mistake';else if(cpl>65)name='Inaccuracy';else if(cpl>30)name='Good';else if(cpl>15)name='Excellent';else name='Best';
  cls.push({name,cpl,drop});acc[mv].push(Math.max(1,Math.min(100,103.1668*Math.exp(-0.04354*drop)-3.1669)))}
 const hm=a=>a.length?(a.length/a.reduce((s,x)=>s+1/x,0)):0;
 S.rv={fens,ev,hist,ucis:u,cls,acc:{w:hm(acc.w),b:hm(acc.b)}};S.mode='review';S.ply=hist.length;S.branch=null;S.busy=false;S.reviewing=false;$('#prog').hidden=true;
 $('#accW').textContent=S.rv.acc.w.toFixed(1)+'%';$('#accB').textContent=S.rv.acc.b.toFixed(1)+'%';drawGraph();goPly(S.ply)}
const BADGE={Brilliant:'!!',Best:'★',Excellent:'!',Good:'✓',Inaccuracy:'?!',Mistake:'?',Blunder:'??'};
function drawReview(){const r=S.rv;if(!r)return;let o='';const h=r.hist;
 for(let i=0;i<h.length;i+=2){o+=`<span class="n">${i/2+1}.</span>`;for(const j of[i,i+1]){if(!h[j]){o+='<span></span>';continue}o+=`<span class="m ${j+1===S.ply&&!S.branch?'cur':''}" data-p="${j+1}">${h[j].san}${['Brilliant','Inaccuracy','Mistake','Blunder'].includes(r.cls[j].name)?`<i class="badge c-${r.cls[j].name}">${BADGE[r.cls[j].name]}</i>`:''}</span>`}}
 const mv=$('#moves');mv.innerHTML=o;const cur=mv.querySelector('.cur');if(cur){mv.scrollLeft=cur.offsetLeft-mv.clientWidth/2;mv.scrollTop=cur.offsetTop-mv.clientHeight/2}
 const c=r.cls[S.ply-1];$('#mvInfo').innerHTML=c?`<i class="badge c-${c.name}">${BADGE[c.name]}</i>${c.name==='Best'?'Best move':c.name}${c.cpl>=15?` <small>−${(c.cpl/100).toFixed(1)} pawns</small>`:''}`:'<span class="mute">Start position</span>';$('#bWhy').hidden=!c||!['Inaccuracy','Mistake','Blunder'].includes(c.name);
 const e=r.ev[S.ply],w=S.rv.fens[S.ply].split(' ')[1]==='w'?e.cp:-e.cp,mt=Math.abs(w)>20000;setBar(mt?Math.sign(w)*3000:w,mt?Math.sign(w)*(30000-Math.abs(w)):null);
 drawGraph()}
function drawGraph(){const r=S.rv,g=$('#graph');if(!r)return;const n=r.fens.length,pts=r.ev.map((e,i)=>{const w=r.fens[i].split(' ')[1]==='w'?e.cp:-e.cp;return[(i/(n-1||1))*400,55-(wpct(w)-50)]});
 const P=pts.map(p=>p.join(',')).join(' '),dot=(c,i)=>`<circle cx="${pts[i+1][0]}" cy="${pts[i+1][1]}" r="3" style="fill:${c.name==='Brilliant'?'#1aa3ad':c.name==='Blunder'?'var(--bad)':'#e08a2e'}"/>`;
 g.innerHTML=`<path d="M0,55 L${P.replace(/ /g,' L')} L400,55Z" style="fill:var(--accent);opacity:.28"/><polyline points="${P}" fill="none" style="stroke:var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="0" x2="400" y1="55" y2="55" style="stroke:var(--mute)" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".6"/>
 ${r.cls.map((c,i)=>['Mistake','Blunder','Brilliant'].includes(c.name)?dot(c,i):'').join('')}
 <line x1="${pts[S.ply][0]}" x2="${pts[S.ply][0]}" y1="0" y2="110" style="stroke:var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`}
function goPly(p){if(!S.rv)return;S.ply=Math.max(0,Math.min(S.rv.hist.length,p));S.branch=null;$('#pv').innerHTML='';render();const m=S.rv.hist[S.ply-1];if(m)sfx(m.captured?'cap':'move');status(S.ply?`Move ${Math.ceil(S.ply/2)}: ${m.san}`:'Start position')}
function showPv(fen,pv,label){const san=pvSan(fen,pv,10);$('#pv').innerHTML=`<div class="cap">${label}</div>`+san.map((s,i)=>`<span data-i="${i}">${s}</span>`).join('');
 $('#pv').onclick=e=>{const i=e.target.dataset.i;if(i==null)return;const c=new Chess(fen);let l=null;for(let k=0;k<=+i;k++){const m=c.move({from:pv[k].slice(0,2),to:pv[k].slice(2,4),promotion:pv[k][4]});l=[m.from,m.to]}S.branch={fen:c.fen(),last:l};render();sfx('move')}}
$('#bBest').onclick=()=>{if(!S.rv)return;const e=S.rv.ev[S.ply];if(e.pv.length)showPv(S.rv.fens[S.ply],e.pv,'Engine best line from here')};
$('#bWhy').onclick=()=>{if(!S.rv||!S.ply)return;const b=S.rv.ev[S.ply];showPv(S.rv.fens[S.ply],b.pv,`Why ${S.rv.hist[S.ply-1].san} fails — the punishing reply`)};
$('#moves').addEventListener('click',e=>{const p=e.target.closest('.m')?.dataset.p;if(p&&S.mode==='review')goPly(+p)});
$('#graph').addEventListener('click',e=>{if(!S.rv)return;const b=e.currentTarget.getBoundingClientRect();goPly(Math.round((e.clientX-b.left)/b.width*(S.rv.fens.length-1)))});
addEventListener('keydown',e=>{if(S.mode!=='review'||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
 if(e.key==='ArrowLeft'){goPly(S.ply-1);e.preventDefault()}else if(e.key==='ArrowRight'){goPly(S.ply+1);e.preventDefault()}else if(e.key==='Home')goPly(0);else if(e.key==='End')goPly(1e4)});
function showTab(t){const rv=t==='rev';document.body.dataset.view=rv?'rev':'play';$('#pPlay').hidden=rv;$('#pRev').hidden=!rv;
 if(rv){if(S.rv){S.mode='review';render()}}else{S.mode='play';S.branch=null;render();status(gameStatus()||(S.chess.turn()===S.human?'Your move':'Engine is thinking…'))}}
$('#tPlay').onclick=async()=>{if(S.reviewing)await cancelEngine();showTab('play');maybeEngine()};$('#bPrev').onclick=()=>goPly(S.ply-1);$('#bNext').onclick=()=>goPly(S.ply+1);

/* ---------- vault ---------- */
async function drawVault(){const all=(await db('games','readonly',s=>s.getAll()))||[];$('#vList').innerHTML=all.sort((a,b)=>b.id-a.id).map(g=>`<div class="g"><span>${new Date(g.date).toLocaleDateString()} · ${g.white} vs ${g.black} · ${g.result}</span><span><button type="button" class="btn" data-l="${g.id}">Review</button> <button type="button" class="btn" data-d="${g.id}">Delete</button></span></div>`).join('')||'<p class="mute">No saved games yet. Finished games are saved here automatically.</p>';
 $('#vList').onclick=async e=>{const l=e.target.dataset.l,d=e.target.dataset.d;if(d){await db('games','readwrite',s=>s.delete(+d));drawVault()}
  if(l){const g=await db('games','readonly',s=>s.get(+l)),p=g&&parseGame(g.pgn);if(p&&p.c){$('#dVault').close();openGame(p.c)}}}}
function parseGame(t){const c=new Chess();
 if(/^[rnbqkpRNBQKP1-8\/]+ [wb] /.test(t)){try{c.load(t);return{c,fen:true}}catch{return{err:'That FEN is not valid.'}}}
 try{c.loadPgn(t)}catch{return{err:'Could not read that PGN. Paste the move list or the whole file.'}}
 if(!c.history().length)return{err:'That PGN has no moves.'}
 return{c}}
async function openGame(c){await cancelEngine();S.chess=c;S.startFen=c.getHeaders().FEN||START;S.rv=null;S.human='w';S.orient='w';S.gameId=Date.now();runReview()}
$('#bVault').onclick=()=>{$('#vMsg').textContent='';drawVault();$('#dVault').showModal()};
$('#vImp').onclick=()=>{const t=$('#vText').value.trim();if(!t){$('#vMsg').textContent='Paste a PGN or FEN first.';return}
 const p=parseGame(t);if(p.err){$('#vMsg').textContent=p.err;return}$('#dVault').close();p.fen?newGame(p.c.fen()):openGame(p.c)};
const copy=async t=>{try{await navigator.clipboard.writeText(t)}catch{$('#vText').value=t;$('#vText').select();document.execCommand('copy')}};
$('#vPgn').onclick=()=>copy(S.chess.pgn());$('#vFen').onclick=()=>copy(S.chess.fen());

/* ---------- controls & settings ---------- */
$('#bNew').onclick=()=>$('#dNew').showModal();$('#dNew').addEventListener('click',e=>{const sd=e.target.closest('[data-side]')?.dataset.side;if(!sd)return;$('#side').value=sd;$('#dNew').close();newGame()});$('#bGo').onclick=()=>maybeEngine();$('#bUndo').onclick=undo;$('#bHint').onclick=hint;$('#bRun').onclick=()=>S.rv?showTab('rev'):runReview();
$('#bFlip').onclick=()=>{S.orient=S.orient==='w'?'b':'w';render()};
const sets={sMode:'mode',sTheme:'theme',sPieces:'pieces',sTime:'time',sHash:'hash',sThr:'thr',sDepth:'depth'};
function applyTheme(){const r=document.documentElement;r.dataset.theme=set.theme;r.dataset.mode=set.mode;const m=document.querySelector('meta[name=theme-color]');if(m)m.content=getComputedStyle(document.body).backgroundColor}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{applyTheme();render()});
$('#bSet').onclick=()=>{for(const[id,k]of Object.entries(sets))$('#'+id).value=set[k];$('#sPonder').checked=set.ponder;$('#sSound').checked=set.sound;
 $('#sNote').textContent=self.crossOriginIsolated?`Multi-threaded engine active (${eng.name}).`:`Single-threaded mode: ${eng.name}. Threads need cross-origin isolation (works after the service worker installs and the page reloads).`;$('#dSet').showModal()};
$('#dSet').addEventListener('close',async()=>{for(const[id,k]of Object.entries(sets))set[k]=typeof DEF[k]==='number'?+$('#'+id).value:$('#'+id).value;set.ponder=$('#sPonder').checked;set.sound=$('#sSound').checked;saveSet();applyTheme();applyPieces();
 if(!set.ponder){try{await eng.stop()}catch{}}
 if(!S.busy&&eng.ok){eng.threads=eng.name==='stockfish-19-lite.js'?set.thr:1;try{await eng.stop();await eng.options()}catch{}}render()});

/* ---------- boot ---------- */
const engLabel=()=>'Stockfish 19';
function setChip(t,c){const e=$('#eng');e.textContent=t;e.className='chip '+(c||'');e.title=eng.ok?`${eng.name}, ${eng.threads} thread${eng.threads>1?'s':''}, NNUE`:''}
(async()=>{applyTheme();applyPieces();render();setBar(0);
 if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;
  if(!self.crossOriginIsolated&&!sessionStorage.getItem('uc.coi')){sessionStorage.setItem('uc.coi','1');return location.reload()}}catch(e){console.warn('SW',e)}}
 const st=eng.start().then(()=>setChip(engLabel(),'ok')).catch(e=>{setChip('Engine unavailable','err');status('The engine could not start in this browser.')});
 bootP=st;st.then(bootDone);await st})();
