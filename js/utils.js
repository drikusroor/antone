export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const MIN_FREQ = 20;
export const MAX_FREQ = 20000;
export const LOG_MIN = Math.log(MIN_FREQ);
export const LOG_MAX = Math.log(MAX_FREQ);

export function freqToNote(freq) {
  const semitones = 12 * Math.log2(freq / 440);
  const midi = Math.round(69 + semitones);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  const cents = Math.round((69 + semitones - midi) * 100);
  const centsStr = cents === 0 ? '' : (cents > 0 ? `+${cents}` : `${cents}`);
  return `${name}${octave}${centsStr ? ' ' + centsStr + '¢' : ''}`;
}

export function sliderToFreq(t) {
  return Math.round(Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN)));
}

export function freqToSlider(f) {
  return (Math.log(f) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}

export function noteToFreq(note, octave) {
  const midi = (octave + 1) * 12 + note;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function clampFreq(f) {
  return Math.max(MIN_FREQ, Math.min(MAX_FREQ, f));
}
