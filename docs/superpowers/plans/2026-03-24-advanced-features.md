# Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 advanced feature tabs (presets, layers, binaural, sweep, envelope, keyboard) behind a progressive-disclosure tab bar while keeping the core tone generator clean and simple.

**Architecture:** Split the monolithic `index.html` into ES modules (`<script type="module">`). The HTML file keeps all markup and CSS. JS modules handle audio graph, each tab feature, URL params, and visualization. A central `audio.js` module manages the always-stereo dual-oscillator graph with separate envelope and master gain nodes.

**Tech Stack:** Vanilla JS (ES modules), Web Audio API, HTML Canvas, CSS

**Spec:** `docs/superpowers/specs/2026-03-24-advanced-features-design.md`

---

## File Structure

```
index.html              — HTML structure + all CSS (modify)
js/
  main.js               — Entry point, wires modules together
  audio.js              — Audio graph: dual oscillators, envelopeGain, masterGain, analyser
  utils.js              — Shared: freqToNote, sliderToFreq, freqToSlider, constants
  ui.js                 — Shared UI helpers: updateFreqUI (avoids circular imports)
  visualizer.js         — Canvas waveform drawing
  tabs.js               — Tab bar toggle logic
  presets.js             — Presets tab behavior
  layers.js             — Layers tab: add/remove/manage extra oscillators
  binaural.js           — Binaural tab: R oscillator offset
  sweep.js              — Sweep tab: rAF-based frequency sweep
  envelope.js           — Envelope tab: ADSR controls + curve visualization
  keyboard.js           — Keyboard tab: key-to-note mapping + visual piano
  params.js             — URL param serialize/deserialize for all features
```

**Responsibilities:**
- `audio.js` owns all Web Audio nodes and exposes functions: `startAudio()`, `stopAudio()`, `setFrequency(f)`, `setWaveform(type)`, `setVolume(v)`, `setBinauralOffset(hz)`, `addLayer()`, `removeLayer(i)`, `setEnvelope({a,d,s,r})`, `getAnalyser()`. It does NOT touch the DOM.
- `utils.js` is pure functions, no state, no DOM.
- `ui.js` contains `updateFreqUI()` — a shared UI helper that updates the frequency display, slider, and note name. It imports only from `utils.js`, not from `main.js`. This avoids circular imports: `presets.js`, `sweep.js`, `keyboard.js`, and `params.js` all import from `ui.js` instead of `main.js`.
- Each tab module exports an `init(audioApi)` function that sets up its DOM listeners and interacts with audio through the `audioApi` object.
- `params.js` exports `loadFromURL()` and `serializeToURL()`, called by main and share button.
- `main.js` imports everything, initializes, and wires up the core controls (frequency, waveform, volume, play/stop, share). It does NOT export anything — no other module imports from `main.js`.

---

### Task 1: Extract utilities and set up module structure

**Files:**
- Create: `js/utils.js`
- Create: `js/ui.js`
- Modify: `index.html`

- [ ] **Step 1: Create `js/utils.js`**

```js
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const MIN_FREQ = 20;
export const MAX_FREQ = 20000;
export const LOG_MIN = Math.log(MIN_FREQ);
export const LOG_MAX = Math.log(MAX_FREQ);

export function freqToNote(freq) {
  const semitones = 12 * Math.log2(freq / 440);
  const midi = Math.round(69 + semitones);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  const cents = Math.round((69 + semitones - midi) * 100);
  const centsStr = cents === 0 ? '' : (cents > 0 ? `+${cents}` : `${cents}`);
  return `${name}${octave}${centsStr ? ' ' + centsStr + '¢' : ''}`;
}

export function sliderToFreq(t) {
  return Math.round(Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN)));
}

export function freqToSlider(f) {
  return (Math.log(f) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}

export function noteToFreq(note, octave) {
  const midi = (octave + 1) * 12 + note;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function clampFreq(f) {
  return Math.max(MIN_FREQ, Math.min(MAX_FREQ, f));
}
```

- [ ] **Step 2: Create `js/ui.js`**

Shared UI helper that updates the frequency display. Imports only from `utils.js` — no circular deps.

```js
import { freqToNote, freqToSlider } from './utils.js';

export function updateFreqUI(f) {
  document.getElementById('freqNum').value = Math.round(f);
  document.getElementById('freqSlider').value = freqToSlider(f);
  document.getElementById('noteName').textContent = freqToNote(f);
}
```

- [ ] **Step 3: Verify module loads**

Change `index.html`: replace `<script>` with `<script type="module" src="js/main.js"></script>`. Create a minimal `js/main.js` that imports from `utils.js` and logs to console.

```js
// js/main.js (temporary test)
import { freqToNote, MIN_FREQ } from './utils.js';
console.log('Antone modules loaded', freqToNote(440), MIN_FREQ);
```

Run: `python3 -m http.server 8787` and open `http://localhost:8787` in browser.
Expected: Console shows "Antone modules loaded A4 20", page is otherwise blank (old inline script removed).

- [ ] **Step 4: Commit**

```bash
git add js/utils.js js/ui.js js/main.js index.html
git commit -m "feat: extract utilities into ES module structure"
```

---

### Task 2: Audio graph module

**Files:**
- Create: `js/audio.js`

The core audio engine. Always creates two oscillators (L/R) with stereo panners, plus separate envelopeGain and masterGain nodes. Exposes a clean API for all other modules.

- [ ] **Step 1: Create `js/audio.js`**

```js
import { clampFreq } from './utils.js';

let audioCtx = null;
let oscL = null;
let oscR = null;
let panL = null;
let panR = null;
let envelopeGain = null;
let masterGain = null;
let analyser = null;
let isPlaying = false;
let isReleasing = false;
let releaseTimeout = null;

// Layer state
const layers = []; // [{osc, gain, freq, waveform, volume, interval}]

// Current state
let currentFreq = 440;
let currentWave = 'sine';
let currentVolume = 0.5;
let binauralOffset = 0;
let envelope = { a: 0, d: 0, s: 100, r: 0 };

function ensureContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function applyAttack() {
  const ctx = audioCtx;
  const now = ctx.currentTime;
  envelopeGain.gain.cancelScheduledValues(now);
  envelopeGain.gain.setValueAtTime(0, now);
  if (envelope.a > 0) {
    envelopeGain.gain.linearRampToValueAtTime(1, now + envelope.a / 1000);
  } else {
    envelopeGain.gain.setValueAtTime(1, now);
  }
  if (envelope.d > 0) {
    const attackEnd = now + envelope.a / 1000;
    const sustainLevel = envelope.s / 100;
    envelopeGain.gain.linearRampToValueAtTime(sustainLevel, attackEnd + envelope.d / 1000);
  }
}

function applyRelease(callback) {
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const currentGainVal = envelopeGain.gain.value;
  envelopeGain.gain.cancelScheduledValues(now);
  envelopeGain.gain.setValueAtTime(currentGainVal, now);
  if (envelope.r > 0) {
    envelopeGain.gain.linearRampToValueAtTime(0, now + envelope.r / 1000);
    releaseTimeout = setTimeout(callback, envelope.r);
  } else {
    envelopeGain.gain.setValueAtTime(0, now);
    callback();
  }
}

export function startAudio() {
  if (isReleasing) {
    clearTimeout(releaseTimeout);
    isReleasing = false;
    applyAttack();
    return;
  }
  if (isPlaying) return;

  const ctx = ensureContext();

  oscL = ctx.createOscillator();
  oscR = ctx.createOscillator();
  panL = ctx.createStereoPanner();
  panR = ctx.createStereoPanner();
  envelopeGain = ctx.createGain();
  masterGain = ctx.createGain();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;

  oscL.type = currentWave;
  oscR.type = currentWave;
  oscL.frequency.value = currentFreq;
  oscR.frequency.value = currentFreq + binauralOffset;
  panL.pan.value = -1;
  panR.pan.value = 1;
  masterGain.gain.value = currentVolume;
  envelopeGain.gain.value = 0;

  oscL.connect(panL);
  panL.connect(envelopeGain);
  oscR.connect(panR);
  panR.connect(envelopeGain);
  envelopeGain.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(ctx.destination);

  // Start layer oscillators
  for (const layer of layers) {
    if (layer.enabled) {
      layer.osc = ctx.createOscillator();
      layer.gain = ctx.createGain();
      layer.osc.type = layer.waveform;
      layer.osc.frequency.value = layer.freq;
      layer.gain.gain.value = layer.volume / 100;
      layer.osc.connect(layer.gain);
      layer.gain.connect(envelopeGain);
      layer.osc.start();
    }
  }

  oscL.start();
  oscR.start();

  isPlaying = true;
  applyAttack();
}

export function stopAudio() {
  if (!isPlaying) return;
  if (isReleasing) return;

  if (envelope.r > 0) {
    isReleasing = true;
    applyRelease(() => {
      teardown();
      isReleasing = false;
    });
    return;
  }

  teardown();
}

function teardown() {
  if (oscL) { oscL.stop(); oscL.disconnect(); oscL = null; }
  if (oscR) { oscR.stop(); oscR.disconnect(); oscR = null; }
  for (const layer of layers) {
    if (layer.osc) { layer.osc.stop(); layer.osc.disconnect(); layer.osc = null; }
    if (layer.gain) { layer.gain.disconnect(); layer.gain = null; }
  }
  isPlaying = false;
}

export function setFrequency(f) {
  currentFreq = clampFreq(f);
  if (oscL) oscL.frequency.setTargetAtTime(currentFreq, audioCtx.currentTime, 0.01);
  if (oscR) oscR.frequency.setTargetAtTime(currentFreq + binauralOffset, audioCtx.currentTime, 0.01);
  updateLayerFrequencies();
}

export function setWaveform(type) {
  currentWave = type;
  if (oscL) oscL.type = type;
  if (oscR) oscR.type = type;
}

export function setVolume(v) {
  currentVolume = v;
  if (masterGain) masterGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.01);
}

export function setBinauralOffset(hz) {
  binauralOffset = hz;
  if (oscR) oscR.frequency.setTargetAtTime(currentFreq + hz, audioCtx.currentTime, 0.01);
}

export function setEnvelope(params) {
  Object.assign(envelope, params);
}

export function getEnvelope() {
  return { ...envelope };
}

const INTERVAL_RATIOS = {
  unison: 1,
  'octave-up': 2,
  'octave-down': 0.5,
  fifth: 1.5,
  'major-third': 1.25,
};

function updateLayerFrequencies() {
  for (const layer of layers) {
    if (!layer.osc) continue;
    if (layer.interval === 'custom') continue;
    const ratio = INTERVAL_RATIOS[layer.interval] || 1;
    const freq = clampFreq(currentFreq * ratio);
    layer.freq = freq;
    layer.osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.01);
  }
}

export function addLayer(config = {}) {
  if (layers.length >= 3) return null;
  const interval = config.interval || 'unison';
  const waveform = config.waveform || 'sine';
  const volume = config.volume ?? 50;
  const ratio = INTERVAL_RATIOS[interval] || 1;
  const freq = config.interval === 'custom' ? (config.freq || currentFreq) : currentFreq * ratio;

  const layer = { freq, waveform, volume, interval, osc: null, gain: null, enabled: true };

  if (isPlaying && audioCtx) {
    layer.osc = audioCtx.createOscillator();
    layer.gain = audioCtx.createGain();
    layer.osc.type = waveform;
    layer.osc.frequency.value = freq;
    layer.gain.gain.value = volume / 100;
    layer.osc.connect(layer.gain);
    layer.gain.connect(envelopeGain);
    layer.osc.start();
  }

  layers.push(layer);
  return layers.length - 1;
}

export function removeLayer(index) {
  if (index < 0 || index >= layers.length) return;
  const layer = layers[index];
  if (layer.osc) { layer.osc.stop(); layer.osc.disconnect(); }
  if (layer.gain) { layer.gain.disconnect(); }
  layers.splice(index, 1);
}

export function updateLayer(index, config) {
  const layer = layers[index];
  if (!layer) return;
  if (config.waveform !== undefined) {
    layer.waveform = config.waveform;
    if (layer.osc) layer.osc.type = config.waveform;
  }
  if (config.volume !== undefined) {
    layer.volume = config.volume;
    if (layer.gain) layer.gain.gain.setTargetAtTime(config.volume / 100, audioCtx.currentTime, 0.01);
  }
  if (config.interval !== undefined) {
    layer.interval = config.interval;
    if (config.interval !== 'custom') {
      const ratio = INTERVAL_RATIOS[config.interval] || 1;
      layer.freq = clampFreq(currentFreq * ratio);
      if (layer.osc) layer.osc.frequency.setTargetAtTime(layer.freq, audioCtx.currentTime, 0.01);
    }
  }
  if (config.freq !== undefined && layer.interval === 'custom') {
    layer.freq = clampFreq(config.freq);
    if (layer.osc) layer.osc.frequency.setTargetAtTime(layer.freq, audioCtx.currentTime, 0.01);
  }
  if (config.enabled !== undefined) {
    layer.enabled = config.enabled;
    if (layer.gain) layer.gain.gain.setTargetAtTime(config.enabled ? layer.volume / 100 : 0, audioCtx.currentTime, 0.01);
  }
}

export function getLayers() {
  return layers.map(l => ({ freq: l.freq, waveform: l.waveform, volume: l.volume, interval: l.interval, enabled: l.enabled }));
}

export function getAnalyser() { return analyser; }
export function getIsPlaying() { return isPlaying; }
export function getIsReleasing() { return isReleasing; }
export function getCurrentFreq() { return currentFreq; }
export function getCurrentWave() { return currentWave; }
export function getBinauralOffset() { return binauralOffset; }
export function getAudioContext() { return audioCtx; }
```

- [ ] **Step 2: Verify audio module compiles without errors**

Update `js/main.js` temporarily:

```js
import { startAudio, stopAudio, setFrequency } from './audio.js';
console.log('Audio module loaded', typeof startAudio, typeof stopAudio, typeof setFrequency);
```

Open in browser, verify console shows "Audio module loaded function function function".

- [ ] **Step 3: Commit**

```bash
git add js/audio.js js/main.js
git commit -m "feat: add audio graph module with dual-oscillator stereo routing"
```

---

### Task 3: Visualizer module

**Files:**
- Create: `js/visualizer.js`

- [ ] **Step 1: Create `js/visualizer.js`**

```js
let canvas, ctx, getAnalyser, getPlaying;
const dataArray = new Uint8Array(2048);

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}

function drawWave() {
  const analyser = getAnalyser();
  const playing = getPlaying();

  if (!playing || !analyser) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    return;
  }

  requestAnimationFrame(drawWave);
  analyser.getByteTimeDomainData(dataArray);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (canvas.height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const sliceWidth = canvas.width / dataArray.length;

  // Glow layer
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
  ctx.lineWidth = 8 * devicePixelRatio;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();

  // Main waveform
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.beginPath();
  x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();
}

export function initVisualizer(canvasEl, analyserGetter, playingGetter) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  getAnalyser = analyserGetter;
  getPlaying = playingGetter;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  drawWave();
}

export function startDrawing() {
  drawWave();
}
```

- [ ] **Step 2: Commit**

```bash
git add js/visualizer.js
git commit -m "feat: extract visualizer into module"
```

---

### Task 4: Main module — wire up core controls

**Files:**
- Create: `js/main.js` (full version)
- Modify: `index.html` (replace inline script with module import, keep HTML/CSS)

- [ ] **Step 1: Write `js/main.js`**

This wires the existing core controls (frequency, waveform, volume, play/stop, share) to the new audio module.

```js
import { freqToNote, sliderToFreq, freqToSlider, MIN_FREQ, MAX_FREQ } from './utils.js';
import { updateFreqUI } from './ui.js';
import * as audio from './audio.js';
import { initVisualizer, startDrawing } from './visualizer.js';

// DOM elements
const freqSlider = document.getElementById('freqSlider');
const freqNum = document.getElementById('freqNum');
const noteName = document.getElementById('noteName');
const playBtn = document.getElementById('playBtn');
const volumeSlider = document.getElementById('volume');
const volVal = document.getElementById('volVal');
const canvas = document.getElementById('viz');
const waveBtns = document.querySelectorAll('.wave-btn');
const shareBtn = document.getElementById('shareBtn');

// State for keyboard tab override
let keyboardTabActive = false;
let preKeyboardFreq = null;

export function setKeyboardActive(active) {
  if (active) {
    preKeyboardFreq = audio.getCurrentFreq();
    keyboardTabActive = true;
  } else {
    keyboardTabActive = false;
    if (preKeyboardFreq !== null) {
      updateFreqUI(preKeyboardFreq);
      audio.setFrequency(preKeyboardFreq);
      preKeyboardFreq = null;
    }
  }
}

function updatePlayButton() {
  if (audio.getIsReleasing()) {
    playBtn.textContent = 'Release...';
    playBtn.classList.add('playing');
  } else if (audio.getIsPlaying()) {
    playBtn.textContent = 'Stop';
    playBtn.classList.add('playing');
  } else {
    playBtn.textContent = 'Start';
    playBtn.classList.remove('playing');
  }
}

// Frequency controls
freqSlider.addEventListener('input', () => {
  const f = sliderToFreq(parseFloat(freqSlider.value));
  freqNum.value = f;
  noteName.textContent = freqToNote(f);
  audio.setFrequency(f);
});

freqNum.addEventListener('input', () => {
  let v = parseFloat(freqNum.value);
  if (!v || v < MIN_FREQ) v = MIN_FREQ;
  if (v > MAX_FREQ) v = MAX_FREQ;
  freqSlider.value = freqToSlider(v);
  noteName.textContent = freqToNote(v);
  audio.setFrequency(v);
});

// Volume
volumeSlider.addEventListener('input', () => {
  const v = volumeSlider.value / 100;
  volVal.textContent = `${volumeSlider.value}%`;
  audio.setVolume(v);
});

// Waveform
waveBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    waveBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audio.setWaveform(btn.dataset.wave);
  });
});

// Play/Stop
playBtn.addEventListener('click', () => {
  if (audio.getIsPlaying()) {
    audio.stopAudio();
  } else {
    audio.startAudio();
    startDrawing();
  }
  updatePlayButton();
});

// Poll play state for button updates (handles release completion)
setInterval(updatePlayButton, 100);

// Spacebar shortcut
document.addEventListener('keydown', (e) => {
  if (keyboardTabActive) return;
  if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    if (audio.getIsPlaying()) {
      audio.stopAudio();
    } else {
      audio.startAudio();
      startDrawing();
    }
    updatePlayButton();
  }
});

// Share button (will be replaced by params.js in Task 12)
shareBtn.addEventListener('click', () => {
  const params = new URLSearchParams();
  params.set('f', Math.round(audio.getCurrentFreq()));
  const wave = audio.getCurrentWave();
  if (wave !== 'sine') params.set('w', wave);
  if (volumeSlider.value !== '50') params.set('v', volumeSlider.value);
  const url = `${location.origin}${location.pathname}?${params}`;
  navigator.clipboard.writeText(url).then(() => {
    shareBtn.classList.add('copied');
    setTimeout(() => shareBtn.classList.remove('copied'), 1500);
  });
});

// Initialize visualizer
initVisualizer(canvas, () => audio.getAnalyser(), () => audio.getIsPlaying());

// Load URL params (basic — will be replaced by params.js in Task 12)
(function loadParams() {
  const p = new URLSearchParams(location.search);
  if (p.has('f')) {
    const f = Math.max(MIN_FREQ, Math.min(MAX_FREQ, parseInt(p.get('f'), 10) || 440));
    audio.setFrequency(f);
    updateFreqUI(f);
  }
  if (p.has('w')) {
    const w = p.get('w');
    const btn = document.querySelector(`.wave-btn[data-wave="${w}"]`);
    if (btn) {
      waveBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      audio.setWaveform(w);
    }
  }
  if (p.has('v')) {
    const v = Math.max(0, Math.min(100, parseInt(p.get('v'), 10) || 50));
    volumeSlider.value = v;
    volVal.textContent = `${v}%`;
    audio.setVolume(v / 100);
  }
})();

// Set initial note display
noteName.textContent = freqToNote(audio.getCurrentFreq());
```

- [ ] **Step 2: Update `index.html`**

Remove the entire `<script>...</script>` block (lines 458-696). Replace with:

```html
<script type="module" src="js/main.js"></script>
```

- [ ] **Step 3: Test in browser**

Run: `python3 -m http.server 8787`
Open `http://localhost:8787`. Verify:
- Frequency slider and number input work
- Waveform buttons switch
- Volume slider works
- Play/Stop toggles audio
- Waveform visualizer animates when playing
- Share button copies URL
- Spacebar shortcut works
- URL params load correctly (test with `?f=261&w=sawtooth&v=75`)

- [ ] **Step 4: Commit**

```bash
git add js/main.js index.html
git commit -m "feat: wire core controls through ES module system"
```

---

### Task 5: Tab bar UI

**Files:**
- Create: `js/tabs.js`
- Modify: `index.html` (add tab bar HTML + CSS)

- [ ] **Step 1: Add tab bar CSS to `index.html`**

Add before the `/* Footer */` comment in the `<style>` block:

```css
  /* Tab bar */
  .tab-bar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tab-btn {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 8px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.15s;
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  .tab-btn:hover {
    border-color: var(--amber-dim);
    color: var(--text);
  }

  .tab-btn.active {
    background: var(--amber-glow);
    border-color: var(--amber);
    color: var(--amber);
  }

  .tab-content {
    display: none;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
  }

  .tab-content.active {
    display: block;
  }

  .tab-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .tab-info {
    font-size: 0.65rem;
    color: var(--text-dim);
    line-height: 1.5;
  }

  .tab-grid {
    display: grid;
    gap: 6px;
  }

  .preset-btn {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    padding: 10px 8px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.15s;
    text-align: center;
  }

  .preset-btn:hover {
    border-color: var(--amber-dim);
    color: var(--text);
  }

  .preset-btn:active {
    background: var(--amber-glow);
    border-color: var(--amber);
    color: var(--amber);
  }

  .preset-btn .preset-label {
    display: block;
    font-size: 0.55rem;
    color: var(--text-dim);
    margin-top: 2px;
    opacity: 0.6;
  }
```

- [ ] **Step 2: Add tab bar HTML to `index.html`**

Inside the `.panel` div, after the `.btn-row` div, add:

```html
    <div class="tab-section">
      <div class="tab-bar">
        <button class="tab-btn" data-tab="presets">Presets</button>
        <button class="tab-btn" data-tab="layers">Layers</button>
        <button class="tab-btn" data-tab="binaural">Binaural</button>
        <button class="tab-btn" data-tab="sweep">Sweep</button>
        <button class="tab-btn" data-tab="envelope">Envelope</button>
        <button class="tab-btn" data-tab="keyboard">Keyboard</button>
      </div>
      <div class="tab-content" id="tab-presets"></div>
      <div class="tab-content" id="tab-layers"></div>
      <div class="tab-content" id="tab-binaural"></div>
      <div class="tab-content" id="tab-sweep"></div>
      <div class="tab-content" id="tab-envelope"></div>
      <div class="tab-content" id="tab-keyboard"></div>
    </div>
```

- [ ] **Step 3: Create `js/tabs.js`**

```js
let activeTab = null;
let onTabChange = null;

export function initTabs(changeCallback) {
  onTabChange = changeCallback;
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      const wasActive = btn.classList.contains('active');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      if (wasActive) {
        const prev = activeTab;
        activeTab = null;
        if (onTabChange) onTabChange(null, prev);
      } else {
        btn.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
        const prev = activeTab;
        activeTab = tabId;
        if (onTabChange) onTabChange(tabId, prev);
      }
    });
  });
}

export function getActiveTab() {
  return activeTab;
}
```

- [ ] **Step 4: Wire tabs into `js/main.js`**

Add to main.js. **IMPORTANT:** This is the final form of the initTabs callback — it covers all tab interactions (keyboard, sweep). Do NOT add separate initTabs calls in later tasks; this single call handles everything.

```js
import { initTabs } from './tabs.js';
import { initKeyboard, setKeyboardTabActive } from './keyboard.js';
import { initSweep, pauseSweep, resumeSweep, getIsSweeping } from './sweep.js';

// At the end (after all tab inits are called):
initTabs((newTab, oldTab) => {
  if (oldTab === 'keyboard') {
    setKeyboardActive(false);
    setKeyboardTabActive(false);
    if (getIsSweeping()) resumeSweep();
  }
  if (newTab === 'keyboard') {
    setKeyboardActive(true);
    setKeyboardTabActive(true);
    if (getIsSweeping()) pauseSweep();
  }
});
```

Note: `initKeyboard` and `initSweep` imports won't resolve until those modules exist (Tasks 9 and 11). During Tasks 5-8, either stub these imports or add them when their modules are created.

- [ ] **Step 5: Test in browser**

Verify: tab buttons appear below play/share row. Clicking a tab highlights it and shows its (empty) content area. Clicking again closes it. Only one tab active at a time.

- [ ] **Step 6: Commit**

```bash
git add js/tabs.js js/main.js index.html
git commit -m "feat: add tab bar UI with toggle logic"
```

---

### Task 6: Presets tab

**Files:**
- Create: `js/presets.js`
- Modify: `index.html` (presets tab content)

- [ ] **Step 1: Add presets HTML to `index.html`**

Replace the empty `#tab-presets` div with:

```html
      <div class="tab-content" id="tab-presets">
        <div class="tab-grid" style="grid-template-columns: repeat(3, 1fr);">
          <button class="preset-btn" data-freq="440">440 Hz<span class="preset-label">A4</span></button>
          <button class="preset-btn" data-freq="262">262 Hz<span class="preset-label">Middle C</span></button>
          <button class="preset-btn" data-freq="432">432 Hz<span class="preset-label">A432</span></button>
          <button class="preset-btn" data-freq="1000">1 kHz<span class="preset-label">Test tone</span></button>
          <button class="preset-btn" data-freq="100">100 Hz<span class="preset-label">Bass</span></button>
          <button class="preset-btn" data-freq="60">60 Hz<span class="preset-label">Mains hum</span></button>
          <button class="preset-btn" data-freq="20">20 Hz<span class="preset-label">Sub-bass</span></button>
          <button class="preset-btn" data-freq="10000">10 kHz<span class="preset-label">High</span></button>
          <button class="preset-btn" data-freq="15000">15 kHz<span class="preset-label">Hearing test</span></button>
        </div>
      </div>
```

- [ ] **Step 2: Create `js/presets.js`**

```js
import * as audio from './audio.js';
import { updateFreqUI } from './ui.js';

export function initPresets() {
  document.querySelectorAll('.preset-btn[data-freq]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = parseInt(btn.dataset.freq, 10);
      audio.setFrequency(f);
      updateFreqUI(f);
    });
  });
}
```

- [ ] **Step 3: Wire into `js/main.js`**

```js
import { initPresets } from './presets.js';
// After initTabs:
initPresets();
```

- [ ] **Step 4: Test** — Click Presets tab, click "Middle C", verify frequency changes to 262 Hz.

- [ ] **Step 5: Commit**

```bash
git add js/presets.js js/main.js index.html
git commit -m "feat: add presets tab with common frequencies"
```

---

### Task 7: Layers tab

**Files:**
- Create: `js/layers.js`
- Modify: `index.html` (layers tab content + CSS)

- [ ] **Step 1: Add layers CSS to `index.html`**

```css
  /* Layers */
  .layer-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .layer-toggle {
    width: 36px;
    height: 20px;
    background: var(--border);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .layer-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--text-dim);
    border-radius: 50%;
    transition: all 0.2s;
  }

  .layer-toggle.on { background: var(--amber-dim); }
  .layer-toggle.on::after { left: 18px; background: var(--amber); }

  .layer-interval {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }

  .layer-freq-input {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    width: 6ch;
    padding: 4px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--amber);
    -moz-appearance: textfield;
  }

  .layer-freq-input::-webkit-inner-spin-button { -webkit-appearance: none; }

  .layer-wave-btns { display: flex; gap: 4px; }

  .layer-wave-btn {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    text-transform: uppercase;
    padding: 4px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.15s;
  }

  .layer-wave-btn.active { border-color: var(--amber); color: var(--amber); }

  .layer-vol { flex: 1; min-width: 60px; }

  .layer-remove {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .layer-remove:hover { border-color: #ef4444; color: #ef4444; }

  .add-layer-btn {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 10px;
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
  }

  .add-layer-btn:hover { border-color: var(--amber-dim); color: var(--text); }

  .layers-disabled-note {
    font-size: 0.6rem;
    color: var(--amber-dim);
    text-align: center;
    padding: 12px;
  }
```

- [ ] **Step 2: Add layers HTML to `index.html`**

Replace the empty `#tab-layers` div with:

```html
      <div class="tab-content" id="tab-layers">
        <div id="layersList"></div>
        <button class="add-layer-btn" id="addLayerBtn">+ Add layer</button>
        <div class="layers-disabled-note" id="layersDisabledNote" style="display:none;">Layers are disabled while binaural mode is active.</div>
      </div>
```

- [ ] **Step 3: Create `js/layers.js`**

Uses DOM creation methods (no innerHTML) for layer rows. Each layer row contains: toggle, interval dropdown, frequency input (custom only), waveform buttons, volume slider, remove button.

```js
import * as audio from './audio.js';

const WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];
const WAVE_LABELS = ['Sin', 'Sqr', 'Saw', 'Tri'];

function createLayerRow(index) {
  const layers = audio.getLayers();
  const layer = layers[index];
  const row = document.createElement('div');
  row.className = 'layer-row';

  const toggle = document.createElement('button');
  toggle.className = 'layer-toggle on';
  toggle.addEventListener('click', () => {
    const enabled = !toggle.classList.contains('on');
    toggle.classList.toggle('on', enabled);
    audio.updateLayer(index, { enabled });
  });

  const interval = document.createElement('select');
  interval.className = 'layer-interval';
  ['unison', 'octave-up', 'octave-down', 'fifth', 'major-third', 'custom'].forEach(val => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val.replace(/-/g, ' ');
    if (val === layer.interval) opt.selected = true;
    interval.appendChild(opt);
  });

  const freqInput = document.createElement('input');
  freqInput.type = 'number';
  freqInput.className = 'layer-freq-input';
  freqInput.value = Math.round(layer.freq);
  freqInput.min = 20;
  freqInput.max = 20000;
  freqInput.style.display = layer.interval === 'custom' ? '' : 'none';

  interval.addEventListener('change', () => {
    freqInput.style.display = interval.value === 'custom' ? '' : 'none';
    audio.updateLayer(index, { interval: interval.value });
    if (interval.value !== 'custom') {
      const updated = audio.getLayers()[index];
      if (updated) freqInput.value = Math.round(updated.freq);
    }
  });

  freqInput.addEventListener('input', () => {
    const f = parseInt(freqInput.value, 10);
    if (f >= 20 && f <= 20000) audio.updateLayer(index, { freq: f });
  });

  const waveDiv = document.createElement('div');
  waveDiv.className = 'layer-wave-btns';
  WAVEFORMS.forEach((w, i) => {
    const btn = document.createElement('button');
    btn.className = 'layer-wave-btn' + (w === layer.waveform ? ' active' : '');
    btn.textContent = WAVE_LABELS[i];
    btn.addEventListener('click', () => {
      waveDiv.querySelectorAll('.layer-wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      audio.updateLayer(index, { waveform: w });
    });
    waveDiv.appendChild(btn);
  });

  const vol = document.createElement('input');
  vol.type = 'range';
  vol.className = 'layer-vol';
  vol.min = 0;
  vol.max = 100;
  vol.value = layer.volume;
  vol.addEventListener('input', () => {
    audio.updateLayer(index, { volume: parseInt(vol.value, 10) });
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'layer-remove';
  removeBtn.textContent = '\u00d7';
  removeBtn.addEventListener('click', () => {
    audio.removeLayer(index);
    renderLayers();
  });

  row.append(toggle, interval, freqInput, waveDiv, vol, removeBtn);
  return row;
}

export function renderLayers() {
  const list = document.getElementById('layersList');
  const addBtn = document.getElementById('addLayerBtn');
  while (list.firstChild) list.removeChild(list.firstChild);
  const layers = audio.getLayers();
  layers.forEach((_, i) => list.appendChild(createLayerRow(i)));
  addBtn.style.display = layers.length >= 3 ? 'none' : '';
}

// Track which layers were enabled before binaural disabled them
let layerEnabledStates = [];

export function setLayersDisabled(disabled) {
  const note = document.getElementById('layersDisabledNote');
  const list = document.getElementById('layersList');
  const addBtn = document.getElementById('addLayerBtn');
  const layers = audio.getLayers();

  if (disabled) {
    // Save enabled states and mute all layers
    layerEnabledStates = layers.map(l => l.enabled);
    layers.forEach((_, i) => audio.updateLayer(i, { enabled: false }));
    note.style.display = '';
    list.style.display = 'none';
    addBtn.style.display = 'none';
  } else {
    // Restore enabled states
    layerEnabledStates.forEach((enabled, i) => {
      if (i < layers.length) audio.updateLayer(i, { enabled });
    });
    layerEnabledStates = [];
    note.style.display = 'none';
    list.style.display = '';
    renderLayers();
  }
}

export function initLayers() {
  document.getElementById('addLayerBtn').addEventListener('click', () => {
    audio.addLayer();
    renderLayers();
  });
  renderLayers();
}
```

- [ ] **Step 4: Wire into `js/main.js`**

```js
import { initLayers } from './layers.js';
// After initPresets:
initLayers();
```

- [ ] **Step 5: Test** — Open Layers tab, add layers, change intervals, toggle, remove. Verify audio when playing.

- [ ] **Step 6: Commit**

```bash
git add js/layers.js js/main.js index.html
git commit -m "feat: add layers tab with up to 3 additional oscillators"
```

---

### Task 8: Binaural tab

**Files:**
- Create: `js/binaural.js`
- Modify: `index.html` (binaural tab content)

- [ ] **Step 1: Add binaural HTML to `index.html`**

Replace the empty `#tab-binaural` div with:

```html
      <div class="tab-content" id="tab-binaural">
        <p class="tab-info">Use headphones. The difference between L/R frequencies creates an audible beat.</p>
        <div class="control-group">
          <label>Offset</label>
          <div class="volume-row">
            <input type="range" id="binauralOffset" min="-30" max="30" value="0" step="0.5" style="flex:1;">
            <span class="volume-val" id="binauralVal">0 Hz</span>
          </div>
          <div class="range-labels"><span>-30 Hz</span><span>+30 Hz</span></div>
        </div>
        <div id="binauralBeatLabel" class="tab-info" style="text-align:center; color:var(--amber-dim);"></div>
      </div>
```

- [ ] **Step 2: Create `js/binaural.js`**

```js
import * as audio from './audio.js';
import { setLayersDisabled } from './layers.js';

let isBinauralActive = false;

export function initBinaural() {
  const slider = document.getElementById('binauralOffset');
  const valLabel = document.getElementById('binauralVal');
  const beatLabel = document.getElementById('binauralBeatLabel');

  function updateLabels() {
    const offset = parseFloat(slider.value);
    valLabel.textContent = `${offset >= 0 ? '+' : ''}${offset} Hz`;
    beatLabel.textContent = offset !== 0 ? `${Math.abs(offset)} Hz beat` : '';
  }

  slider.addEventListener('input', () => {
    const offset = parseFloat(slider.value);
    audio.setBinauralOffset(offset);
    const wasActive = isBinauralActive;
    isBinauralActive = offset !== 0;
    if (isBinauralActive !== wasActive) setLayersDisabled(isBinauralActive);
    updateLabels();
  });

  updateLabels();
}

export function getBinauralOffset() {
  return parseFloat(document.getElementById('binauralOffset').value);
}

export function setBinauralValue(offset) {
  const slider = document.getElementById('binauralOffset');
  slider.value = offset;
  slider.dispatchEvent(new Event('input'));
}
```

- [ ] **Step 3: Wire into `js/main.js`**

```js
import { initBinaural } from './binaural.js';
// After initLayers:
initBinaural();
```

- [ ] **Step 4: Test** — Move offset to +5, verify beat with headphones. Verify layers disabled note appears.

- [ ] **Step 5: Commit**

```bash
git add js/binaural.js js/main.js index.html
git commit -m "feat: add binaural beats tab with L/R offset control"
```

---

### Task 9: Sweep tab

**Files:**
- Create: `js/sweep.js`
- Modify: `index.html` (sweep tab content + CSS)

- [ ] **Step 1: Add sweep CSS to `index.html`**

```css
  /* Sweep */
  .sweep-freq-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .sweep-freq-row input[type="number"] {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    width: 7ch;
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--amber);
    -moz-appearance: textfield;
  }

  .sweep-freq-row input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }

  .sweep-freq-row span {
    font-size: 0.6rem;
    color: var(--text-dim);
  }

  .sweep-mode-btns { display: flex; gap: 6px; }

  .sweep-mode-btn {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 8px 14px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.15s;
    flex: 1;
    text-align: center;
  }

  .sweep-mode-btn.active {
    background: var(--amber-glow);
    border-color: var(--amber);
    color: var(--amber);
  }

  .sweep-play-btn {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    padding: 10px;
    background: transparent;
    border: 1px solid var(--amber-dim);
    border-radius: 8px;
    color: var(--amber);
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
  }

  .sweep-play-btn.sweeping {
    background: var(--amber);
    color: var(--bg);
  }
```

- [ ] **Step 2: Add sweep HTML to `index.html`**

Replace the empty `#tab-sweep` div with:

```html
      <div class="tab-content" id="tab-sweep">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="sweep-freq-row">
            <span>From</span>
            <input type="number" id="sweepStart" value="440" min="20" max="20000">
            <span>Hz &rarr;</span>
            <input type="number" id="sweepEnd" value="880" min="20" max="20000">
            <span>Hz</span>
          </div>
          <div class="control-group">
            <label>Duration</label>
            <div class="volume-row">
              <input type="range" id="sweepDuration" min="1" max="30" value="5" step="0.5" style="flex:1;">
              <span class="volume-val" id="sweepDurVal">5s</span>
            </div>
          </div>
          <div class="control-group">
            <label>Mode</label>
            <div class="sweep-mode-btns">
              <button class="sweep-mode-btn active" data-mode="oneshot">One-shot</button>
              <button class="sweep-mode-btn" data-mode="loop">Loop</button>
            </div>
          </div>
          <button class="sweep-play-btn" id="sweepPlayBtn">Start Sweep</button>
        </div>
      </div>
```

- [ ] **Step 3: Create `js/sweep.js`**

Uses `requestAnimationFrame` loop with logarithmic interpolation. Supports one-shot and ping-pong loop. Exposes pause/resume for keyboard tab interaction.

```js
import * as audio from './audio.js';
import { updateFreqUI } from './ui.js';
import { clampFreq } from './utils.js';

let isSweeping = false;
let isPaused = false;
let sweepRafId = null;
let sweepStartTime = 0;
let pausedElapsed = 0;
let sweepMode = 'oneshot';

// Cached at sweep start to avoid DOM reads per frame and mid-sweep stutter
let cachedStartFreq = 440;
let cachedEndFreq = 880;
let cachedDuration = 5000;

function sweepLoop(timestamp) {
  if (!isSweeping || isPaused) return;

  const startFreq = cachedStartFreq;
  const endFreq = cachedEndFreq;
  const duration = cachedDuration;

  const elapsed = pausedElapsed + (timestamp - sweepStartTime);
  let t = (elapsed % duration) / duration;

  if (sweepMode === 'loop') {
    const leg = Math.floor(elapsed / duration);
    if (leg % 2 === 1) t = 1 - t;
  } else {
    if (elapsed >= duration) {
      t = 1;
      isSweeping = false;
      document.getElementById('sweepPlayBtn').textContent = 'Start Sweep';
      document.getElementById('sweepPlayBtn').classList.remove('sweeping');
    }
  }

  const logStart = Math.log(startFreq);
  const logEnd = Math.log(endFreq);
  const freq = Math.round(Math.exp(logStart + t * (logEnd - logStart)));

  audio.setFrequency(freq);
  updateFreqUI(freq);

  if (isSweeping) sweepRafId = requestAnimationFrame(sweepLoop);
}

export function initSweep() {
  const durSlider = document.getElementById('sweepDuration');
  const durVal = document.getElementById('sweepDurVal');
  const playBtn = document.getElementById('sweepPlayBtn');
  const modeBtns = document.querySelectorAll('.sweep-mode-btn');

  durSlider.addEventListener('input', () => {
    durVal.textContent = `${durSlider.value}s`;
  });

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sweepMode = btn.dataset.mode;
    });
  });

  playBtn.addEventListener('click', () => {
    if (isSweeping) {
      stopSweep();
    } else {
      // Cache DOM values at sweep start to avoid per-frame DOM reads
      cachedStartFreq = clampFreq(parseInt(document.getElementById('sweepStart').value, 10) || 440);
      cachedEndFreq = clampFreq(parseInt(document.getElementById('sweepEnd').value, 10) || 880);
      cachedDuration = (parseFloat(document.getElementById('sweepDuration').value) || 5) * 1000;
      isSweeping = true;
      isPaused = false;
      pausedElapsed = 0;
      sweepStartTime = performance.now();
      playBtn.textContent = 'Stop Sweep';
      playBtn.classList.add('sweeping');
      sweepRafId = requestAnimationFrame(sweepLoop);
    }
  });
}

export function stopSweep() {
  isSweeping = false;
  isPaused = false;
  if (sweepRafId) cancelAnimationFrame(sweepRafId);
  document.getElementById('sweepPlayBtn').textContent = 'Start Sweep';
  document.getElementById('sweepPlayBtn').classList.remove('sweeping');
  if (sweepMode === 'loop') {
    const startFreq = parseInt(document.getElementById('sweepStart').value, 10) || 440;
    audio.setFrequency(startFreq);
    updateFreqUI(startFreq);
  }
}

export function pauseSweep() {
  if (!isSweeping || isPaused) return;
  isPaused = true;
  pausedElapsed += performance.now() - sweepStartTime;
  if (sweepRafId) cancelAnimationFrame(sweepRafId);
}

export function resumeSweep() {
  if (!isSweeping || !isPaused) return;
  isPaused = false;
  sweepStartTime = performance.now();
  sweepRafId = requestAnimationFrame(sweepLoop);
}

export function getIsSweeping() { return isSweeping; }

export function getSweepConfig() {
  return {
    start: parseInt(document.getElementById('sweepStart').value, 10) || 440,
    end: parseInt(document.getElementById('sweepEnd').value, 10) || 880,
    duration: parseFloat(document.getElementById('sweepDuration').value) || 5,
    mode: sweepMode,
  };
}

export function setSweepConfig(config) {
  if (config.start) document.getElementById('sweepStart').value = config.start;
  if (config.end) document.getElementById('sweepEnd').value = config.end;
  if (config.duration) {
    document.getElementById('sweepDuration').value = config.duration;
    document.getElementById('sweepDurVal').textContent = `${config.duration}s`;
  }
  if (config.mode) {
    sweepMode = config.mode;
    document.querySelectorAll('.sweep-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === config.mode);
    });
  }
}
```

- [ ] **Step 4: Wire into `js/main.js`**

```js
// After initBinaural:
initSweep();
// Note: initTabs callback already handles sweep pause/resume (configured in Task 5)
```

- [ ] **Step 5: Test** — Set start=100, end=2000, 5s one-shot. Start sweep. Verify frequency animates. Test loop ping-pong.

- [ ] **Step 6: Commit**

```bash
git add js/sweep.js js/main.js index.html
git commit -m "feat: add sweep tab with rAF-based frequency sweep"
```

---

### Task 10: Envelope tab

**Files:**
- Create: `js/envelope.js`
- Modify: `index.html` (envelope tab content + CSS)

- [ ] **Step 1: Add envelope CSS to `index.html`**

```css
  /* Envelope */
  .adsr-viz {
    width: 100%;
    height: 80px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .adsr-sliders {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .adsr-slider {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .adsr-slider input[type="range"] { width: 100%; }

  .adsr-slider .adsr-val {
    font-size: 0.65rem;
    color: var(--text-dim);
  }
```

- [ ] **Step 2: Add envelope HTML to `index.html`**

Replace the empty `#tab-envelope` div with:

```html
      <div class="tab-content" id="tab-envelope">
        <canvas class="adsr-viz" id="adsrViz"></canvas>
        <div class="adsr-sliders">
          <div class="adsr-slider">
            <label>Attack</label>
            <input type="range" id="envAttack" min="0" max="2000" value="0" step="10">
            <span class="adsr-val" id="envAttackVal">0 ms</span>
          </div>
          <div class="adsr-slider">
            <label>Decay</label>
            <input type="range" id="envDecay" min="0" max="2000" value="0" step="10">
            <span class="adsr-val" id="envDecayVal">0 ms</span>
          </div>
          <div class="adsr-slider">
            <label>Sustain</label>
            <input type="range" id="envSustain" min="0" max="100" value="100">
            <span class="adsr-val" id="envSustainVal">100%</span>
          </div>
          <div class="adsr-slider">
            <label>Release</label>
            <input type="range" id="envRelease" min="0" max="2000" value="0" step="10">
            <span class="adsr-val" id="envReleaseVal">0 ms</span>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Create `js/envelope.js`**

```js
import * as audio from './audio.js';

let adsrCanvas, adsrCtx;

function drawADSR() {
  const a = parseInt(document.getElementById('envAttack').value, 10);
  const d = parseInt(document.getElementById('envDecay').value, 10);
  const s = parseInt(document.getElementById('envSustain').value, 10) / 100;
  const r = parseInt(document.getElementById('envRelease').value, 10);

  const rect = adsrCanvas.getBoundingClientRect();
  adsrCanvas.width = rect.width * devicePixelRatio;
  adsrCanvas.height = rect.height * devicePixelRatio;
  const W = adsrCanvas.width;
  const H = adsrCanvas.height;
  const pad = 8 * devicePixelRatio;

  adsrCtx.clearRect(0, 0, W, H);

  const sustainDisplay = 500;
  const total = a + d + sustainDisplay + r || 1;

  const xA = pad;
  const xD = pad + (a / total) * (W - 2 * pad);
  const xS = xD + (d / total) * (W - 2 * pad);
  const xR = xS + (sustainDisplay / total) * (W - 2 * pad);
  const xEnd = W - pad;

  const yTop = pad;
  const yBot = H - pad;
  const ySustain = yTop + (1 - s) * (yBot - yTop);

  // Glow
  adsrCtx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
  adsrCtx.lineWidth = 6 * devicePixelRatio;
  adsrCtx.lineCap = 'round';
  adsrCtx.lineJoin = 'round';
  adsrCtx.beginPath();
  adsrCtx.moveTo(xA, yBot);
  adsrCtx.lineTo(xD, yTop);
  adsrCtx.lineTo(xS, ySustain);
  adsrCtx.lineTo(xR, ySustain);
  adsrCtx.lineTo(xEnd, yBot);
  adsrCtx.stroke();

  // Main line
  adsrCtx.strokeStyle = '#f59e0b';
  adsrCtx.lineWidth = 2 * devicePixelRatio;
  adsrCtx.beginPath();
  adsrCtx.moveTo(xA, yBot);
  adsrCtx.lineTo(xD, yTop);
  adsrCtx.lineTo(xS, ySustain);
  adsrCtx.lineTo(xR, ySustain);
  adsrCtx.lineTo(xEnd, yBot);
  adsrCtx.stroke();

  // Labels
  adsrCtx.fillStyle = 'rgba(138, 126, 114, 0.5)';
  adsrCtx.font = `${9 * devicePixelRatio}px monospace`;
  adsrCtx.textAlign = 'center';
  adsrCtx.fillText('A', (xA + xD) / 2, yBot - 4 * devicePixelRatio);
  adsrCtx.fillText('D', (xD + xS) / 2, yTop + 14 * devicePixelRatio);
  adsrCtx.fillText('S', (xS + xR) / 2, ySustain - 6 * devicePixelRatio);
  adsrCtx.fillText('R', (xR + xEnd) / 2, yBot - 4 * devicePixelRatio);
}

export function initEnvelope() {
  adsrCanvas = document.getElementById('adsrViz');
  adsrCtx = adsrCanvas.getContext('2d');

  const sliders = {
    a: document.getElementById('envAttack'),
    d: document.getElementById('envDecay'),
    s: document.getElementById('envSustain'),
    r: document.getElementById('envRelease'),
  };
  const vals = {
    a: document.getElementById('envAttackVal'),
    d: document.getElementById('envDecayVal'),
    s: document.getElementById('envSustainVal'),
    r: document.getElementById('envReleaseVal'),
  };

  function update() {
    vals.a.textContent = `${sliders.a.value} ms`;
    vals.d.textContent = `${sliders.d.value} ms`;
    vals.s.textContent = `${sliders.s.value}%`;
    vals.r.textContent = `${sliders.r.value} ms`;
    audio.setEnvelope({
      a: parseInt(sliders.a.value, 10),
      d: parseInt(sliders.d.value, 10),
      s: parseInt(sliders.s.value, 10),
      r: parseInt(sliders.r.value, 10),
    });
    drawADSR();
  }

  Object.values(sliders).forEach(sl => sl.addEventListener('input', update));
  window.addEventListener('resize', drawADSR);
  update();
}

export function getEnvelopeConfig() {
  return {
    a: parseInt(document.getElementById('envAttack').value, 10),
    d: parseInt(document.getElementById('envDecay').value, 10),
    s: parseInt(document.getElementById('envSustain').value, 10),
    r: parseInt(document.getElementById('envRelease').value, 10),
  };
}

export function setEnvelopeConfig(config) {
  if (config.a !== undefined) document.getElementById('envAttack').value = config.a;
  if (config.d !== undefined) document.getElementById('envDecay').value = config.d;
  if (config.s !== undefined) document.getElementById('envSustain').value = config.s;
  if (config.r !== undefined) document.getElementById('envRelease').value = config.r;
  document.getElementById('envAttack').dispatchEvent(new Event('input'));
}
```

- [ ] **Step 4: Wire into `js/main.js`**

```js
import { initEnvelope } from './envelope.js';
// After initSweep:
initEnvelope();
```

- [ ] **Step 5: Test** — Open envelope tab, verify ADSR curve. Set attack=200, release=500. Play — verify fade-in. Stop — verify fade-out.

- [ ] **Step 6: Commit**

```bash
git add js/envelope.js js/main.js index.html
git commit -m "feat: add envelope tab with ADSR controls and visualization"
```

---

### Task 11: Keyboard tab

**Files:**
- Create: `js/keyboard.js`
- Modify: `index.html` (keyboard tab content + CSS)

- [ ] **Step 1: Add keyboard CSS to `index.html`**

```css
  /* Keyboard */
  .keyboard-octave {
    font-size: 0.65rem;
    color: var(--text-dim);
    text-align: center;
    margin-bottom: 8px;
  }

  .keyboard-octave span { color: var(--amber-dim); font-weight: 600; }

  .piano {
    position: relative;
    height: 120px;
    display: flex;
    width: 100%;
  }

  .piano-white {
    flex: 1;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 0 0 6px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding-bottom: 8px;
    cursor: pointer;
    transition: all 0.1s;
    position: relative;
    z-index: 1;
  }

  .piano-white + .piano-white { margin-left: 2px; }

  .piano-white .key-label {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    color: var(--text-dim);
    text-transform: uppercase;
  }

  .piano-white .note-label {
    font-family: var(--font-mono);
    font-size: 0.45rem;
    color: var(--text-dim);
    opacity: 0.5;
    margin-top: 2px;
  }

  .piano-white.active {
    background: var(--amber-glow);
    border-color: var(--amber);
  }

  .piano-white.active .key-label { color: var(--amber); }

  .piano-black-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 65%;
    display: flex;
    pointer-events: none;
    z-index: 2;
  }

  .piano-black-spacer { flex: 1; }

  .piano-black {
    width: 10%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 0 0 4px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding-bottom: 6px;
    cursor: pointer;
    pointer-events: auto;
    transition: all 0.1s;
    margin: 0 -1%;
    position: relative;
  }

  .piano-black .key-label {
    font-family: var(--font-mono);
    font-size: 0.45rem;
    color: var(--text-dim);
    text-transform: uppercase;
  }

  .piano-black.active {
    background: var(--amber-dim);
    border-color: var(--amber);
  }

  .piano-black.active .key-label { color: var(--amber-bright); }

  .keyboard-hint {
    font-size: 0.55rem;
    color: var(--text-dim);
    text-align: center;
    margin-top: 8px;
    opacity: 0.6;
  }
```

- [ ] **Step 2: Add keyboard HTML to `index.html`**

Replace the empty `#tab-keyboard` div with:

```html
      <div class="tab-content" id="tab-keyboard">
        <div class="keyboard-octave">Octave: <span id="kbOctave">C4 – C5</span></div>
        <div class="piano" id="piano">
          <div class="piano-white" data-note="0"><span class="note-label">C</span><span class="key-label">A</span></div>
          <div class="piano-white" data-note="2"><span class="note-label">D</span><span class="key-label">S</span></div>
          <div class="piano-white" data-note="4"><span class="note-label">E</span><span class="key-label">D</span></div>
          <div class="piano-white" data-note="5"><span class="note-label">F</span><span class="key-label">F</span></div>
          <div class="piano-white" data-note="7"><span class="note-label">G</span><span class="key-label">G</span></div>
          <div class="piano-white" data-note="9"><span class="note-label">A</span><span class="key-label">H</span></div>
          <div class="piano-white" data-note="11"><span class="note-label">B</span><span class="key-label">J</span></div>
          <div class="piano-white" data-note="12"><span class="note-label">C</span><span class="key-label">K</span></div>
          <div class="piano-black-container">
            <div class="piano-black-spacer"></div>
            <div class="piano-black" data-note="1"><span class="key-label">W</span></div>
            <div class="piano-black-spacer"></div>
            <div class="piano-black" data-note="3"><span class="key-label">E</span></div>
            <div class="piano-black-spacer"></div>
            <div class="piano-black-spacer"></div>
            <div class="piano-black" data-note="6"><span class="key-label">T</span></div>
            <div class="piano-black-spacer"></div>
            <div class="piano-black" data-note="8"><span class="key-label">Y</span></div>
            <div class="piano-black-spacer"></div>
            <div class="piano-black" data-note="10"><span class="key-label">U</span></div>
            <div class="piano-black-spacer"></div>
            <div class="piano-black-spacer"></div>
          </div>
        </div>
        <div class="keyboard-hint">Z/X to shift octave</div>
      </div>
```

- [ ] **Step 3: Create `js/keyboard.js`**

```js
import * as audio from './audio.js';
import { noteToFreq } from './utils.js';
import { updateFreqUI } from './ui.js';
import { startDrawing } from './visualizer.js';

let octave = 4;
let activeKey = null;
let isActive = false;

const KEY_MAP = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4,
  KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12,
};

function updateOctaveDisplay() {
  const el = document.getElementById('kbOctave');
  if (el) el.textContent = `C${octave} \u2013 C${octave + 1}`;
}

function highlightKey(noteOffset, on) {
  document.querySelectorAll('#piano [data-note]').forEach(k => {
    if (parseInt(k.dataset.note, 10) === noteOffset) {
      k.classList.toggle('active', on);
    }
  });
}

function playNote(noteOffset) {
  if (activeKey === noteOffset) return;
  if (activeKey !== null) highlightKey(activeKey, false);
  activeKey = noteOffset;
  highlightKey(noteOffset, true);
  const noteInOctave = noteOffset % 12;
  const noteOctave = octave + Math.floor(noteOffset / 12);
  const freq = Math.round(noteToFreq(noteInOctave, noteOctave));
  audio.setFrequency(freq);
  updateFreqUI(freq);
  if (!audio.getIsPlaying()) {
    audio.startAudio();
    startDrawing();
  }
}

function releaseNote(noteOffset) {
  if (activeKey !== noteOffset) return;
  highlightKey(noteOffset, false);
  activeKey = null;
  audio.stopAudio();
}

function onKeyDown(e) {
  if (!isActive) return;
  if (e.repeat) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyZ') { e.preventDefault(); if (octave > 0) { octave--; updateOctaveDisplay(); } return; }
  if (e.code === 'KeyX') { e.preventDefault(); if (octave < 8) { octave++; updateOctaveDisplay(); } return; }
  const noteOffset = KEY_MAP[e.code];
  if (noteOffset !== undefined) { e.preventDefault(); playNote(noteOffset); }
}

function onKeyUp(e) {
  if (!isActive) return;
  const noteOffset = KEY_MAP[e.code];
  if (noteOffset !== undefined) { e.preventDefault(); releaseNote(noteOffset); }
}

export function initKeyboard() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.querySelectorAll('#piano [data-note]').forEach(key => {
    const note = parseInt(key.dataset.note, 10);
    key.addEventListener('mousedown', (e) => { e.preventDefault(); if (isActive) playNote(note); });
    key.addEventListener('mouseup', () => { if (isActive) releaseNote(note); });
    key.addEventListener('mouseleave', () => { if (isActive && activeKey === note) releaseNote(note); });
    key.addEventListener('touchstart', (e) => { e.preventDefault(); if (isActive) playNote(note); });
    key.addEventListener('touchend', () => { if (isActive) releaseNote(note); });
  });
  updateOctaveDisplay();
}

export function setKeyboardTabActive(active) {
  isActive = active;
  if (!active && activeKey !== null) {
    highlightKey(activeKey, false);
    activeKey = null;
  }
}

export function getOctave() { return octave; }

export function setOctave(o) {
  octave = Math.max(0, Math.min(8, o));
  updateOctaveDisplay();
}
```

- [ ] **Step 4: Wire into `js/main.js`**

```js
// After initEnvelope:
initKeyboard();
// Note: initTabs callback already handles keyboard activation (configured in Task 5)
```

- [ ] **Step 5: Test** — Open keyboard tab. Press A=C, S=D. Z/X for octave. Mouse click piano keys. Verify spacebar blocked.

- [ ] **Step 6: Commit**

```bash
git add js/keyboard.js js/main.js index.html
git commit -m "feat: add keyboard tab with computer key-to-note mapping"
```

---

### Task 12: Full URL params

**Files:**
- Create: `js/params.js`
- Modify: `js/main.js` (replace inline param code with params module)

- [ ] **Step 1: Create `js/params.js`**

```js
import * as audio from './audio.js';
import { updateFreqUI } from './ui.js';
import { MIN_FREQ, MAX_FREQ } from './utils.js';
import { getSweepConfig, setSweepConfig } from './sweep.js';
import { getEnvelopeConfig, setEnvelopeConfig } from './envelope.js';
import { setOctave, getOctave } from './keyboard.js';
import { setBinauralValue, getBinauralOffset } from './binaural.js';
import { renderLayers } from './layers.js';

export function serializeToURL() {
  const params = new URLSearchParams();
  params.set('f', Math.round(audio.getCurrentFreq()));
  const wave = audio.getCurrentWave();
  if (wave !== 'sine') params.set('w', wave);
  const vol = document.getElementById('volume').value;
  if (vol !== '50') params.set('v', vol);

  const layers = audio.getLayers();
  layers.forEach((l, i) => {
    params.set(`l${i + 1}`, `${Math.round(l.freq)},${l.waveform},${l.volume},${l.interval}`);
  });

  const bOffset = getBinauralOffset();
  if (bOffset !== 0) params.set('b', bOffset);

  const sweep = getSweepConfig();
  if (sweep.start !== 440) params.set('sf', sweep.start);
  if (sweep.end !== 880) params.set('se', sweep.end);
  if (sweep.duration !== 5) params.set('sd', sweep.duration);
  if (sweep.mode !== 'oneshot') params.set('sm', sweep.mode);

  const env = getEnvelopeConfig();
  if (env.a !== 0) params.set('ea', env.a);
  if (env.d !== 0) params.set('ed', env.d);
  if (env.s !== 100) params.set('es', env.s);
  if (env.r !== 0) params.set('er', env.r);

  const oct = getOctave();
  if (oct !== 4) params.set('ko', oct);

  return `${location.origin}${location.pathname}?${params}`;
}

export function loadFromURL() {
  const p = new URLSearchParams(location.search);

  if (p.has('f')) {
    const f = Math.max(MIN_FREQ, Math.min(MAX_FREQ, parseInt(p.get('f'), 10) || 440));
    audio.setFrequency(f);
    updateFreqUI(f);
  }
  if (p.has('w')) {
    const w = p.get('w');
    const btn = document.querySelector(`.wave-btn[data-wave="${w}"]`);
    if (btn) {
      document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      audio.setWaveform(w);
    }
  }
  if (p.has('v')) {
    const v = Math.max(0, Math.min(100, parseInt(p.get('v'), 10) || 50));
    document.getElementById('volume').value = v;
    document.getElementById('volVal').textContent = `${v}%`;
    audio.setVolume(v / 100);
  }

  for (let i = 1; i <= 3; i++) {
    if (p.has(`l${i}`)) {
      const parts = p.get(`l${i}`).split(',');
      audio.addLayer({
        freq: parseInt(parts[0], 10) || 440,
        waveform: parts[1] || 'sine',
        volume: parseInt(parts[2], 10) || 50,
        interval: parts[3] || 'custom',
      });
    }
  }
  renderLayers();

  if (p.has('b')) setBinauralValue(parseFloat(p.get('b')) || 0);

  const sweepConfig = {};
  if (p.has('sf')) sweepConfig.start = parseInt(p.get('sf'), 10);
  if (p.has('se')) sweepConfig.end = parseInt(p.get('se'), 10);
  if (p.has('sd')) sweepConfig.duration = parseFloat(p.get('sd'));
  if (p.has('sm')) sweepConfig.mode = p.get('sm');
  if (Object.keys(sweepConfig).length) setSweepConfig(sweepConfig);

  const envConfig = {};
  if (p.has('ea')) envConfig.a = parseInt(p.get('ea'), 10);
  if (p.has('ed')) envConfig.d = parseInt(p.get('ed'), 10);
  if (p.has('es')) envConfig.s = parseInt(p.get('es'), 10);
  if (p.has('er')) envConfig.r = parseInt(p.get('er'), 10);
  if (Object.keys(envConfig).length) setEnvelopeConfig(envConfig);

  if (p.has('ko')) setOctave(parseInt(p.get('ko'), 10) || 4);
}
```

- [ ] **Step 2: Update `js/main.js`**

Remove the inline `loadParams` IIFE and the inline share button handler. Replace with:

```js
import { serializeToURL, loadFromURL } from './params.js';

// Replace share button handler:
shareBtn.addEventListener('click', () => {
  const url = serializeToURL();
  navigator.clipboard.writeText(url).then(() => {
    shareBtn.classList.add('copied');
    setTimeout(() => shareBtn.classList.remove('copied'), 1500);
  });
});

// Replace loadParams call at end:
loadFromURL();
```

- [ ] **Step 3: Test** — Configure all settings, click share, paste URL in new tab, verify all settings restored.

- [ ] **Step 4: Commit**

```bash
git add js/params.js js/main.js
git commit -m "feat: full URL param serialization for all features"
```

---

### Task 13: Final integration test and cleanup

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Fix body overflow**

In `index.html` CSS, change `overflow: hidden` on `body` to `overflow-y: auto` so page scrolls when tabs expand.

- [ ] **Step 2: Full manual test**

Run through the spec's testing checklist:
- Each tab opens/closes correctly, only one at a time
- Presets update frequency immediately
- Layers produce audible stacked tones, intervals track main frequency
- Binaural creates audible beat with headphones, disables layers
- Sweep moves frequency smoothly, visualizer tracks, loop ping-pongs
- Envelope shapes attack/release audibly, ADSR visualization matches sliders
- Keyboard plays correct notes, octave shift works, lights up keys
- Share URL captures all active settings and restores them on load
- All features degrade gracefully (closing a tab reverts its effects)
- Mobile: tabs are scrollable/wrappable, touch-friendly

- [ ] **Step 3: Commit and push**

```bash
git add index.html
git commit -m "fix: allow vertical scroll for expanded tab content"
git push
```
