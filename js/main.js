import { freqToNote, sliderToFreq, freqToSlider, MIN_FREQ, MAX_FREQ } from './utils.js';
import { updateFreqUI } from './ui.js';
import * as audio from './audio.js';
import { initVisualizer, startDrawing } from './visualizer.js';
import { initTabs } from './tabs.js';

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

// Initialize tabs
initTabs((newTab, oldTab) => {
  if (oldTab === 'keyboard') setKeyboardActive(false);
  if (newTab === 'keyboard') setKeyboardActive(true);
});
