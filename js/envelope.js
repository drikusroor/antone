import * as audio from './audio.js';

let adsrCanvas, adsrCtx;

function drawADSR() {
  const a = parseInt(document.getElementById('envAttack').value, 10);
  const d = parseInt(document.getElementById('envDecay').value, 10);
  const s = parseInt(document.getElementById('envSustain').value, 10) / 100;
  const r = parseInt(document.getElementById('envRelease').value, 10);

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
    vals.a.textContent = `${sliders.a.value} ms`;
    vals.d.textContent = `${sliders.d.value} ms`;
    vals.s.textContent = `${sliders.s.value}%`;
    vals.r.textContent = `${sliders.r.value} ms`;
    audio.setEnvelope({
      a: parseInt(sliders.a.value, 10),
      d: parseInt(sliders.d.value, 10),
      s: parseInt(sliders.s.value, 10),
      r: parseInt(sliders.r.value, 10),
    });
    drawADSR();
  }

  Object.values(sliders).forEach(sl => sl.addEventListener('input', update));
  window.addEventListener('resize', drawADSR);
  update();
}

export function getEnvelopeConfig() {
  return {
    a: parseInt(document.getElementById('envAttack').value, 10),
    d: parseInt(document.getElementById('envDecay').value, 10),
    s: parseInt(document.getElementById('envSustain').value, 10),
    r: parseInt(document.getElementById('envRelease').value, 10),
  };
}

export function setEnvelopeConfig(config) {
  if (config.a !== undefined) document.getElementById('envAttack').value = config.a;
  if (config.d !== undefined) document.getElementById('envDecay').value = config.d;
  if (config.s !== undefined) document.getElementById('envSustain').value = config.s;
  if (config.r !== undefined) document.getElementById('envRelease').value = config.r;
  document.getElementById('envAttack').dispatchEvent(new Event('input'));
}
