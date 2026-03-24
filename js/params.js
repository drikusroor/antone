import * as audio from './audio.js';
import { updateFreqUI } from './ui.js';
import { MIN_FREQ, MAX_FREQ } from './utils.js';
import { getSweepConfig, setSweepConfig } from './sweep.js';
import { getEnvelopeConfig, setEnvelopeConfig } from './envelope.js';
import { setOctave, getOctave } from './keyboard.js';
import { setBinauralValue, getBinauralOffset } from './binaural.js';
import { renderLayers } from './layers.js';

export function serializeToURL() {
  const params = new URLSearchParams();
  params.set('f', Math.round(audio.getCurrentFreq()));
  const wave = audio.getCurrentWave();
  if (wave !== 'sine') params.set('w', wave);
  const vol = document.getElementById('volume').value;
  if (vol !== '50') params.set('v', vol);

  const layers = audio.getLayers();
  layers.forEach((l, i) => {
    params.set(`l${i + 1}`, `${Math.round(l.freq)},${l.waveform},${l.volume},${l.interval}`);
  });

  const bOffset = getBinauralOffset();
  if (bOffset !== 0) params.set('b', bOffset);

  const sweep = getSweepConfig();
  if (sweep.start !== 440) params.set('sf', sweep.start);
  if (sweep.end !== 880) params.set('se', sweep.end);
  if (sweep.duration !== 5) params.set('sd', sweep.duration);
  if (sweep.mode !== 'oneshot') params.set('sm', sweep.mode);

  const env = getEnvelopeConfig();
  if (env.a !== 0) params.set('ea', env.a);
  if (env.d !== 0) params.set('ed', env.d);
  if (env.s !== 100) params.set('es', env.s);
  if (env.r !== 0) params.set('er', env.r);

  const oct = getOctave();
  if (oct !== 4) params.set('ko', oct);

  return `${location.origin}${location.pathname}?${params}`;
}

export function loadFromURL() {
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
      document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      audio.setWaveform(w);
    }
  }
  if (p.has('v')) {
    const v = Math.max(0, Math.min(100, parseInt(p.get('v'), 10) || 50));
    document.getElementById('volume').value = v;
    document.getElementById('volVal').textContent = `${v}%`;
    audio.setVolume(v / 100);
  }

  for (let i = 1; i <= 3; i++) {
    if (p.has(`l${i}`)) {
      const parts = p.get(`l${i}`).split(',');
      audio.addLayer({
        freq: parseInt(parts[0], 10) || 440,
        waveform: parts[1] || 'sine',
        volume: parseInt(parts[2], 10) || 50,
        interval: parts[3] || 'custom',
      });
    }
  }
  renderLayers();

  if (p.has('b')) setBinauralValue(parseFloat(p.get('b')) || 0);

  const sweepConfig = {};
  if (p.has('sf')) sweepConfig.start = parseInt(p.get('sf'), 10);
  if (p.has('se')) sweepConfig.end = parseInt(p.get('se'), 10);
  if (p.has('sd')) sweepConfig.duration = parseFloat(p.get('sd'));
  if (p.has('sm')) sweepConfig.mode = p.get('sm');
  if (Object.keys(sweepConfig).length) setSweepConfig(sweepConfig);

  const envConfig = {};
  if (p.has('ea')) envConfig.a = parseInt(p.get('ea'), 10);
  if (p.has('ed')) envConfig.d = parseInt(p.get('ed'), 10);
  if (p.has('es')) envConfig.s = parseInt(p.get('es'), 10);
  if (p.has('er')) envConfig.r = parseInt(p.get('er'), 10);
  if (Object.keys(envConfig).length) setEnvelopeConfig(envConfig);

  if (p.has('ko')) setOctave(parseInt(p.get('ko'), 10) || 4);
}
