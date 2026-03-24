import { freqToNote, sliderToFreq, freqToSlider, MIN_FREQ, MAX_FREQ } from './utils.js';
import { updateFreqUI } from './ui.js';
import * as audio from './audio.js';
import { initVisualizer, startDrawing } from './visualizer.js';
import { initTabs } from './tabs.js';
import { initPresets } from './presets.js';
import { initLayers } from './layers.js';
import { initBinaural } from './binaural.js';
import { initSweep, pauseSweep, resumeSweep, getIsSweeping } from './sweep.js';
import { initEnvelope } from './envelope.js';
import { initKeyboard, setKeyboardTabActive } from './keyboard.js';
import { serializeToURL, loadFromURL } from './params.js';

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

// Share button
shareBtn.addEventListener('click', () => {
  const url = serializeToURL();
  navigator.clipboard.writeText(url).then(() => {
    shareBtn.classList.add('copied');
    setTimeout(() => shareBtn.classList.remove('copied'), 1500);
  });
});

// Initialize visualizer
initVisualizer(canvas, () => audio.getAnalyser(), () => audio.getIsPlaying());

// Load URL params
loadFromURL();

// Set initial note display
noteName.textContent = freqToNote(audio.getCurrentFreq());

// Initialize tabs
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

// Initialize tab modules
initPresets();
initLayers();
initBinaural();
initSweep();
initEnvelope();
initKeyboard();
