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
