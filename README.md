# UnChessable

Fully offline, client-side chess against Stockfish 19 (NNUE) with a full post-game review suite. No backend, no paid APIs. Installable as a PWA.

## Run
Serve the folder over HTTP(S) (service workers do not run from `file://`):

    python3 -m http.server 8000   # then open http://localhost:8000

### Deploy
- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root.
- **Cloudflare Pages:** connect the repo, no build command, output directory `/`.

`sw.js` injects `COOP/COEP` headers so the multi-threaded engine works on static hosts. On first visit the page reloads once after the service worker installs.

## What's inside
- Stockfish 19 lite NNUE (multi-thread → single-thread → asm.js fallback chain), in a Web Worker, Skill 20, configurable Hash/Threads, pondering with `ponderhit`.
- `chess.js` is the sole rules authority; input is locked while the engine thinks.
- Built-in opening book (29 mainlines, JSON/SAN), SVG pieces (Staunton and Classic sets), 3 board themes, arrows (right-drag; Shift/Ctrl/Alt change colour) and square highlights, Web Audio synthesized sounds.
- Review: per-ply analysis cached in IndexedDB by FEN+depth, move classification (Brilliant → Blunder), harmonic-mean accuracy, eval graph, ←/→ navigation, best line and refutation lines as clickable branches.
- PGN vault (IndexedDB), PGN/FEN import and copy.

## Using the full-strength net
The repo ships the *lite* network (~1.7 MB) because the full one is ~99 MB (too big for GitHub/PWA caching). To use it, copy `stockfish-19.js` + `stockfish-19.wasm` (or `-single`) from the `stockfish` npm package into `engine/` and put that filename first in `Engine.start()` in `app.js`. Use Git LFS or Cloudflare Pages for the 99 MB file.

Stockfish is GPL-3.0 (see `engine/GPL-3.0-Stockfish.txt`).

Piece art: `pieces/merida` (Armando Hernandez Marroquin) and `pieces/cburnett` (Colin M.L. Burnett), both GPLv2+, taken from the lichess piece sets.

Font: Archivo (variable, OFL 1.1) in `fonts/`, bundled so the app works offline.
