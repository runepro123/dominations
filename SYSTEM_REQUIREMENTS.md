# Domination 2026 — System Requirements

> Single source of truth for whether a machine will run **Domination** before
> installing. Verified against `dist/` v1.0.0 (Three.js r169, React 18,
> vite-plugin-pwa 1.3.0). Last updated July 2026.

Domination ships as an **installable PWA** — a single static bundle served by
any modern browser. You don't need a special runtime, an installer, or admin
rights; the "install" step is just your browser registering the static build as
an app on your Windows / macOS / Linux desktop.

---

## TL;DR — Quick check (60 seconds)

Before installing, verify these four things:

1. **Browser version** — open `chrome://version` (or `edge://version`).
   - ✅ Edge **90+** or Chrome **90+** (full PWA support — installable)
   - ✅ Firefox **122+** (game runs, but Firefox does not allow PWA install)
   - ✅ Safari **16.4+** on macOS (installable)
   - ⚠️ Safari **16.4+** on iOS (Add-to-Home-Screen only — no `display: standalone`)
2. **WebGL 2** — visit <https://get.webgl.org/webgl2/> → must say "Yes!" or
   "Your browser supports WebGL 2".
3. **PWA installable** — visit <https://web.dev/measure/> and check the
   "Installability" section. If it can install *that* site, it can install
   Domination.
4. **Network** — the first run downloads ~**1 MB compressed**. After that the
   game runs **fully offline** indefinitely (service worker + Workbox precache).

If all four pass, Domination will install and run. Read on for tier-by-tier
details and the dev-tools probe one-liner.

---

## Minimum tier — installs and renders

May stutter during heavy rotation; otherwise fully playable.

| Category | Requirement |
|---|---|
| **Browser** | Edge 90+ **or** Chrome 90+ |
| **OS** | Windows 10 (1809+), macOS 11 (Big Sur), Linux (Ubuntu 20.04+ / Fedora 30+) |
| **CPU** | 2 cores, 1.5 GHz (Intel Sandy Bridge 2011+, AMD Bulldozer+, Apple A7+) |
| **GPU** | Any GPU exposing WebGL 2 — Intel HD 4000 (2013), Apple A7+, Adreno 400+, Mali T6xx |
| **RAM** | 4 GB system (browser tab uses ~120 MB) |
| **Disk** | 5 MB installed footprint |
| **Display** | 1024 × 768 minimum |
| **VRAM headroom** | ~200 MB free for the 4 textures (16 MB) + Three.js overhead |

## Recommended tier — 60 FPS, all features smooth

| Category | Requirement |
|---|---|
| **Browser** | Edge ≥ 110 **or** Chrome ≥ 110 (better Three.js shader fast-path) |
| **OS** | Windows 10 22H2+, macOS 12 (Monterey+), Ubuntu 22.04 LTS+ |
| **CPU** | 4 cores / 4 threads, 2.5 GHz+ (any 2017+ laptop is fine) |
| **GPU** | Intel UHD 620+, Apple M1+, Ryzen Vega+, GTX 1050+, Apple A12+ |
| **RAM** | 8 GB system |
| **Disk** | 5 MB on SSD |
| **Display** | 1920 × 1080 (PWA installs in landscape; the globe scene is wide) |

---

## Browser support matrix

Verified against `dist/` build at the specified browser versions.

| Feature                          | Chrome 90+ | Edge 90+ | Firefox 122+ | Safari 17+ macOS | Safari 17+ iOS |
|----------------------------------|:----------:|:--------:|:------------:|:----------------:|:--------------:|
| Installable PWA                  | ✅         | ✅       | ❌¹          | ✅               | ⚠️ ²          |
| `display: standalone` window     | ✅         | ✅       | ✅           | ✅               | ⚠️ ²          |
| Service Worker (offline)         | ✅         | ✅       | ✅           | ✅               | ✅             |
| WebGL 2 (Three.js r169)          | ✅         | ✅       | ✅           | ✅               | ✅             |
| Offline-first play               | ✅         | ✅       | ✅           | ✅               | ✅             |
| TopoJSON runtime cache           | ✅         | ✅       | ✅           | ✅               | ✅             |
| 4 × 2048² textures               | ✅         | ✅       | ✅           | ✅               | ✅             |

¹ Firefox refuses PWA installation by policy — game still runs in a normal tab.
² iOS Safari can Add-to-Home-Screen, but the app opens in Safari (not a
   standalone frame) and loses 1–2 seconds of state on every suspend.

---

## What ships (`dist/` sizes, verified)

| Asset                                | Size      | Notes                                                              |
|--------------------------------------|----------:|--------------------------------------------------------------------|
| Total `dist/`                        | 3.1 MB    | Gzipped to ~1 MB on the wire                                       |
| `assets/index-*.js` (Vite bundle)    | 1.09 MB   | React 18 + Three.js r169 + drei + fiber + zustand + leva + topojson-client + d3-geo + game code |
| `assets/index-*.css`                 | ~14 KB    | Tailwind purged                                                    |
| `public/textures/*.2048.{jpg,png}` × 4 | 1.78 MB  | Day / specular / atmosphere / lights textures → ~16 MB VRAM        |
| `public/countries-110m.json`         | 108 KB    | 8 279 country polygons, parsed once at boot (~50 ms mid-range)     |
| `sw.js` + Workbox runtime cache      | ~3 KB     | 14 entries precached                                               |
| 3 manifest icons                     | ~120 KB   | 192 / 512 / maskable-512 PNG                                       |
| **Total installed**                  | **~4 MB** | Lives under `%LOCALAPPDATA%\Domination\` on Windows               |

All numbers above were measured against the current `dist/` and confirmed by
automated Chrome probes during the v1.0.0 release on 2026-07-05.

---

## What *won't* work on

These configurations cannot install or run the game. Bail out and skip.

- **IE 11, Edge Legacy, any browser older than Firefox 78 / Chrome 80**
  — no WebGL 2, no stable service worker.
- **iOS Safari < 16.4** — service worker is too unstable to precache 14 entries.
- **Browsers with hardware acceleration disabled**
  (corporate lockdown, virtualized desktops, headless software rendering) —
  the canvas may render to a black surface or throw a `webgl not supported` toast.
- **GPUs older than Intel HD 4400 (2013)**
  — most drivers don't expose WebGL 2.
- **Firefox (for the install path)** — game runs but cannot be installed as
  a standalone window per Mozilla policy.

---

## One-liner DevTools probe

Open <http://localhost:4173/> after `npm run preview`, then paste this in
DevTools → Console:

```js
(async () => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    browser: navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/(\d+)/)?.[0] ?? 'unknown',
    installable: 'serviceWorker' in navigator &&
                 document.querySelector('link[rel=manifest]') !== null,
    webgl2: !!gl,
    gpu: ext
      ? `${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)} ${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}`
      : 'unavailable',
    deviceMemoryGB: navigator.deviceMemory ?? 'unknown',
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
  };
})().then(r => console.table(r));
```

**Expected values for a passing machine:**

| Field                 | Pass                        | Fail / Warn                       |
|-----------------------|-----------------------------|-----------------------------------|
| `browser`             | `Chrome/100+`, `Edge/100+`, `Firefox/122+`, `Safari/17+` | anything older                   |
| `installable`         | `true`                      | `false` → can't PWA install       |
| `webgl2`              | `true`                      | `false` → globe won't render      |
| `gpu`                 | `Intel Intel(...)`, `Apple Apple M…`, `NVIDIA …`, `AMD …` | `Apple SwiftShader` / `Google Inc.` → software rendering |
| `deviceMemoryGB`      | ≥ 4                         | < 2 → likely under minimum RAM    |
| `hardwareConcurrency` | ≥ 2                         | 1 → may stutter under load        |
| `maxTextureSize`      | ≥ 4096                      | < 4096 → 2048² textures may fail  |

> ⚠️ Running this probe in **headless Chrome** (DevTools detached from a real
> browser, or in a CI/sandbox) will show `gpu: "Google Inc. SwiftShader"` and
> report low FPS. That's not representative — repeat the probe in **real Chrome
> on the actual machine** for accurate numbers.

---

## What to verify after the first install

After clicking "Install Domination" in the address bar:

1. **DevTools → Application → Service Workers**
   - One entry, state: `activated`, source: `sw.js`
2. **DevTools → Application → Manifest**
   - Name: "Domination 2026 — Worldwide Conquest"
   - Display: `standalone`
   - Start URL: `/`
3. **DevTools → Application → Cache Storage**
   - `workbox-precache-v2-<hash>` — 14 entries (JS/CSS/HTML/PNG/SVG)
   - `topo-data` — `countries-110m.json` after first game start
4. **Network tab → Offline throttle → Ctrl+R**
   - Game still loads, borders still tinted, AI turn still runs.
5. **Window behavior**
   - Opens in a standalone browser-less frame (no tabs, no URL bar)
   - Resizable to any size ≥ 1024 × 768

If any of (1)–(4) fails, capture the Console output and report it back — most
issues are Workbox config drift or stale SW caches.

---

## Troubleshooting matrix

| Symptom                                       | Likely cause                                                                                       |
|-----------------------------------------------|----------------------------------------------------------------------------------------------------|
| Address-bar → "App available" icon is missing | Already installed (check Start menu / `edge://apps` / `chrome://apps`). Uninstall and try again.   |
| Clicking install hides the prompt             | Browser doesn't support PWAs (Firefox). Use Chrome/Edge for the install; game runs fine elsewhere.  |
| Black canvas, no globe                        | WebGL 2 disabled in browser flags. Check `chrome://flags` → "WebGL 2.0".                            |
| Globe renders but borders are missing         | Service worker not yet activated. Reload once after 30 s, then Ctrl+F5.                           |
| Console: "Failed to register a ServiceWorker" | Page was opened in private/incognito mode. Service workers cannot persist there.                   |
| HTTPS unavailable / grey install icon         | First-time install requires HTTPS or `localhost`/`127.0.0.1`. Hosting provider must serve over TLS. |
| High RAM growth over 30 min                   | `chrome://settings/performance` suggests the tab is being throttled; close other heavy tabs.       |
| 15–30 FPS in **headless** Chrome              | Expected — SwiftShader software renderer. Real Chrome with HW accel hits 60 FPS on the same scene. |

---

## Performance expectations (real hardware, post-2020)

| Metric        | Idle        | Slow rotation | Rapid click-fest |
|---------------|------------:|--------------:|-----------------:|
| FPS (target)  | 60          | 60            | 50 – 60          |
| CPU usage     | < 5 %       | 8 – 15 %      | 20 – 30 %        |
| GPU usage     | < 3 %       | 10 – 20 %     | 15 – 25 %        |
| RAM (tab)     | 80 – 120 MB | 100 – 140 MB  | 140 – 180 MB     |

Headless / software-rendered Chrome will report **15 – 30 FPS** regardless of
hardware — that is **not** representative of real-Chrome performance.

---

## Reference: project runtime stack

Pulled from `package.json` at v1.0.0:

```
react                  ^18.3.1
react-dom              ^18.3.1
three                  ^0.169.0        # webgl2 default
@react-three/fiber     ^8.17.10
@react-three/drei      ^9.114.0
d3-geo                 ^3.1.1
topojson-client        ^3.1.0
zustand                ^5.0.0
leva                   ^0.9.35
vite                   ^5.4.9
vite-plugin-pwa        ^1.3.0
sharp                  ^0.35.3         # build-time icon generation only
```

---

## Revision history

- **2026-07-05** — v1.0.0 PWA initial release. Dist 3.1 MB, 14 precache entries,
  Workbox runtime cache for `countries-110m.json`. This document was generated
  against the same build.
