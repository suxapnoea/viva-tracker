# Viva Tracker PWA

A mobile-first Progressive Web App for quickly logging and revising oral/viva practice.

## Run locally

Serve this folder over HTTP (service workers do not run from `file://`). For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Install on iPhone

1. Host the folder on any HTTPS-capable static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel, etc.).
2. Open the site in Safari on iPhone.
3. Tap Share → Add to Home Screen.

## Data

- Stored in browser `localStorage` in v1.
- Export/import uses a versioned JSON backup structure.
- Storage functions are isolated in `app.js`, making it straightforward to replace local persistence with an API/cloud repository later.

## Included features

- Adjustable daily goal and goal-based streak
- Quick Log from Home
- Detailed optional logging
- Reverse-direction revision queue
- One-tap return scheduling
- Monthly calendar
- Searchable history
- Versioned JSON export/import
- Offline PWA cache and app icons
