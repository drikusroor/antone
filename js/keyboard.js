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
