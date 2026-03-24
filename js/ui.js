import { freqToNote, freqToSlider } from './utils.js';

export function updateFreqUI(f) {
  document.getElementById('freqNum').value = Math.round(f);
  document.getElementById('freqSlider').value = freqToSlider(f);
  document.getElementById('noteName').textContent = freqToNote(f);
}
