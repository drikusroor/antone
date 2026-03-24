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
  if (oscR) oscR.frequency.value = currentFreq + hz;
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

export function clearLayers() {
  while (layers.length > 0) removeLayer(layers.length - 1);
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

// --- Polyphonic voice management (for keyboard) ---
// Each voice is independent: own oscillator + gain, routed through masterGain.
const activeVoices = new Map(); // noteId -> { osc, gain, releaseTimeout }

function ensurePolyGraph() {
  // Ensure audioCtx, masterGain, analyser exist even if main oscillator isn't playing
  const ctx = ensureContext();
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = currentVolume;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  }
  return ctx;
}

export function startVoice(noteId, freq) {
  // If voice already active for this note, ignore
  if (activeVoices.has(noteId)) return;

  const ctx = ensurePolyGraph();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = currentWave;
  osc.frequency.value = freq;
  gain.gain.value = 0;

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();

  // Apply attack
  const now = ctx.currentTime;
  if (envelope.a > 0) {
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + envelope.a / 1000);
  } else {
    gain.gain.setValueAtTime(1, now);
  }
  // Apply decay to sustain
  if (envelope.d > 0) {
    const attackEnd = now + envelope.a / 1000;
    gain.gain.linearRampToValueAtTime(envelope.s / 100, attackEnd + envelope.d / 1000);
  }

  activeVoices.set(noteId, { osc, gain, releaseTimeout: null });
}

export function stopVoice(noteId) {
  const voice = activeVoices.get(noteId);
  if (!voice) return;

  const ctx = audioCtx;
  const now = ctx.currentTime;
  const currentGainVal = voice.gain.gain.value;

  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(currentGainVal, now);

  if (envelope.r > 0) {
    voice.gain.gain.linearRampToValueAtTime(0, now + envelope.r / 1000);
    voice.releaseTimeout = setTimeout(() => {
      voice.osc.stop();
      voice.osc.disconnect();
      voice.gain.disconnect();
      activeVoices.delete(noteId);
    }, envelope.r);
  } else {
    voice.osc.stop();
    voice.osc.disconnect();
    voice.gain.disconnect();
    activeVoices.delete(noteId);
  }
}

export function stopAllVoices() {
  for (const [noteId, voice] of activeVoices) {
    if (voice.releaseTimeout) clearTimeout(voice.releaseTimeout);
    voice.osc.stop();
    voice.osc.disconnect();
    voice.gain.disconnect();
  }
  activeVoices.clear();
}

export function hasActiveVoices() {
  return activeVoices.size > 0;
}

export function getAnalyser() { return analyser; }
export function getIsPlaying() { return isPlaying || activeVoices.size > 0; }
export function getIsReleasing() { return isReleasing; }
export function getCurrentFreq() { return currentFreq; }
export function getCurrentWave() { return currentWave; }
export function getBinauralOffset() { return binauralOffset; }
export function getAudioContext() { return audioCtx; }
