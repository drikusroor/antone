import * as audio from './audio.js';

let adsrCanvas, adsrCtx;

// Log scale for A/D/R sliders: 0-1 normalized → 0-2000ms
// Gives much more control over the 0-200ms range
const MAX_MS = 2000;
const LOG_MAX_MS = Math.log(MAX_MS + 1); // +1 to handle 0

function sliderToMs(t) {
  return Math.round(Math.exp(t * LOG_MAX_MS) - 1);
}

function msToSlider(ms) {
  return Math.log(ms + 1) / LOG_MAX_MS;
}

function getMs(sliderId) {
  return sliderToMs(parseFloat(document.getElementById(sliderId).value));
}

function drawADSR() {
  const a = getMs('envAttack');
  const d = getMs('envDecay');
  const s = parseInt(document.getElementById('envSustain').value, 10) / 100;
  const r = getMs('envRelease');

  const rect = adsrCanvas.getBoundingClientRect();
  adsrCanvas.width = rect.width * devicePixelRatio;
  adsrCanvas.height = rect.height * devicePixelRatio;
  const W = adsrCanvas.width;
  const H = adsrCanvas.height;
  const pad = 8 * devicePixelRatio;

  adsrCtx.clearRect(0, 0, W, H);

  const sustainDisplay = 500;
  const total = a + d + sustainDisplay + r || 1;

  const xA = pad;
  const xD = pad + (a / total) * (W - 2 * pad);
  const xS = xD + (d / total) * (W - 2 * pad);
  const xR = xS + (sustainDisplay / total) * (W - 2 * pad);
  const xEnd = W - pad;

  const yTop = pad;
  const yBot = H - pad;
  const ySustain = yTop + (1 - s) * (yBot - yTop);

  // Glow
  adsrCtx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
  adsrCtx.lineWidth = 6 * devicePixelRatio;
  adsrCtx.lineCap = 'round';
  adsrCtx.lineJoin = 'round';
  adsrCtx.beginPath();
  adsrCtx.moveTo(xA, yBot);
  adsrCtx.lineTo(xD, yTop);
  adsrCtx.lineTo(xS, ySustain);
  adsrCtx.lineTo(xR, ySustain);
  adsrCtx.lineTo(xEnd, yBot);
  adsrCtx.stroke();

  // Main line
  adsrCtx.strokeStyle = '#f59e0b';
  adsrCtx.lineWidth = 2 * devicePixelRatio;
  adsrCtx.beginPath();
  adsrCtx.moveTo(xA, yBot);
  adsrCtx.lineTo(xD, yTop);
  adsrCtx.lineTo(xS, ySustain);
  adsrCtx.lineTo(xR, ySustain);
  adsrCtx.lineTo(xEnd, yBot);
  adsrCtx.stroke();

  // Labels
  adsrCtx.fillStyle = 'rgba(138, 126, 114, 0.5)';
  adsrCtx.font = `${9 * devicePixelRatio}px monospace`;
  adsrCtx.textAlign = 'center';
  adsrCtx.fillText('A', (xA + xD) / 2, yBot - 4 * devicePixelRatio);
  adsrCtx.fillText('D', (xD + xS) / 2, yTop + 14 * devicePixelRatio);
  adsrCtx.fillText('S', (xS + xR) / 2, ySustain - 6 * devicePixelRatio);
  adsrCtx.fillText('R', (xR + xEnd) / 2, yBot - 4 * devicePixelRatio);
}

export function initEnvelope() {
  adsrCanvas = document.getElementById('adsrViz');
  adsrCtx = adsrCanvas.getContext('2d');

  const sliders = {
    a: document.getElementById('envAttack'),
    d: document.getElementById('envDecay'),
    s: document.getElementById('envSustain'),
    r: document.getElementById('envRelease'),
  };
  const vals = {
    a: document.getElementById('envAttackVal'),
    d: document.getElementById('envDecayVal'),
    s: document.getElementById('envSustainVal'),
    r: document.getElementById('envReleaseVal'),
  };

  function update() {
    const a = getMs('envAttack');
    const d = getMs('envDecay');
    const r = getMs('envRelease');
    vals.a.textContent = `${a} ms`;
    vals.d.textContent = `${d} ms`;
    vals.s.textContent = `${sliders.s.value}%`;
    vals.r.textContent = `${r} ms`;
    audio.setEnvelope({
      a,
      d,
      s: parseInt(sliders.s.value, 10),
      r,
    });
    drawADSR();
  }

  Object.values(sliders).forEach(sl => sl.addEventListener('input', update));
  window.addEventListener('resize', drawADSR);
  update();
}

export function getEnvelopeConfig() {
  return {
    a: getMs('envAttack'),
    d: getMs('envDecay'),
    s: parseInt(document.getElementById('envSustain').value, 10),
    r: getMs('envRelease'),
  };
}

export function setEnvelopeConfig(config) {
  if (config.a !== undefined) document.getElementById('envAttack').value = msToSlider(config.a);
  if (config.d !== undefined) document.getElementById('envDecay').value = msToSlider(config.d);
  if (config.s !== undefined) document.getElementById('envSustain').value = config.s;
  if (config.r !== undefined) document.getElementById('envRelease').value = msToSlider(config.r);
  document.getElementById('envAttack').dispatchEvent(new Event('input'));
}
