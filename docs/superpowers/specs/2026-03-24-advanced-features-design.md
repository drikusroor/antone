# Antone — Advanced Features Design

## Overview

Extend the Antone tone generator with advanced features while keeping the core UI clean and simple. All new features live behind a tab bar with progressive disclosure — first-time visitors see only the basic tone generator.

Single-page app. Files may be split if needed. Client-side only (Web Audio API).

## Audio graph

The audio graph is restructured to support all features. The key change: **always create two oscillators** (L and R) and a **dedicated envelope gain node** separate from the master volume.

```
OscillatorL ──► StereoPannerL (-1) ──┐
                                     ├──► envelopeGain ──► masterGain ──► analyser ──► destination
OscillatorR ──► StereoPannerR (+1) ──┘

Layer1 Osc ──► layer1Gain ──► envelopeGain (same node)
Layer2 Osc ──► layer2Gain ──► envelopeGain
Layer3 Osc ──► layer3Gain ──► envelopeGain
```

**Normal mode (no binaural):** Both oscillators play the same frequency — effectively mono.
**Binaural mode:** OscillatorR frequency = OscillatorL frequency + offset.

This "always stereo" approach avoids graph teardown/rebuild when toggling binaural, preventing audible pops. The binaural offset slider simply adjusts OscillatorR's frequency in real-time.

**Gain node separation:**
- `envelopeGain` — controlled by ADSR automation (default gain: 1.0). Applies to all oscillators.
- `masterGain` — controlled by the volume slider. Independent of envelope.

This ensures sustain percentage is relative to full amplitude, and volume acts as a separate master control.

## Architecture

### Core panel (unchanged)

The existing controls remain exactly as-is:
- Frequency: log-scale slider + number input + note name display
- Waveform: sine, square, sawtooth, triangle buttons
- Volume: slider with percentage label
- Play/Stop button + Share button
- Real-time waveform visualizer (canvas)

### Tab bar

Positioned inside the panel card, below the play/share buttons. A row of small tab buttons using the existing `wave-btn` aesthetic. Six tabs:

1. Presets
2. Layers
3. Binaural
4. Sweep
5. Envelope
6. Keyboard

**Behavior:**
- All tabs closed by default
- Clicking a tab opens its content area below the tab bar
- Clicking the active tab closes it
- Only one tab open at a time
- Tab content areas have consistent padding and spacing

### URL params

All settings are shareable via URL params, extending the existing scheme. Short keys, default values omitted.

| Param | Description | Example |
|-------|------------|---------|
| `f` | Frequency (Hz) | `f=261` |
| `w` | Waveform | `w=sawtooth` |
| `v` | Volume (0-100) | `v=75` |
| `l1` | Layer 1: freq,waveform,volume | `l1=880,sine,50` |
| `l2` | Layer 2 | `l2=660,square,30` |
| `l3` | Layer 3 | `l3=1320,triangle,40` |
| `b` | Binaural offset (Hz) | `b=5` |
| `sf` | Sweep start freq | `sf=100` |
| `se` | Sweep end freq | `se=2000` |
| `sd` | Sweep duration (seconds) | `sd=5` |
| `sm` | Sweep mode | `sm=loop` |
| `ea` | Envelope attack (ms) | `ea=100` |
| `ed` | Envelope decay (ms) | `ed=200` |
| `es` | Envelope sustain (%) | `es=80` |
| `er` | Envelope release (ms) | `er=300` |
| `ko` | Keyboard octave | `ko=4` |

## Tab: Presets

A grid of small buttons for common frequencies. Clicking a preset updates the main frequency control immediately. No additional state.

**Musical:**
- A4 (440 Hz)
- Middle C (262 Hz)
- A432 (432 Hz)

**Test tones:**
- 1 kHz
- 100 Hz
- 60 Hz (mains hum)
- 20 Hz (sub-bass limit)
- 10 kHz
- 15 kHz (hearing test)

No dedicated URL param — the frequency is already captured by `f`.

## Tab: Layers

Up to 3 additional oscillators stacked on the main one. Each layer is a compact row:

- **On/off toggle** — small switch
- **Frequency** — number input + interval dropdown (unison, octave up, octave down, fifth, major third, custom). Interval-based values track the main frequency automatically. "Custom" unlocks manual input.
- **Waveform** — small 4-button selector (same icons, smaller size)
- **Volume** — inline slider (0-100%)

Starts empty. "+ Add layer" button adds a layer. Each row has an X to remove it. Removing a layer re-indexes the remaining layers (so if layer 2 is removed, layer 3 becomes layer 2).

**URL loading:** On page load, if `l1`/`l2`/`l3` params exist, the corresponding layers are automatically created and populated. Layers are always sequential — `l1` is always present before `l2`, etc.

**Audio routing:** Each layer creates its own OscillatorNode → GainNode, merged into the same analyser and destination as the main oscillator.

**Interaction with other features:**
- Layers are disabled when binaural mode is active (show a note explaining this)
- Sweep affects only the main oscillator; layers with interval mode track accordingly, custom-frequency layers stay fixed
- Envelope applies to all oscillators (main + layers)

## Tab: Binaural

Creates a binaural beat by splitting the main oscillator into left and right channels with a small frequency offset.

**Controls:**
- **Offset slider** — range: -30 Hz to +30 Hz, default 0, step 0.5
- **Beat frequency label** — displays absolute offset value (e.g. "5 Hz beat")
- **Info line** at top: "Use headphones. The difference between L/R frequencies creates an audible beat."

**Audio routing:** Uses the always-stereo graph (see Audio Graph section). Both oscillators always exist. Adjusting the offset simply sets OscillatorR's frequency to `base + offset` in real-time — no graph teardown needed. When offset is 0, both oscillators play the same frequency (effectively mono). No dead-zone or hysteresis needed since there is no routing change.

**Interaction with other features:**
- Disables layers while active (show note: "Binaural mode disables layers"). Layer oscillators are disconnected from the envelope gain node.
- Sweep modulates both L/R oscillators (maintaining the offset)
- Envelope applies to the binaural pair via the shared envelopeGain node

## Tab: Sweep

Auto-sweeps the main frequency between two bounds over time.

**Controls:**
- **Start frequency** — number input, defaults to current main frequency
- **End frequency** — number input, defaults to 2x start
- **Duration** — slider, 1s to 30s, default 5s
- **Mode** — two buttons: "One-shot" (sweep once) / "Loop" (ping-pong continuously)
- **Play sweep** — button to start/stop the sweep

**Behavior:**
- While sweeping, the main frequency display, slider, and visualizer update in real-time
- One-shot: sweeps start→end, then stops. Frequency stays at end value
- Loop: ping-pongs start→end→start→end... until stopped. On stop, frequency returns to start value

**Implementation:** Use `requestAnimationFrame` loop for sweep control instead of `linearRampToValueAtTime()`. Each frame: calculate elapsed time, compute current frequency from linear interpolation between start and end, set `oscillator.frequency.value` directly. This approach:
- Gives frame-by-frame control for ping-pong looping without needing ramp-completion callbacks
- Makes the current frequency trivially readable for UI updates (slider, display, note name)
- Produces smooth-enough transitions at 60fps for the frequency ranges involved
- Is easy to pause/resume for keyboard tab interaction

For ping-pong: track direction (+1/-1), flip when reaching start or end boundary.

**Interaction with other features:**
- Layers with interval-based frequencies track the sweep; custom-frequency layers stay fixed
- Binaural offset is maintained during sweep (both L/R channels sweep)
- Envelope applies normally

## Tab: Envelope

Shapes the amplitude over time using ADSR (Attack, Decay, Sustain, Release).

**Controls:**
- **ADSR curve visualization** — small SVG/canvas above the sliders, updates in real-time as sliders are dragged. Shows the classic ADSR trapezoid shape.
- **Attack** — slider, 0 ms to 2000 ms, default 0
- **Decay** — slider, 0 ms to 2000 ms, default 0
- **Sustain** — slider, 0% to 100%, default 100%
- **Release** — slider, 0 ms to 2000 ms, default 0

**Behavior:**
- Default (0/0/100%/0) equals current instant on/off — non-breaking
- Press Play: envelopeGain ramps 0 → 1 over attack time, then 1 → sustain level over decay time, holds at sustain
- Press Stop: envelopeGain ramps from current level → 0 over release time. Oscillators are stopped only after the release completes (via `setTimeout` matching release duration). During release, `isPlaying` remains true but a `isReleasing` flag is set.
- During release, play button shows "Release..." and is clickable to restart immediately: this calls `envelopeGain.gain.cancelScheduledValues()`, resets gain to 0, then triggers a fresh attack ramp. The old oscillators continue — no teardown needed since the "always stereo" graph persists.
- Envelope applies to all active oscillators via the shared envelopeGain node

**Implementation:** Uses `envelopeGain.gain.cancelScheduledValues()` + `linearRampToValueAtTime()` for attack/decay/release curves. The envelopeGain node is separate from masterGain (see Audio Graph section), so volume changes during envelope automation do not interfere.

## Tab: Keyboard

Maps the computer keyboard to musical notes for real-time playing.

**Key mapping (one octave):**
- Bottom row: A=C, S=D, D=E, F=F, G=G, H=A, J=B, K=C(+1)
- Top row: W=C#, E=D#, T=F#, Y=G#, U=A#
- Z = octave down, X = octave up

**Display:** A visual piano keyboard showing the key mapping. Keys light up amber when pressed. Octave indicator shows range (e.g. "C4 – C5").

**Behavior:**
- Monophonic: only the most recently pressed key sounds
- Key down: sets main frequency to that note, starts tone (or changes frequency if already playing)
- Key up: stops tone (respecting envelope release if configured)
- Base octave defaults to 4 (middle C area), adjustable via Z/X
- Temporarily overrides the main frequency control while the tab is active
- When tab is closed, frequency reverts to whatever it was before the tab was opened

**Interaction with other features:**
- Layers with interval mode track the keyboard-driven frequency
- Binaural offset is maintained
- Envelope shapes each key press/release
- Sweep is paused while keyboard tab is active (they conflict on frequency control). "Paused" means the sweep `requestAnimationFrame` loop stops and the elapsed time is frozen. On tab close, sweep resumes from where it left off if it was running. The frequency reverts to the pre-keyboard value (which is the sweep position at pause time).
- The existing spacebar play/stop shortcut is suppressed while the keyboard tab is open (guard condition on the keydown handler)

## Testing

Manual testing checklist:
- Each tab opens/closes correctly, only one at a time
- Presets update frequency immediately
- Layers produce audible stacked tones, intervals track main frequency
- Binaural creates audible beat with headphones, disables layers
- Sweep moves frequency smoothly, visualizer tracks, loop ping-pongs
- Envelope shapes attack/release audibly, ADSR visualization matches sliders
- Keyboard plays correct notes, octave shift works, lights up keys
- Share URL captures all active settings and restores them on load
- All features degrade gracefully (e.g. closing a tab reverts its effects)
- Mobile: tabs are scrollable/wrappable, touch-friendly
