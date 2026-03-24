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
