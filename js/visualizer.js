let canvas, ctx, getAnalyser, getPlaying;
const dataArray = new Uint8Array(2048);

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}

function drawWave() {
  const analyser = getAnalyser();
  const playing = getPlaying();

  if (!playing || !analyser) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    return;
  }

  requestAnimationFrame(drawWave);
  analyser.getByteTimeDomainData(dataArray);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (canvas.height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const sliceWidth = canvas.width / dataArray.length;

  // Glow layer
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
  ctx.lineWidth = 8 * devicePixelRatio;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();

  // Main waveform
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.beginPath();
  x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();
}

export function initVisualizer(canvasEl, analyserGetter, playingGetter) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  getAnalyser = analyserGetter;
  getPlaying = playingGetter;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  drawWave();
}

export function startDrawing() {
  drawWave();
}
