<p align="center">
  <img src="logo.svg" width="80" alt="Offspot">
</p>

<h1 align="center">offspot</h1>

<p align="center">
  Drop a Spotify link. Pick what you want. Download the audio.<br>
  <sub>No backend. No login. Just a URL and a browser.</sub>
</p>

<p align="center">
  <a href="https://sha-dox.github.io/offspot/"><strong>Open Offspot &rarr;</strong></a>
</p>

---

## What it does

Paste a Spotify track, playlist, or album URL and Offspot fetches the metadata, searches for matching audio on YouTube via [Piped](https://github.com/TeamPiped/Piped), and downloads the audio via [cobalt.tools](https://cobalt.tools) — a fast, CDN-backed direct MP3 download.

For playlists, it lists every track with checkboxes so you can uncheck the ones you don't want before downloading.

## Features

- **Fast audio downloads** — cobalt.tools CDN delivers direct MP3 files, no YouTube tab spam
- **3 concurrent downloads** — playlists process in parallel, not sequentially
- **Playlist selection** — checkboxes on every track, select/deselect all
- **Download queue** — parallel processing with per-track status and progress bar
- **Instance rotation** — automatically falls back to another Piped/Cobalt instance if one is down
- **Zero backend** — everything runs in your browser, deploy anywhere static files work

## How it works

```
Spotify URL → wolfXspotify API (metadata) → Piped API (YouTube search) → cobalt.tools (audio extraction) → CDN download
```

- **wolfXspotify** — free, CORS-enabled Spotify API. No auth needed.
- **Piped** — privacy-friendly YouTube frontend. Used for track matching only.
- **cobalt.tools** — open-source media download service. Returns direct CDN audio URLs.

## Usage

1. Open [offspot](https://sha-dox.github.io/offspot/)
2. Paste a Spotify URL (track, playlist, or album)
3. For playlists: uncheck tracks you don't want
4. Hit **Download Selected**

## Run locally

```bash
git clone https://github.com/Sha-Dox/offspot.git
cd offspot
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Stack

Vanilla HTML, CSS, JS. No build step. No dependencies. No framework.

## License

MIT
