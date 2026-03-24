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
  if (config.start !== undefined) document.getElementById('sweepStart').value = config.start;
  if (config.end !== undefined) document.getElementById('sweepEnd').value = config.end;
  if (config.duration !== undefined) {
    document.getElementById('sweepDuration').value = config.duration;
    document.getElementById('sweepDurVal').textContent = `${config.duration}s`;
  }
  if (config.mode !== undefined) {
    sweepMode = config.mode;
    document.querySelectorAll('.sweep-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === config.mode);
    });
  }
}
