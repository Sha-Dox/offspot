/* =============================================
   Depot — Spotify Downloader
   ============================================= */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function parseSpotifyUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let cleaned = url.trim();
  const uriMatch = cleaned.match(/^spotify:(track|playlist|album|episode):([a-zA-Z0-9]+)$/);
  if (uriMatch) return { type: uriMatch[1], id: uriMatch[2] };
  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname.includes('spotify.com')) return null;
    const parts = parsed.pathname.replace(/^\/+/, '').split('/');
    if (parts.length >= 2) {
      const type = parts[0];
      const id = parts[1].split('?')[0];
      if (/^[a-zA-Z0-9]{22}$/.test(id)) return { type, id };
    }
  } catch {}
  return null;
}

const Spofify = {
  _tokenUrl: 'https://spotify.xwolf.space/api/token',
  _baseUrl: 'https://spotify.xwolf.space/api',
  _token: null,
  _tokenExpiry: 0,

  async _getToken() {
    if (this._token && Date.now() < this._tokenExpiry) return this._token;
    const res = await fetch(this._tokenUrl);
    if (!res.ok) throw new Error('Token API error');
    const data = await res.json();
    if (!data.access_token) throw new Error('No access token');
    this._token = data.access_token;
    this._tokenExpiry = Date.now() + 55 * 60 * 1000;
    return this._token;
  },

  async _fetch(path) {
    const token = await this._getToken();
    const res = await fetch(`${this._baseUrl}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async getTrack(id) { return this._fetch(`/track/${id}`); },
  async getPlaylist(id) { return this._fetch(`/playlist/${id}`); },
};

const Piped = {
  _instances: [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://api.piped.yt',
  ],
  _idx: 0,

  get _base() { return this._instances[this._idx]; },

  async _fetch(path) {
    for (let attempt = 0; attempt < this._instances.length; attempt++) {
      try {
        const res = await fetch(`${this._base}${path}`);
        if (!res.ok) throw new Error(`Piped error: ${res.status}`);
        return await res.json();
      } catch {
        this._idx = (this._idx + 1) % this._instances.length;
      }
    }
    throw new Error('All Piped instances failed');
  },

  async search(query) {
    const data = await this._fetch(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    if (!data.items || !data.items.length) {
      const fallback = await this._fetch(`/search?q=${encodeURIComponent(query)}&filter=videos`);
      return fallback.items || [];
    }
    return data.items;
  },

  async getStreams(videoId) {
    const id = videoId.replace(/^\/watch\?v=/, '');
    return this._fetch(`/streams/${id}`);
  },

  async getAudioUrl(query) {
    const items = await this.search(query);
    if (!items.length) return null;
    const streams = await this.getStreams(items[0].url);
    if (!streams.audioStreams || !streams.audioStreams.length) return null;
    const best = streams.audioStreams
      .filter(a => a.mimeType && a.mimeType.includes('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    return best ? { url: best.url, quality: best.quality, title: streams.title } : null;
  },
};

function showToast(message, type = 'info', duration = 4000) {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function formatDuration(ms) {
  if (!ms) return '';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function showResults(html) {
  const section = $('#results');
  const container = $('#result-content');
  section.classList.remove('hidden');
  container.innerHTML = html;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showLoading() {
  showResults(`
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <span class="loading-text">fetching...</span>
    </div>
  `);
}

function showError(title, message) {
  showResults(`
    <div class="error-card">
      <span class="error-icon">!</span>
      <div>
        <div class="error-title">${title}</div>
        <div class="error-message">${message}</div>
      </div>
    </div>
  `);
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJs(s) {
  if (!s) return '';
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"');
}

function renderTrackCard(data) {
  const title = data.title || 'Unknown';
  const artist = data.artist || data.artists || 'Unknown';
  const cover = data.thumbnail || data.cover || '';
  const duration = formatDuration(data.duration_ms);
  const previewUrl = data.preview_url || '';
  const query = `${title} ${artist}`.trim();

  return `
    <div class="track-card">
      ${cover ? `<div class="track-artwork"><img src="${cover}" alt="${title}" loading="lazy"></div>` : ''}
      <div class="track-info">
        <div class="track-label">Track</div>
        <div class="track-name">${esc(title)}</div>
        <div class="track-artist">${esc(artist)}</div>
        <div class="track-meta">
          ${duration ? `<span class="track-duration">${duration}</span>` : ''}
          <span class="track-badge">spotify</span>
        </div>
      </div>
      <div class="track-actions" style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary" onclick="downloadSingle('${escJs(query)}', this)">Download</button>
        ${previewUrl ? `<audio controls style="height:32px;width:180px"><source src="${previewUrl}"></audio>` : ''}
      </div>
    </div>
  `;
}

var _playlistTracks = [];
var _selectedTracks = new Set();

function toggleAllTracks(checked) {
  if (checked) {
    _playlistTracks.forEach((_, i) => _selectedTracks.add(i));
  } else {
    _selectedTracks.clear();
  }
  $$('.track-checkbox').forEach(cb => { cb.checked = checked; });
  updateSelectionCount();
}

function toggleTrack(index, checked) {
  if (checked) _selectedTracks.add(index);
  else _selectedTracks.delete(index);
  updateSelectionCount();
}

function updateSelectionCount() {
  const el = $('#selection-count');
  if (el) el.textContent = `${_selectedTracks.size} of ${_playlistTracks.length} selected`;
  const btn = $('#download-selected-btn');
  if (btn) btn.disabled = _selectedTracks.size === 0;
}

function renderPlaylistCard(playlistData) {
  const p = playlistData.playlist || playlistData;
  const name = p.name || 'Playlist';
  const owner = p.owner || '';
  const cover = p.thumbnail || '';
  const total = p.total_tracks || (p.tracks ? p.tracks.length : 0);
  const tracks = p.tracks || [];
  _playlistTracks = tracks;
  _selectedTracks = new Set(tracks.map((_, i) => i));

  const items = tracks.map((t, i) => {
    return `
      <li class="track-list-item">
        <label class="track-checkbox-wrap">
          <input type="checkbox" class="track-checkbox" checked onchange="toggleTrack(${i}, this.checked)">
        </label>
        <span class="track-list-index">${i + 1}</span>
        <div class="track-list-info">
          <div class="track-list-name">${esc(t.title || 'Unknown')}</div>
          <div class="track-list-artist">${esc(t.artist || '')}</div>
        </div>
        ${t.duration ? `<span class="track-list-duration">${t.duration}</span>` : ''}
        <span class="track-status" id="track-status-${i}"></span>
      </li>
    `;
  }).join('');

  return `
    <div class="playlist-card">
      <div class="playlist-header">
        ${cover ? `<div class="playlist-artwork"><img src="${cover}" alt="${esc(name)}" loading="lazy"></div>` : ''}
        <div class="playlist-info">
          <div class="playlist-label">Playlist</div>
          <div class="playlist-name">${esc(name)}</div>
          ${owner ? `<div class="playlist-owner">${esc(owner)}</div>` : ''}
          <div class="playlist-stats">
            <span class="playlist-count">${total} tracks</span>
            <span class="playlist-count" id="selection-count">${total} of ${total} selected</span>
          </div>
          <div class="playlist-actions">
            <button class="btn btn-ghost btn-sm" onclick="toggleAllTracks(true)">Select All</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleAllTracks(false)">Deselect All</button>
            <button class="btn btn-primary" id="download-selected-btn" onclick="downloadSelected()">Download Selected</button>
          </div>
        </div>
      </div>
      <div class="download-progress hidden" id="download-progress">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <span class="progress-text" id="progress-text"></span>
      </div>
      <ul class="track-list">
        ${items || '<li class="track-list-item" style="justify-content:center;color:var(--color-fog);padding:var(--spacing-48)">No tracks found</li>'}
      </ul>
    </div>
  `;
}

async function downloadSingle(query, btn) {
  btn.disabled = true;
  btn.textContent = 'Searching...';
  try {
    const result = await Piped.getAudioUrl(query);
    if (!result) { showToast('No audio found', 'error'); btn.disabled = false; btn.textContent = 'Download'; return; }
    triggerDownload(result.url, result.title || query);
    btn.textContent = 'Done';
    showToast(`Downloading: ${result.title}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Download';
  }
}

function triggerDownload(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadSelected() {
  const indices = [..._selectedTracks].sort((a, b) => a - b);
  if (!indices.length) return;

  const progressWrap = $('#download-progress');
  const progressFill = $('#progress-fill');
  const progressText = $('#progress-text');
  const dlBtn = $('#download-selected-btn');
  progressWrap.classList.remove('hidden');
  dlBtn.disabled = true;
  dlBtn.textContent = 'Downloading...';

  let done = 0;
  let failed = 0;

  for (const i of indices) {
    const t = _playlistTracks[i];
    const query = `${t.title} ${t.artist}`.trim();
    const statusEl = $(`#track-status-${i}`);
    if (statusEl) statusEl.textContent = 'searching...';
    if (statusEl) statusEl.className = 'track-status searching';

    try {
      const result = await Piped.getAudioUrl(query);
      if (!result) throw new Error('not found');
      triggerDownload(result.url, result.title || query);
      if (statusEl) { statusEl.textContent = 'done'; statusEl.className = 'track-status done'; }
      done++;
    } catch {
      if (statusEl) { statusEl.textContent = 'failed'; statusEl.className = 'track-status failed'; }
      failed++;
    }

    const pct = Math.round(((done + failed) / indices.length) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${done + failed} / ${indices.length} (${failed} failed)`;

    await new Promise(r => setTimeout(r, 300));
  }

  dlBtn.disabled = false;
  dlBtn.textContent = 'Download Selected';
  showToast(`Done: ${done} downloaded, ${failed} failed`, failed ? 'error' : 'success');
}

async function handleFetch(url) {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) {
    showError('Invalid URL', 'Paste a valid Spotify track, playlist, or album URL.');
    return;
  }
  showLoading();
  const { type, id } = parsed;
  try {
    if (type === 'track' || type === 'episode') {
      const data = await Spofify.getTrack(id);
      if (!data.success || !data.track) throw new Error(data.error || 'Could not fetch track');
      showResults(renderTrackCard(data.track));
    } else if (type === 'playlist' || type === 'album') {
      const data = await Spofify.getPlaylist(id);
      if (!data.success || !data.playlist) throw new Error(data.error || 'Could not fetch playlist');
      showResults(renderPlaylistCard(data));
    } else {
      showError('Unsupported type', `"${type}" is not supported yet.`);
    }
  } catch (err) {
    showError('Something went wrong', err.message);
  }
}

function init() {
  const input = $('#url-input');
  const fetchBtn = $('#fetch-btn');
  const settingsToggle = $('#settings-toggle');
  const settingsPanel = $('#settings-panel');

  input.addEventListener('input', () => { fetchBtn.disabled = !input.value.trim(); });

  fetchBtn.addEventListener('click', () => {
    const url = input.value.trim();
    if (!url) return;
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';
    handleFetch(url).finally(() => {
      fetchBtn.disabled = false;
      fetchBtn.textContent = 'Fetch';
    });
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !fetchBtn.disabled) fetchBtn.click();
  });

  input.addEventListener('paste', () => {
    setTimeout(() => {
      if (parseSpotifyUrl(input.value.trim())) fetchBtn.click();
    }, 50);
  });

  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });
}

document.addEventListener('DOMContentLoaded', init);
