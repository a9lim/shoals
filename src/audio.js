/* ===================================================
   audio.js — Melancholic lounge jazz for Shoals.
   Rhodes piano, upright bass, brush drums, and sparse
   muted trumpet over a slow Am progression with
   intimate room reverb.

   Act III (the machine register): one continuous
   parameter `setMachineIntensity(x)` re-renders the SAME
   16-bar form with progressively less humanity — the
   swing straightens, the trumpet goes first, velocities
   compress, the Rhodes' warmth detune tunes out, the
   room reverb dries to an anechoic void, and the brushes
   yield to a tick grid that keeps its own time. The
   harmony never changes; the band does. Underneath, a
   Shepard riser climbs forever without arriving, and the
   tick grid subdivides (quarters → 8ths → 16ths) at
   constant BPM — the day is still a day, it just
   contains more. `glitchAudio(severity)` is the failing
   terminal made audible; `silenceDesk()` is the terminal
   latch — the jazz cuts mid-note, the hum and the ticks
   persist. Valence unsigned by design (03): the melt-up
   and the unraveling sound the same.

   All Web Audio API — no external audio files.
   Leaf module. No DOM access.
   =================================================== */

/* ---- State ---- */
let _ctx, _master, _jazzGain, _droneGain, _stingerGain, _musicGain;
let _reverbSend = null;
let _volume = 0.3;
let _noiseBuffer = null;
let _jazzPlaying = false;
let _jazzTimer = null;
let _jazzNext = 0;
let _currentMood = null;
let _droneNodes = [];
let _musicNodes = [];
let _musicFadeTimer = null;

/* Act III machine register */
let _machine = 0;               // 0 = the band, 1 = the machine
let _machineGain = null;        // machine layer bus (ticks + Shepard) — survives silenceDesk
let _machineTimer = null;
let _machineNext = 0;           // tick-grid look-ahead cursor (its own time, not the band's)
let _shepardGain = null;
let _shepardVoices = [];        // { osc, gain, nextCycle, offset }
let _glitchDelay = null;        // normally-silent feedback delay: the stutter chain
let _glitchFb = null;
let _glitchWet = null;
let _deskSilenced = false;

/* ---- Constants ---- */

const BPM = 72;
const BEAT = 60 / BPM;          // ~0.833 s
const LOOP_DUR = 64 * BEAT;     // ~53.3 s (16 bars of 4)
const SW = 0.62;                // swing: upbeats at 62% of beat (the human baseline)

/** Live swing ratio: the groove dies by geometry as the machine takes over. */
function _swing() { return SW - 0.12 * _machine; }

/** Human timing breath: ±6 ms at machine 0, quantized to nothing at machine 1. */
function _jit() { return (1 - _machine) * (Math.random() * 2 - 1) * 0.006; }

/** Linear blend helper for the machine transformation. */
function _lerp(a, b, t) { return a + (b - a) * t; }

/* Note frequency table (octaves 2–5, all chromatic) */
const N = (() => {
    const t = {};
    const S = { C:0,Db:1,D:2,Eb:3,E:4,F:5,Gb:6,G:7,Ab:8,A:9,Bb:10,B:11 };
    for (let o = 2; o <= 5; o++)
        for (const [n, s] of Object.entries(S))
            t[n + o] = +(440 * 2 ** ((s - 9) / 12 + (o - 4))).toFixed(2);
    return t;
})();

/* =============== COMPOSITION =============== */

/* 16-bar form in Am — melancholic with bittersweet lift.

   A:  Am9  → Dm9  → Bm7b5 → E7b9    (home → yearning → tension → peak)
   A': Am9  → Fmaj7→ Bm7b5 → E7b9    (home → lift → tension → held)
   B:  Fmaj7→ Em7  → Dm9   → Cmaj7   (descending arc — momentary hope)
   C:  Bm7b5→ E7b9 → E7b9  → Am9     (extended dominant → resolution)

   The harmonic rhythm breathes: sections A/A' move chord-per-bar,
   section B descends stepwise through the relative major,
   and section C stretches E7b9 across two bars for maximum
   tension before the final Am9 release and loop. */

const CHORDS = [
    'Am9','Dm9','Hd','E7',          // A  — classic minor cadence
    'Am9','FM7','Hd','E7',          // A' — bittersweet variant
    'FM7','Em7','Dm9','CM7',        // B  — descending, bright
    'Hd','E7','E7','Am9',           // C  — long tension, resolve
];

/* Rhodes piano voicings: 3–4 note rootless voicings, spread
   across C3–B4. Wide intervals create the dark, open quality
   of Bill Evans or early Herbie Hancock ballads.

   Voice leading between adjacent chords:
     Am9→Dm9:  E→F, G→A, C→C, B→E  (steps + hold)
     Dm9→Hd:   F→F, A→A, C→B, E→D  (holds + steps)
     Hd→E7:    F→F, A→Ab, B→B, D→D (chromatic + holds)
     E7→Am9:   Ab→G(?), B→C(?), D→E(?), F→B(?)  — big resolution
     Am9→FM7:  E→A(?), G→C(?), C→E(?) — open shift
     FM7→Em7:  A→G, C→B, E→D+E — step descent
     Em7→Dm9:  G→F, B→A, D→C, E→E — smooth descent
     Dm9→CM7:  F→E, A→G, C→B, E→D — parallel descent
     CM7→Hd:   E→F, G→A, B→B, D→D — steps + holds */

const VOICING = {
    Am9: [N.E3, N.G3, N.C4, N.B4],  // 5 b7 b3 9   — open, lonely
    Dm9: [N.F3, N.A3, N.C4, N.E4],  // b3 5 b7 9   — warm, centered
    Hd:  [N.F3, N.A3, N.B3, N.D4],  // b5 b7 R b3  — half-dim cluster
    E7:  [N.Ab3, N.B3, N.D4, N.F4], // 3 5 b7 b9   — crunchy dominant
    FM7: [N.A3, N.C4, N.E4],        // 3 5 7        — clear, simple
    Em7: [N.G3, N.B3, N.D4, N.E4],  // b3 5 b7 R   — subdued
    CM7: [N.E3, N.G3, N.B3, N.D4],  // 3 5 7 9     — spacious, hopeful
};

/* Walking bass: spacious and melodic rather than constant
   quarter-note walking. Half notes let the room breathe;
   chromatic approaches (Ab→A, Db→D, Eb→E) connect phrases.
   The line traces the harmonic roots while singing its own
   counter-melody underneath the piano. */
const BASS_LINE = [
    // ---- A (bars 0–3): Am9 → Dm9 → Bm7b5 → E7b9 ----
    { beat: 0,  note: N.A2,  dur: 1.8 },   // root, let it ring
    { beat: 2,  note: N.C3,  dur: 0.9 },   // up to b3
    { beat: 3,  note: N.Db3, dur: 0.8 },   // chromatic approach → D
    { beat: 4,  note: N.D3,  dur: 1.8 },   // Dm root, sustained
    { beat: 6,  note: N.A2,  dur: 0.9 },   // drop to 5th
    { beat: 7,  note: N.Ab2, dur: 0.8 },   // chromatic down → B
    { beat: 8,  note: N.B2,  dur: 1.5 },   // half-dim root
    { beat: 10, note: N.D3,  dur: 0.9 },   // b3
    { beat: 11, note: N.Eb3, dur: 0.8 },   // chromatic approach → E
    { beat: 12, note: N.E2,  dur: 2.5 },   // dominant root, dramatic hold
    { beat: 15, note: N.Ab2, dur: 0.8 },   // chromatic lead-in → A

    // ---- A' (bars 4–7): Am9 → Fmaj7 → Bm7b5 → E7b9 ----
    { beat: 16, note: N.A2,  dur: 2.0 },   // resolution, relief
    { beat: 18, note: N.E2,  dur: 1.5 },   // open 5th, breathing room
    { beat: 20, note: N.F2,  dur: 1.5 },   // Fmaj root, warm
    { beat: 22, note: N.A2,  dur: 0.9 },   // walk up
    { beat: 23, note: N.Ab2, dur: 0.8 },   // chromatic approach → B
    { beat: 24, note: N.B2,  dur: 1.0 },   // half-dim root
    { beat: 25, note: N.A2,  dur: 1.0 },   // step down
    { beat: 26, note: N.F2,  dur: 1.0 },   // b5 — dark
    { beat: 27, note: N.E2,  dur: 0.8 },   // leading to dominant
    { beat: 28, note: N.E2,  dur: 2.5 },   // sustained dominant root
    { beat: 31, note: N.Ab2, dur: 0.8 },   // chromatic → F

    // ---- B (bars 8–11): Fmaj7 → Em7 → Dm9 → Cmaj7 ----
    { beat: 32, note: N.F2,  dur: 1.8 },   // bridge opens
    { beat: 34, note: N.E2,  dur: 0.9 },   // step down
    { beat: 35, note: N.D3,  dur: 0.8 },   // leap up — energy
    { beat: 36, note: N.E2,  dur: 2.0 },   // Em root, sustained
    { beat: 38, note: N.D3,  dur: 1.5 },   // walk across bar line
    { beat: 40, note: N.D3,  dur: 1.5 },   // Dm root
    { beat: 42, note: N.C3,  dur: 0.9 },   // descending walk
    { beat: 43, note: N.B2,  dur: 0.8 },   // approach → C
    { beat: 44, note: N.C3,  dur: 2.0 },   // Cmaj root, let ring
    { beat: 46, note: N.B2,  dur: 1.5 },   // gentle step down

    // ---- C (bars 12–15): Bm7b5 → E7b9 → E7b9 → Am9 ----
    { beat: 48, note: N.B2,  dur: 1.0 },   // tension returns
    { beat: 49, note: N.D3,  dur: 1.0 },   // ascending walk
    { beat: 50, note: N.F3,  dur: 0.9 },   // b5, peak of line
    { beat: 51, note: N.E3,  dur: 0.8 },   // approaching E
    { beat: 52, note: N.E2,  dur: 2.8 },   // long dominant — dramatic
    { beat: 55, note: N.Gb2, dur: 0.8 },   // chromatic color
    { beat: 56, note: N.Ab2, dur: 1.5 },   // 3rd of E7 — unusual, tense
    { beat: 58, note: N.E2,  dur: 1.5 },   // back to root
    { beat: 60, note: N.A2,  dur: 2.0 },   // home — resolution
    { beat: 62, note: N.E2,  dur: 1.0 },   // open 5th
    { beat: 63, note: N.Ab2, dur: 0.8 },   // chromatic approach → A (loop)
];

/* Rhodes comp: hand-placed for musical phrasing. Strong downbeats
   on phrase entries, ghostly fills between, bars of deliberate
   silence for breathing room. ghost=true → muted percussive touch
   (darker filter, lower volume, no bell partial emphasis).
   sw=true → the hit sits on the swung upbeat; the offset is
   resolved at schedule time via _swing() so the syncopation
   straightens with the machine. */
const COMP = [
    // ---- A (bars 0–3) ----
    { beat: 0,  ch: 'Am9', dur: 1.2, vol: 0.9 },                    // opening chord
    { beat: 2,  ch: 'Am9', dur: 0.4, vol: 0.4, ghost: true, sw: true },  // ghost fill
    { beat: 5,  ch: 'Dm9', dur: 0.8, vol: 0.65 },                   // answer on beat 2
    { beat: 7,  ch: 'Dm9', dur: 0.6, vol: 0.5 },                    // beat 4, leading
    { beat: 8,  ch: 'Hd',  dur: 0.7, vol: 0.55, sw: true },         // syncopated tension
    { beat: 13, ch: 'E7',  dur: 1.0, vol: 0.7 },                    // dominant on 2
    { beat: 15, ch: 'E7',  dur: 0.3, vol: 0.35, ghost: true, sw: true }, // ghost upbeat

    // ---- A' (bars 4–7) ----
    { beat: 16, ch: 'Am9', dur: 1.5, vol: 0.85 },                   // long release
    { beat: 21, ch: 'FM7', dur: 0.8, vol: 0.6 },                    // bittersweet lift
    { beat: 22, ch: 'FM7', dur: 0.4, vol: 0.4, ghost: true, sw: true },
    { beat: 24, ch: 'Hd',  dur: 0.7, vol: 0.6 },                    // darkening
    { beat: 26, ch: 'Hd',  dur: 0.5, vol: 0.45 },
    { beat: 29, ch: 'E7',  dur: 1.2, vol: 0.65 },                   // sustained tension

    // ---- B (bars 8–11): bridge — sparser, lighter touch ----
    { beat: 32, ch: 'FM7', dur: 1.0, vol: 0.7 },                    // new section start
    { beat: 34, ch: 'FM7', dur: 0.3, vol: 0.3, ghost: true, sw: true },
    { beat: 38, ch: 'Em7', dur: 0.7, vol: 0.5 },                    // just one hit — space
    { beat: 40, ch: 'Dm9', dur: 0.8, vol: 0.55, sw: true },         // syncopated descent
    { beat: 42, ch: 'Dm9', dur: 0.4, vol: 0.35, ghost: true, sw: true },
    { beat: 44, ch: 'CM7', dur: 0.9, vol: 0.7 },                    // brightness
    { beat: 46, ch: 'CM7', dur: 0.7, vol: 0.55 },                   // two clear statements

    // ---- C (bars 12–15): tension → resolution ----
    { beat: 49, ch: 'Hd',  dur: 0.7, vol: 0.6 },
    { beat: 51, ch: 'Hd',  dur: 0.3, vol: 0.3, ghost: true, sw: true },
    { beat: 52, ch: 'E7',  dur: 0.8, vol: 0.7 },                    // dominant pedal begins
    { beat: 54, ch: 'E7',  dur: 0.4, vol: 0.4, ghost: true, sw: true },
    { beat: 55, ch: 'E7',  dur: 0.6, vol: 0.6 },
    { beat: 56, ch: 'E7',  dur: 0.5, vol: 0.45, sw: true },         // sparse held tension
    { beat: 60, ch: 'Am9', dur: 1.8, vol: 0.9 },                    // resolution
];

/* Melody fragments: muted trumpet, Am pentatonic (A C D E G).
   Two alternate phrases — randomly chosen per loop iteration.
   Each is ~5 notes, very sparse — a melodic suggestion, not a solo.
   60% chance of melody per loop for natural variation. */

const MELODY_A = [
    // Bars 1–4: descending sigh (A → G → E ... E → D)
    { beat: 6,  note: N.A4, dur: 2.0 },   // over Dm9 — 5th, open
    { beat: 9,  note: N.G4, dur: 1.5 },   // stepping down over Hd
    { beat: 11, note: N.E4, dur: 2.5 },   // settling into E7
    { beat: 16, note: N.E4, dur: 2.0 },   // echo on Am resolution
    { beat: 19, note: N.D4, dur: 1.5 },   // tail off
];

const MELODY_B = [
    // Bars 8–11: arching figure (C → A → D ... E → G)
    { beat: 33, note: N.C5, dur: 1.5 },   // high point over Fmaj7
    { beat: 36, note: N.A4, dur: 2.0 },   // drop to Em7
    { beat: 40, note: N.D4, dur: 2.5 },   // nadir on Dm9
    { beat: 44, note: N.E4, dur: 1.5 },   // rising on Cmaj7
    { beat: 46, note: N.G4, dur: 1.5 },   // open 5th, fading out
];

/* ---- Stingers, music, mood, drone (unchanged) ---- */

const STINGER_DEFS = {
    positive:   { freqStart: 440, freqEnd: 880,  duration: 0.4, type: 'sine',     gain: 0.15 },
    negative:   { freqStart: 440, freqEnd: 220,  duration: 0.5, type: 'triangle', gain: 0.15 },
    alert:      { freqStart: 660, freqEnd: 660,  duration: 0.3, type: 'square',   gain: 0.10, pulses: 2 },
    superevent: { freqStart: 220, freqEnd: 55,   duration: 1.5, type: 'sawtooth', gain: 0.12 },
};

const MUSIC_CHORDS = {
    tension:    [{ notes: [110, 130.8, 164.8], type: 'sawtooth', dur: 6 }],
    triumph:    [{ notes: [130.8, 164.8, 196],  type: 'sine',     dur: 5 }],
    collapse:   [{ notes: [98, 116.5, 138.6],   type: 'triangle', dur: 7 }],
    revelation: [{ notes: [146.8, 185, 220],    type: 'sine',     dur: 5 }],
};

const MOOD_MIX = {
    calm:   [1.0, 0.0],
    tense:  [0.55, 0.45],
    crisis: [0.15, 0.85],
};

const DRONE_VOICES = [
    { type: 'sine',     freq: 55,    gain: 0.12, filter: 200  },
    { type: 'sine',     freq: 110,   gain: 0.09, filter: 300  },
    { type: 'triangle', freq: 164.8, gain: 0.05, filter: 400  },
    { type: 'sawtooth', freq: 82.4,  gain: 0.04, filter: 120  },
];

/* =============== AUDIO CONTEXT =============== */

function _createCtx() {
    if (_ctx) return;
    try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
        _master = _ctx.createGain();
        _master.gain.value = _volume;
        _master.connect(_ctx.destination);

        _jazzGain = _ctx.createGain();
        _jazzGain.gain.value = 0;
        _jazzGain.connect(_master);

        _droneGain = _ctx.createGain();
        _droneGain.gain.value = 0;
        _droneGain.connect(_master);

        _stingerGain = _ctx.createGain();
        _stingerGain.gain.value = 1;
        _stingerGain.connect(_master);

        _musicGain = _ctx.createGain();
        _musicGain.gain.value = 1;
        _musicGain.connect(_master);

        /* Machine layer bus (Act III): ticks + Shepard riser. Deliberately
           NOT a child of _jazzGain — it neither ducks with the mood mix nor
           dies with silenceDesk. The machines keep their own time. */
        _machineGain = _ctx.createGain();
        _machineGain.gain.value = 1;
        _machineGain.connect(_master);

        /* Glitch chain: a parallel feedback delay off the jazz bus, wet gain
           held at zero — silent and free until glitchAudio opens it. The dry
           path is untouched, so there is no latency cost in normal play. */
        _glitchDelay = _ctx.createDelay(0.5);
        _glitchDelay.delayTime.value = 0.09;
        _glitchFb = _ctx.createGain();
        _glitchFb.gain.value = 0;
        _glitchWet = _ctx.createGain();
        _glitchWet.gain.value = 0;
        _jazzGain.connect(_glitchDelay);
        _glitchDelay.connect(_glitchFb);
        _glitchFb.connect(_glitchDelay);
        _glitchDelay.connect(_glitchWet);
        _glitchWet.connect(_master);

        _setupReverb();
    } catch { /* AudioContext unavailable */ }
}

function _isReady() {
    return _ctx && _ctx.state === 'running';
}

/* ---- Reverb: convolver with synthetic impulse response ----
   Small intimate room — 1.8 s tail with 12 ms predelay,
   darkened via lowpass on the return to simulate air absorption.
   Sounds like a late-night jazz club. */

function _setupReverb() {
    if (_reverbSend) return;

    const dur = 1.8;
    const rate = _ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = _ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.012);

    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = pre; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * Math.exp(-3.5 * (i - pre) / rate);
    }

    const conv = _ctx.createConvolver();
    conv.buffer = buf;

    _reverbSend = _ctx.createGain();
    _reverbSend.gain.value = 0.3;

    const lp = _ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.Q.value = 0.5;

    const ret = _ctx.createGain();
    ret.gain.value = 0.5;

    _reverbSend.connect(conv);
    conv.connect(lp);
    lp.connect(ret);
    ret.connect(_jazzGain);
}

/* =============== INSTRUMENT HELPERS =============== */

/** Ensure noise buffer exists for percussion instruments. */
function _ensureNoise() {
    if (_noiseBuffer) return;
    const len = _ctx.sampleRate * 2;
    _noiseBuffer = _ctx.createBuffer(1, len, _ctx.sampleRate);
    const d = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

/** Rhodes piano note: sine fundamental + detuned bell partial (2×).
    Ghost voicings use darker filter and suppress the bell.
    Machine transformation: the ~2.6-cent bell detune (the warmth —
    a slow beat against the fundamental) tunes to exactly 2.000×,
    the filter opens hard and bright, ghosts lose their ghostliness
    (a precise quiet note is not a ghost), and the attack sharpens
    from a touch to a trigger. */
function _rhodesNote(freq, time, durBeats, vol, isGhost) {
    const dur = durBeats * BEAT;
    const dest = _jazzGain;

    const osc1 = _ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;

    const osc2 = _ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * _lerp(2.003, 2.0, _machine);

    const bellG = _ctx.createGain();
    bellG.gain.value = isGhost ? 0.15 : 0.3;

    const openF = _lerp(2200, 3800, _machine);
    const flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = isGhost ? _lerp(1200, openF, _machine) : openF;
    flt.Q.value = 0.7;

    const atk = _lerp(0.012, 0.003, _machine);
    const rel = Math.min(0.25, dur * 0.3);
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + atk);
    g.gain.linearRampToValueAtTime(vol * 0.85, time + 0.062);
    g.gain.linearRampToValueAtTime(vol * 0.7, time + dur - rel);
    g.gain.linearRampToValueAtTime(0, time + dur);

    osc1.connect(flt);
    osc2.connect(bellG);
    bellG.connect(flt);
    flt.connect(g);
    g.connect(dest);
    if (_reverbSend) g.connect(_reverbSend);

    osc1.start(time);  osc1.stop(time + dur + 0.02);
    osc2.start(time);  osc2.stop(time + dur + 0.02);
}

/** Upright bass: triangle body + sub-octave sine warmth.
    Pluck envelope — fast attack, natural decay into sustain.
    Machine transformation: the ring shortens toward sequenced
    staccato and the body brightens toward a synth voice — the
    same line, walked by something that never had hands. */
function _bassNote(freq, time, durBeats, vol) {
    const dur = durBeats * BEAT * _lerp(1, 0.65, _machine);
    const dest = _jazzGain;
    const decay = Math.max(dur * 0.3, 0.1);

    const osc1 = _ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    const flt1 = _ctx.createBiquadFilter();
    flt1.type = 'lowpass';
    flt1.frequency.value = _lerp(350, 560, _machine);
    flt1.Q.value = 1;

    const g1 = _ctx.createGain();
    g1.gain.setValueAtTime(0, time);
    g1.gain.linearRampToValueAtTime(vol * 0.5, time + 0.008);
    g1.gain.linearRampToValueAtTime(vol * 0.2, time + decay);
    g1.gain.linearRampToValueAtTime(0, time + dur);

    const osc2 = _ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 0.5;

    const flt2 = _ctx.createBiquadFilter();
    flt2.type = 'lowpass';
    flt2.frequency.value = 200;
    flt2.Q.value = 1;

    const g2 = _ctx.createGain();
    g2.gain.setValueAtTime(0, time);
    g2.gain.linearRampToValueAtTime(vol, time + 0.005);
    g2.gain.linearRampToValueAtTime(vol * 0.5, time + decay);
    g2.gain.linearRampToValueAtTime(0, time + dur);

    osc1.connect(flt1); flt1.connect(g1); g1.connect(dest);
    osc2.connect(flt2); flt2.connect(g2); g2.connect(dest);

    osc1.start(time); osc1.stop(time + dur + 0.02);
    osc2.start(time); osc2.stop(time + dur + 0.02);
}

/** Brush circle swish: wideband noise, gentle decay. */
function _brushSwish(time, dur, vol, dest) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3500;
    bp.Q.value = 0.5;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);

    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + dur + 0.01);
}

/** Brush dab: focused noise burst, short accent on backbeats. */
function _brushDab(time, vol, dest) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4500;
    bp.Q.value = 1.5;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.003);
    g.gain.linearRampToValueAtTime(vol * 0.15, time + 0.015);
    g.gain.linearRampToValueAtTime(0, time + 0.045);

    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + 0.06);
}

/** Kick: sine with pitch drop. Very sparse in this arrangement. */
function _kick(time, vol, dest) {
    const osc = _ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.linearRampToValueAtTime(0, time + 0.15);

    osc.connect(g); g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.2);
}

/** Cross-stick: tight bandpass noise for woody turnaround accent. */
function _crossStick(time, vol, dest) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 4;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.linearRampToValueAtTime(vol * 0.25, time + 0.012);
    g.gain.linearRampToValueAtTime(0, time + 0.04);

    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + 0.05);
}

/** Ride cymbal shimmer: high-passed noise, short natural decay. */
function _rideTing(time, vol, dest) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const hp = _ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    src.connect(hp); hp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + 0.25);
}

/** Machine tick: a 6 ms filtered click — not a drum, a clock.
    Lives on the machine bus; the grid it marks is its own. */
function _clickTick(time, vol) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 9;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.linearRampToValueAtTime(0, time + 0.006);

    src.connect(bp); bp.connect(g); g.connect(_machineGain);
    src.start(time);
    src.stop(time + 0.02);
}

/** Muted trumpet: heavily filtered sawtooth with vibrato.
    Slow attack, nasal quality from LP resonance. */
function _trumpetNote(freq, time, durBeats, vol) {
    const dur = durBeats * BEAT;
    const dest = _jazzGain;

    const osc = _ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const vib = _ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibAmt = _ctx.createGain();
    vibAmt.gain.value = freq * 0.006;   // ~10 cents depth
    vib.connect(vibAmt);
    vibAmt.connect(osc.frequency);

    const flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 900;
    flt.Q.value = 2;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.06);
    g.gain.linearRampToValueAtTime(vol * 0.85, time + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, time + dur);

    osc.connect(flt); flt.connect(g);
    g.connect(dest);
    if (_reverbSend) g.connect(_reverbSend);

    osc.start(time);  osc.stop(time + dur + 0.05);
    vib.start(time);  vib.stop(time + dur + 0.05);
}

/* =============== JAZZ LOOP =============== */

/** Schedule one full 16-bar loop starting at t0.
    The machine parameter is read at schedule time, so the same
    composition re-renders each pass with whatever humanity is
    left: swing via _swing(), timing breath via _jit(), velocity
    compression toward the mean, the trumpet gone early, the
    brushes fading under the tick grid's rise. */
function _scheduleLoop(t0) {
    const dest = _jazzGain;
    const sw = _swing();
    const m = _machine;

    /* Walking bass */
    for (const b of BASS_LINE)
        _bassNote(b.note, t0 + b.beat * BEAT + _jit(), b.dur, 0.20);

    /* Rhodes comping — dynamics flatten as the machine rises: every
       hit compresses toward the same mezzo velocity, which is what
       "expressive" sounds like after quantization. */
    for (const c of COMP) {
        const v = VOICING[c.ch];
        const baseVol = c.ghost ? 0.015 : 0.035;
        const vol = _lerp(c.vol, 0.62, m * 0.8);
        const at = t0 + (c.beat + (c.sw ? sw : 0)) * BEAT + _jit();
        for (const freq of v)
            _rhodesNote(freq, at, c.dur, baseVol * vol, !!c.ghost);
    }

    /* Drums: continuous brush circles with dab backbeats,
       sparse kick on structural downbeats, cross-stick on
       turnaround bars, ride shimmer on swung upbeats.
       The kit is the machine's first conquest — the circles thin
       to nothing and the swung shimmer dies with the swing itself;
       what replaces them ticks on the machine bus, in its own time. */
    const brush = 1 - m * 0.85;
    for (let bar = 0; bar < 16; bar++) {
        const b = bar * 4;

        // Brush circles: forward stroke on beats, back stroke on upbeats
        for (let i = 0; i < 4; i++) {
            _brushSwish(t0 + (b + i) * BEAT, 0.30, 0.018 * brush, dest);
            _brushSwish(t0 + (b + i + sw) * BEAT, 0.22, 0.010 * brush, dest);
        }

        // Dab accents on 2 and 4
        _brushDab(t0 + (b + 1) * BEAT, 0.030 * brush, dest);
        _brushDab(t0 + (b + 3) * BEAT, 0.030 * brush, dest);

        // Kick: only at section starts (every 4 bars)
        if (bar % 4 === 0)
            _kick(t0 + b * BEAT, 0.035, dest);

        // Cross-stick on beat 4 of turnaround bars
        if (bar === 3 || bar === 7 || bar === 15)
            _crossStick(t0 + (b + 3) * BEAT, 0.025 * brush, dest);
    }

    // Ride shimmer: swung upbeats, every other bar
    for (let bar = 0; bar < 16; bar += 2) {
        const b = bar * 4;
        _rideTing(t0 + (b + sw) * BEAT, 0.012 * (1 - m), dest);
        _rideTing(t0 + (b + 2 + sw) * BEAT, 0.010 * (1 - m), dest);
    }

    /* Melody: 60% chance per loop, alternate phrases for variety.
       The breath instrument goes first — you can't fake breath.
       Gone entirely past machine 0.4, and it does not come back. */
    const pMelody = 0.6 * Math.max(0, 1 - m / 0.4);
    if (Math.random() < pMelody) {
        const phrase = Math.random() < 0.5 ? MELODY_A : MELODY_B;
        for (const mel of phrase)
            _trumpetNote(mel.note, t0 + mel.beat * BEAT + _jit(), mel.dur, 0.018);
    }
}

/** Look-ahead scheduler: keeps 4 s of audio queued at all times. */
function _jazzSchedule() {
    if (!_jazzPlaying || !_ctx) return;
    while (_jazzNext < _ctx.currentTime + 4) {
        _scheduleLoop(_jazzNext);
        _jazzNext += LOOP_DUR;
    }
    clearTimeout(_jazzTimer);
    _jazzTimer = setTimeout(_jazzSchedule, 2000);
}

/* =============== DRONE =============== */

function _startDrone() {
    if (_droneNodes.length > 0) return;
    for (const v of DRONE_VOICES) {
        const osc = _ctx.createOscillator();
        osc.type = v.type;
        osc.frequency.value = v.freq;

        const flt = _ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = v.filter;
        flt.Q.value = 2;

        const g = _ctx.createGain();
        g.gain.value = v.gain;

        osc.connect(flt);
        flt.connect(g);
        g.connect(_droneGain);
        osc.start();

        _droneNodes.push({ osc, flt, gain: g });
    }
}

function _stopDrone() {
    for (const n of _droneNodes) {
        try { n.osc.stop(); } catch {}
        try { n.osc.disconnect(); } catch {}
        try { n.gain.disconnect(); } catch {}
        try { n.flt.disconnect(); } catch {}
    }
    _droneNodes = [];
}

/* =============== MACHINE LAYER (Act III) ===============

   Two voices, one bus, its own scheduler — deliberately not
   phase-locked to the band. The Shepard riser climbs an octave
   forever without arriving: recursion as an auditory illusion.
   The tick grid marks time at constant BPM but finer and finer
   subdivision — the day is still a day, it just contains more.
   Both are inaudible until machine intensity crosses ~0.5. */

const SHEP_PERIOD = 40;         // seconds per octave climb
const SHEP_BASES = [55, 110, 220, 440];   // A's, under the drone's A

/* Raised-cosine gain window (sin²) — hides each voice's wrap. */
const SHEP_WIN = (() => {
    const w = new Float32Array(65);
    for (let i = 0; i <= 64; i++) w[i] = Math.sin(Math.PI * i / 64) ** 2;
    return w;
})();

function _startMachine() {
    if (_machineTimer || !_ctx) return;

    if (_shepardVoices.length === 0) {
        _shepardGain = _ctx.createGain();
        _shepardGain.gain.value = 0;

        const lp = _ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        lp.Q.value = 0.5;

        _shepardGain.connect(lp);
        lp.connect(_machineGain);

        const now = _ctx.currentTime;
        for (let k = 0; k < SHEP_BASES.length; k++) {
            const osc = _ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = SHEP_BASES[k];

            const win = _ctx.createGain();
            win.gain.value = 0;

            osc.connect(win);
            win.connect(_shepardGain);
            osc.start();

            // Stagger the voices a quarter-period apart so the ensemble
            // always has a voice mid-climb — the rise never pauses.
            _shepardVoices.push({ osc, win, lpNode: lp, nextCycle: now + k * (SHEP_PERIOD / 4) });
        }
    }

    _machineNext = _ctx.currentTime + 0.1;
    _machineSchedule();
}

function _machineSchedule() {
    if (!_ctx) return;
    const now = _ctx.currentTime;

    /* Shepard cycles: per voice, one octave of detune per period under
       the sin² window, cycles abutting exactly. */
    for (const v of _shepardVoices) {
        while (v.nextCycle < now + 6) {
            const tc = v.nextCycle;
            v.osc.detune.setValueAtTime(0, tc);
            v.osc.detune.linearRampToValueAtTime(1200, tc + SHEP_PERIOD);
            v.win.gain.setValueCurveAtTime(SHEP_WIN, tc, SHEP_PERIOD);
            v.nextCycle = tc + SHEP_PERIOD;
        }
    }

    /* Tick grid: subdivision sharpens with the machine — quarters past
       0.5, 8ths past 0.75, 16ths past 0.9 — with a soft accent every
       4th beat: the machine has a meter too, just not the band's. */
    const x = _machine;
    const sub = x >= 0.9 ? 0.25 : x >= 0.75 ? 0.5 : 1;
    const on = Math.min(1, Math.max(0, (x - 0.5) / 0.1));
    while (_machineNext < now + 4) {
        if (on > 0) {
            const beatPos = Math.round(_machineNext / BEAT);
            for (let s = 0; s < 1; s += sub) {
                const accent = (s === 0 && beatPos % 4 === 0) ? 1.5 : 1;
                _clickTick(_machineNext + s * BEAT, 0.007 * on * accent);
            }
        }
        _machineNext += BEAT;
    }

    clearTimeout(_machineTimer);
    _machineTimer = setTimeout(_machineSchedule, 2000);
}

function _stopMachine() {
    clearTimeout(_machineTimer);
    _machineTimer = null;
    for (const v of _shepardVoices) {
        try { v.osc.stop(); } catch {}
        try { v.osc.disconnect(); } catch {}
        try { v.win.disconnect(); } catch {}
    }
    if (_shepardVoices.length > 0) {
        try { _shepardVoices[0].lpNode.disconnect(); } catch {}
    }
    _shepardVoices = [];
    if (_shepardGain) {
        try { _shepardGain.disconnect(); } catch {}
        _shepardGain = null;
    }
}

/* =============== PUBLIC API =============== */

export function initAudio() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches
        && !localStorage.getItem('shoals_audio_volume')) {
        _volume = 0;
    }
    _createCtx();
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();
}

export function setAmbientMood(mood) {
    if (!_isReady() || _deskSilenced) return;
    const mix = MOOD_MIX[mood];
    if (!mix) return;

    if (mood !== _currentMood) {
        const now = _ctx.currentTime;
        const ramp = _jazzPlaying ? 2 : 0;

        _jazzGain.gain.cancelScheduledValues(now);
        _jazzGain.gain.setValueAtTime(_jazzGain.gain.value, now);
        _jazzGain.gain.linearRampToValueAtTime(mix[0], now + ramp);

        _droneGain.gain.cancelScheduledValues(now);
        _droneGain.gain.setValueAtTime(_droneGain.gain.value, now);
        _droneGain.gain.linearRampToValueAtTime(mix[1], now + ramp);
    }
    _currentMood = mood;

    if (!_jazzPlaying) {
        _jazzPlaying = true;
        _jazzNext = _ctx.currentTime + 0.05;
        _jazzSchedule();
        _startDrone();
    }
}

export function playStinger(type) {
    if (!_isReady()) return;
    const def = STINGER_DEFS[type];
    if (!def) return;

    const now = _ctx.currentTime;
    const count = def.pulses || 1;

    for (let i = 0; i < count; i++) {
        const offset = i * (def.duration / count + 0.05);
        const osc = _ctx.createOscillator();
        osc.type = def.type;
        osc.frequency.setValueAtTime(def.freqStart, now + offset);
        osc.frequency.linearRampToValueAtTime(def.freqEnd, now + offset + def.duration / count);

        const gain = _ctx.createGain();
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(def.gain, now + offset + 0.02);
        gain.gain.setValueAtTime(def.gain, now + offset + def.duration / count * 0.6);
        gain.gain.linearRampToValueAtTime(0, now + offset + def.duration / count);

        osc.connect(gain);
        gain.connect(_stingerGain);
        osc.start(now + offset);
        osc.stop(now + offset + def.duration / count + 0.1);
    }
}

export function playMusic(track) {
    if (!_isReady()) return;
    stopMusic(500);

    const duck = _ctx.currentTime;
    if (_jazzGain) {
        _jazzGain.gain.setValueAtTime(_jazzGain.gain.value, duck);
        _jazzGain.gain.linearRampToValueAtTime(0, duck + 0.5);
    }
    if (_droneGain) {
        _droneGain.gain.setValueAtTime(_droneGain.gain.value, duck);
        _droneGain.gain.linearRampToValueAtTime(0, duck + 0.5);
    }

    const now = _ctx.currentTime;
    const chords = MUSIC_CHORDS[track];
    if (!chords) return;

    for (const chord of chords) {
        for (const freq of chord.notes) {
            const osc = _ctx.createOscillator();
            osc.type = chord.type;
            osc.frequency.value = freq;

            const filter = _ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            filter.Q.value = 1;

            const gain = _ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.06, now + 1.0);
            gain.gain.setValueAtTime(0.06, now + chord.dur - 1.5);
            gain.gain.linearRampToValueAtTime(0, now + chord.dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(_musicGain);
            osc.start(now);
            osc.stop(now + chord.dur + 0.2);

            _musicNodes.push({ osc, filter, gain });
        }
    }
}

export function stopMusic(fadeMs = 1000) {
    if (!_ctx || _musicNodes.length === 0) return;
    clearTimeout(_musicFadeTimer);
    const now = _ctx.currentTime;
    for (const node of _musicNodes) {
        node.gain.gain.setValueAtTime(node.gain.gain.value, now);
        node.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    }
    const nodes = _musicNodes.slice();
    _musicFadeTimer = setTimeout(() => {
        for (const node of nodes) {
            try { node.osc.stop(); } catch {}
            try { node.osc.disconnect(); } catch {}
            try { node.filter.disconnect(); } catch {}
            try { node.gain.disconnect(); } catch {}
        }
    }, fadeMs + 200);
    _musicNodes = [];

    if (_jazzPlaying && _currentMood) {
        const mix = MOOD_MIX[_currentMood] || [1, 0];
        const now2 = _ctx.currentTime;
        const restoreAt = now2 + fadeMs / 1000;
        if (_jazzGain) {
            _jazzGain.gain.setValueAtTime(0, restoreAt);
            _jazzGain.gain.linearRampToValueAtTime(mix[0], restoreAt + 1);
        }
        if (_droneGain) {
            _droneGain.gain.setValueAtTime(0, restoreAt);
            _droneGain.gain.linearRampToValueAtTime(mix[1], restoreAt + 1);
        }
    }
}

/**
 * Act III machine intensity, 0..1 (P7 wires the driver). Monotone in
 * spirit — the transformation is designed as a one-way slide — but the
 * function itself is stateless about direction and safe to call daily.
 * Loop-rendered changes (swing, dynamics, trumpet, instruments) land on
 * the next scheduled pass; the room and the machine layer ramp live.
 */
export function setMachineIntensity(x) {
    _machine = Math.max(0, Math.min(1, x));
    if (!_isReady()) return;
    const now = _ctx.currentTime;

    // The room leaves: club air at 0, anechoic void at 1.
    if (_reverbSend) {
        _reverbSend.gain.cancelScheduledValues(now);
        _reverbSend.gain.setValueAtTime(_reverbSend.gain.value, now);
        _reverbSend.gain.linearRampToValueAtTime(_lerp(0.3, 0.05, _machine), now + 8);
    }

    // The machine layer wakes past ~0.5.
    if (_machine > 0.45 && !_machineTimer) _startMachine();
    if (_shepardGain) {
        const level = Math.max(0, (_machine - 0.55) / 0.45) * 0.05;
        _shepardGain.gain.cancelScheduledValues(now);
        _shepardGain.gain.setValueAtTime(_shepardGain.gain.value, now);
        _shepardGain.gain.linearRampToValueAtTime(level, now + 8);
    }

    // Deep in: the building's hum goes six cents wrong. The fifth of
    // the drone, slightly sharp — nothing a player could name.
    if (_droneNodes.length > 2) {
        const det = _droneNodes[2].osc.detune;
        det.cancelScheduledValues(now);
        det.setValueAtTime(det.value, now);
        det.linearRampToValueAtTime(_machine > 0.85 ? 6 : 0, now + 10);
    }
}

/**
 * The terminal failing to keep up, made audible (P7's degradation
 * events fire these). 1 = dropout (the feed blinks), 2 = stutter
 * (a skipping repeat of the last instant), 3 = stutter with warble
 * (the repeat itself is wrong). Presentation-layer only, like the
 * visual degradation: nothing musical mutates.
 */
export function glitchAudio(severity) {
    if (!_isReady()) return;
    const now = _ctx.currentTime;

    if (severity <= 1) {
        const hold = 0.06 + Math.random() * 0.12;
        _master.gain.cancelScheduledValues(now);
        _master.gain.setValueAtTime(_master.gain.value, now);
        _master.gain.linearRampToValueAtTime(0, now + 0.005);
        _master.gain.setValueAtTime(0, now + 0.005 + hold);
        _master.gain.linearRampToValueAtTime(_volume, now + 0.025 + hold);
        return;
    }

    const long = severity >= 3;
    const hold = long ? 0.6 : 0.35;
    const dry = _jazzGain.gain.value;

    _glitchFb.gain.setValueAtTime(long ? 0.88 : 0.82, now);
    _glitchWet.gain.setValueAtTime(long ? 0.7 : 0.55, now);
    if (long) {
        // Warble: the delay line itself drifts, pitch-smearing the repeats.
        _glitchDelay.delayTime.setValueAtTime(0.09, now);
        _glitchDelay.delayTime.linearRampToValueAtTime(0.14, now + hold);
        _jazzGain.gain.setValueAtTime(dry, now);
        _jazzGain.gain.linearRampToValueAtTime(dry * 0.4, now + 0.05);
    }

    _glitchWet.gain.setValueAtTime(long ? 0.7 : 0.55, now + hold);
    _glitchWet.gain.linearRampToValueAtTime(0, now + hold + 0.05);
    _glitchFb.gain.setValueAtTime(0, now + hold + 0.05);
    _glitchDelay.delayTime.setValueAtTime(0.09, now + hold + 0.1);
    if (long) {
        _jazzGain.gain.setValueAtTime(dry * 0.4, now + hold);
        _jazzGain.gain.linearRampToValueAtTime(dry, now + hold + 0.2);
    }
}

/**
 * The terminal latch (P7 wires this at game over): the band stops
 * mid-note — no fade, no cadence, the tune simply does not continue.
 * The drone holds and the machine layer persists: the human part of
 * the sound dies, and the machines do not notice. One-way until
 * resetAudio.
 */
export function silenceDesk() {
    if (!_ctx || _deskSilenced) return;
    _deskSilenced = true;
    _jazzPlaying = false;
    clearTimeout(_jazzTimer);
    _jazzTimer = null;
    const now = _ctx.currentTime;
    _jazzGain.gain.cancelScheduledValues(now);
    _jazzGain.gain.setValueAtTime(_jazzGain.gain.value, now);
    _jazzGain.gain.linearRampToValueAtTime(0, now + 0.03);
}

export function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    if (_master) _master.gain.value = _volume;
    try { localStorage.setItem('shoals_audio_volume', String(_volume)); } catch {}
}

export function getVolume() { return _volume; }

export function resetAudio() {
    stopMusic(200);
    _jazzPlaying = false;
    clearTimeout(_jazzTimer);
    _jazzTimer = null;
    _currentMood = null;

    // Act III unwinds: the band is human again on the next run.
    _machine = 0;
    _deskSilenced = false;
    _stopMachine();
    if (_ctx) {
        const now = _ctx.currentTime;
        if (_master) {
            _master.gain.cancelScheduledValues(now);
            _master.gain.setValueAtTime(_volume, now);
        }
        if (_reverbSend) {
            _reverbSend.gain.cancelScheduledValues(now);
            _reverbSend.gain.setValueAtTime(0.3, now);
        }
        if (_glitchWet) {
            _glitchWet.gain.cancelScheduledValues(now);
            _glitchWet.gain.setValueAtTime(0, now);
            _glitchFb.gain.setValueAtTime(0, now);
            _glitchDelay.delayTime.setValueAtTime(0.09, now);
        }
        if (_jazzGain) {
            _jazzGain.gain.setValueAtTime(_jazzGain.gain.value, now);
            _jazzGain.gain.linearRampToValueAtTime(0, now + 0.3);
        }
        if (_droneGain) {
            _droneGain.gain.setValueAtTime(_droneGain.gain.value, now);
            _droneGain.gain.linearRampToValueAtTime(0, now + 0.3);
        }
    }
    setTimeout(_stopDrone, 400);
}

/* ---- Volume persistence ---- */
try {
    const saved = localStorage.getItem('shoals_audio_volume');
    if (saved != null) _volume = Math.max(0, Math.min(1, parseFloat(saved)));
} catch {}
