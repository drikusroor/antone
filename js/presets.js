import * as audio from './audio.js';
import { updateFreqUI } from './ui.js';
import { setEnvelopeConfig } from './envelope.js';
import { renderLayers } from './layers.js';

// Sound presets: each configures waveform, envelope, and layers
const SOUND_PRESETS = {
  organ: {
    waveform: 'sine',
    envelope: { a: 20, d: 0, s: 100, r: 30 },
    layers: [
      { interval: 'octave-up', waveform: 'sine', volume: 40 },
      { interval: 'fifth', waveform: 'sine', volume: 25 },
    ],
  },
  strings: {
    waveform: 'sawtooth',
    envelope: { a: 400, d: 200, s: 70, r: 500 },
    layers: [
      { interval: 'unison', waveform: 'sawtooth', volume: 35 },
    ],
  },
  'bass-synth': {
    waveform: 'sawtooth',
    envelope: { a: 10, d: 300, s: 40, r: 100 },
    layers: [
      { interval: 'octave-down', waveform: 'square', volume: 50 },
    ],
  },
  'warm-pad': {
    waveform: 'triangle',
    envelope: { a: 800, d: 400, s: 60, r: 1000 },
    layers: [
      { interval: 'unison', waveform: 'sine', volume: 40 },
      { interval: 'octave-up', waveform: 'triangle', volume: 20 },
    ],
  },
  brass: {
    waveform: 'sawtooth',
    envelope: { a: 80, d: 150, s: 80, r: 150 },
    layers: [
      { interval: 'unison', waveform: 'square', volume: 30 },
    ],
  },
  bell: {
    waveform: 'sine',
    envelope: { a: 0, d: 800, s: 0, r: 400 },
    layers: [
      { interval: 'major-third', waveform: 'sine', volume: 50 },
      { interval: 'fifth', waveform: 'sine', volume: 30 },
    ],
  },
  pluck: {
    waveform: 'triangle',
    envelope: { a: 0, d: 250, s: 0, r: 50 },
    layers: [
      { interval: 'octave-up', waveform: 'square', volume: 25 },
    ],
  },
  wobble: {
    waveform: 'sawtooth',
    envelope: { a: 50, d: 0, s: 100, r: 200 },
    layers: [
      { interval: 'unison', waveform: 'square', volume: 45 },
      { interval: 'octave-down', waveform: 'sawtooth', volume: 35 },
    ],
    // Note: for a real wobble you'd modulate filter cutoff, but this
    // layered detuned sound gets the character across
  },
  'sub-bass': {
    waveform: 'sine',
    envelope: { a: 30, d: 100, s: 90, r: 200 },
    layers: [
      { interval: 'octave-down', waveform: 'sine', volume: 60 },
    ],
  },
};

function applySound(name) {
  const preset = SOUND_PRESETS[name];
  if (!preset) return;

  // Set waveform
  audio.setWaveform(preset.waveform);
  document.querySelectorAll('.wave-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.wave === preset.waveform);
  });

  // Set envelope
  setEnvelopeConfig(preset.envelope);

  // Clear existing layers and add preset layers
  audio.clearLayers();
  for (const layer of preset.layers) {
    audio.addLayer(layer);
  }
  renderLayers();
}

export function initPresets() {
  // Frequency presets
  document.querySelectorAll('.preset-btn[data-freq]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = parseInt(btn.dataset.freq, 10);
      audio.setFrequency(f);
      updateFreqUI(f);
    });
  });

  // Sound presets
  document.querySelectorAll('.sound-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      applySound(btn.dataset.sound);
    });
  });
}
