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
