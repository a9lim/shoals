/* ===================================================
   audio.js — "Halcyon", a ballad for the desk.

   One tune, played by a quartet in a late room: Rhodes,
   upright bass, brushes and a Harmon-muted trumpet. The
   form is a 32-bar AABA in A minor at 72 BPM (~107 s a
   chorus), and the band plays it as a four-chorus set
   (~7 minutes) before going round again:

     1. head in    — the trumpet states the tune
     2. Rhodes     — a written solo over the same changes
     3. rhythm     — the bass walks, the piano comps, no one sings
     4. head out   — the tune again, ornamented, with a
                     guide-tone line under the bridge

   The A section's bass falls by half steps (A–G♯–G–F♯)
   under a melody that climbs against it; the bridge turns
   to the relative major and back. Comping, ornaments, the
   bass in the rhythm chorus and the drummer's fills vary
   every pass, so the set never repeats exactly.

   Act III (the machine register): one continuous
   parameter `setMachineIntensity(x)` re-renders the SAME
   form with progressively less humanity — the swing
   straightens, the trumpet goes first and the tune moves
   into the Rhodes, velocities compress, the tremolo and
   the tine's bark flatten, the room reverb dries to an
   anechoic void, and the brushes yield to a tick grid
   that keeps its own time. The harmony never changes; the
   band does. Underneath, a Shepard riser climbs forever
   without arriving, and the tick grid subdivides
   (quarters → 8ths → 16ths) at constant BPM — the day is
   still a day, it just contains more. `glitchAudio` is
   the failing terminal made audible; `silenceDesk()` is
   the terminal latch — the band cuts mid-note, the hum
   and the ticks persist. Valence unsigned by design (03).

   Dispatches ring the wire bell; a superevent rings the
   flash (five bells) and plays a short cue built from the
   tune's own material.

   All Web Audio API — no external audio files. The band
   draws from its own PRNG, never Math.random, so the
   music cannot perturb the price path's stream.
   Leaf module. No DOM access.
   =================================================== */

/* ---- State ---- */
let _ctx, _master, _jazzGain, _droneGain, _stingerGain, _musicGain;
let _reverbSend = null;
let _rhodesBus = null;          // Rhodes voices meet here, through the suitcase tremolo
let _tremDepth = null;          // the tremolo's pan depth (flattens with the machine)
let _volume = 0.3;
let _noiseBuffer = null;
let _jazzPlaying = false;
let _jazzTimer = null;
let _jazzNext = 0;              // start time of the next bar to schedule
let _bar = 0;                   // bar within the chorus, 0..31
let _chorus = 0;                // chorus within the set
let _melodyVoice = 'trumpet';   // who carries the head this chorus
let _skipDownbeat = false;      // the comp anticipated this bar's chord on the last "and"
let _walkPrev = 45;             // last walked bass note (MIDI), for voice leading
let _currentMood = null;
let _droneNodes = [];
let _cueBus = null;             // the live superevent cue
let _musicFadeTimer = null;
let _lastBell = -1;

/* Act III machine register */
let _machine = 0;               // 0 = the band, 1 = the machine
let _machineGain = null;        // machine layer bus (ticks + Shepard) — survives silenceDesk
let _machineTimer = null;
let _machineNext = 0;           // tick-grid look-ahead cursor (its own time, not the band's)
let _shepardGain = null;
let _shepardVoices = [];        // { osc, win, lpNode, nextCycle }
let _glitchDelay = null;        // normally-silent feedback delay: the stutter chain
let _glitchFb = null;
let _glitchWet = null;
let _deskSilenced = false;

/* ---- Constants ---- */

const BPM = 72;
const BEAT = 60 / BPM;          // ~0.833 s
const BAR = 4 * BEAT;
const SW = 0.62;                // swing: upbeats at 62% of the beat (the human baseline)
const LOOKAHEAD = 4;            // seconds of band kept scheduled

/** Live swing ratio: the groove dies by geometry as the machine takes over. */
function _swing() { return SW - 0.12 * _machine; }

/* The band's own random stream (mulberry32). Math.random belongs to the
   price path and the event engine; a drummer's whim must not move a market. */
let _seed = (Date.now() ^ 0x9e3779b9) >>> 0;
function _rand() {
    _seed = (_seed + 0x6d2b79f5) >>> 0;
    let t = _seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Human timing breath: ±6 ms at machine 0, quantized to nothing at machine 1. */
function _jit() { return (1 - _machine) * (_rand() * 2 - 1) * 0.006; }

/** Linear blend helper for the machine transformation. */
function _lerp(a, b, t) { return a + (b - a) * t; }

/** A beat position inside the bar, swung: the "and" of a beat sits late. */
function _pos(b) {
    const whole = Math.floor(b);
    return Math.abs(b - whole - 0.5) < 1e-6 ? whole + _swing() : b;
}

/* Pitch: note names (flats; octaves 2–5) to Hz, and MIDI to Hz. */
const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
function _midi(name) {
    const m = /^([A-G]b?)(\d)$/.exec(name);
    return 12 * (+m[2] + 1) + PC[m[1]];
}
function _hz(midi) { return 440 * 2 ** ((midi - 69) / 12); }
function _note(name) { return _hz(_midi(name)); }

/** Parse a bar of score: "E5@1:1 C5@2:0.5" → [{ beat, freq, dur }]. */
function _bars(rows) {
    return rows.map(row => row.trim() ? row.trim().split(/\s+/).map(tok => {
        const [n, rest] = tok.split('@');
        const [beat, dur] = rest.split(':').map(Number);
        return { beat, freq: _note(n), dur };
    }) : []);
}

/* =============== THE TUNE =============== */

/* The changes, one entry per bar; a two-chord bar changes on beat 3.

   A   Am9 · E7/G♯ · Am7/G · D9/F♯ · Fmaj7♯11 · Bø E7♭9 · Am9 · Bø E7♯9
   A'  Am9 · E7/G♯ · Am7/G · D9/F♯ · Fmaj7 · E7sus4 E7♭9 · Am9 · Am9
   B   Dm9 · G13 · Cmaj9 · Fmaj7♯11 · Bø · E7♭9 · Am9 D9 · Bø E7♯9
   A'' Am9 · E7/G♯ · Am7/G · D9/F♯ · Fmaj7♯11 · E7♭9 · Am9 · Bø E7♯9

   The first four bars are the line cliché in the bass (A, G♯, G, F♯)
   with the melody rising C–E–A over it; the bridge visits the relative
   major and the guide tones fall a step every two bars, F to B. */
const CHART = [
    ['Am9'], ['E7/G#'], ['Am7/G'], ['D9/F#'], ['Fmaj7#11'], ['Bm7b5', 'E7b9'], ['Am9'], ['Bm7b5', 'E7#9'],
    ['Am9'], ['E7/G#'], ['Am7/G'], ['D9/F#'], ['Fmaj7'], ['E7sus4', 'E7b9'], ['Am9'], ['Am9'],
    ['Dm9'], ['G13'], ['Cmaj9'], ['Fmaj7#11'], ['Bm7b5'], ['E7b9'], ['Am9', 'D9'], ['Bm7b5', 'E7#9'],
    ['Am9'], ['E7/G#'], ['Am7/G'], ['D9/F#'], ['Fmaj7#11'], ['E7b9'], ['Am9'], ['Bm7b5', 'E7#9'],
];

/* Rhodes left hand: rootless, mostly between A3 and A4, voice-led so the
   inner parts move by step or hold. The E7 shapes are the diminished
   cluster (3 5 ♭7 ♭9) that gives the tune its ache. */
const VOICING = {
    'Am9':      ['G3', 'B3', 'C4', 'E4'],    // ♭7 9 ♭3 5
    'E7/G#':    ['Ab3', 'B3', 'D4', 'F4'],   // 3 5 ♭7 ♭9 over its own third
    'Am7/G':    ['A3', 'C4', 'E4'],          // over the ♭7 in the bass
    'D9/F#':    ['C4', 'E4', 'A4'],          // ♭7 9 5 — the Dorian sixth of Am
    'Fmaj7#11': ['A3', 'B3', 'E4'],          // 3 ♯11 7 — air
    'Fmaj7':    ['A3', 'C4', 'E4'],
    'Bm7b5':    ['A3', 'D4', 'F4'],          // ♭7 ♭3 ♭5
    'E7b9':     ['Ab3', 'B3', 'D4', 'F4'],
    'E7#9':     ['Ab3', 'D4', 'G4'],         // 3 ♭7 ♯9
    'E7sus4':   ['A3', 'B3', 'D4'],
    'Dm9':      ['F3', 'A3', 'C4', 'E4'],
    'G13':      ['F3', 'B3', 'E4'],          // ♭7 3 13
    'Cmaj9':    ['E3', 'G3', 'B3', 'D4'],
    'D9':       ['Gb3', 'C4', 'E4'],         // 3 ♭7 9
};

/* Chord tones and bass notes as pitch classes, for the walking bass. */
const CHORD_PCS = {
    'Am9': [9, 0, 4, 7, 11], 'E7/G#': [4, 8, 11, 2], 'Am7/G': [9, 0, 4, 7], 'D9/F#': [2, 6, 9, 0, 4],
    'Fmaj7#11': [5, 9, 0, 4, 11], 'Fmaj7': [5, 9, 0, 4], 'Bm7b5': [11, 2, 5, 9], 'E7b9': [4, 8, 11, 2],
    'E7#9': [4, 8, 11, 2], 'E7sus4': [4, 9, 11, 2], 'Dm9': [2, 5, 9, 0, 4], 'G13': [7, 11, 2, 5, 4],
    'Cmaj9': [0, 4, 7, 11, 2], 'D9': [2, 6, 9, 0, 4],
};
const CHORD_BASS = {
    'Am9': 9, 'E7/G#': 8, 'Am7/G': 7, 'D9/F#': 6, 'Fmaj7#11': 5, 'Fmaj7': 5, 'Bm7b5': 11,
    'E7b9': 4, 'E7#9': 4, 'E7sus4': 4, 'Dm9': 2, 'G13': 7, 'Cmaj9': 0, 'D9': 2,
};

/* The head. A motif of three falling notes (E C B), answered by the
   rising arpeggio C–E–A against the falling bass; the A' climbs to the
   high A over Fmaj7 and comes home to a long low A; the bridge sings in
   eighths, peaks on the ♭9 over E7, and slides down by half steps
   (F♯–F–E–D) into the last A. */
const HEAD = _bars([
    'E5@1:1 C5@2:1 B4@3:1',
    'A4@0:1.5 Ab4@1.5:0.5 B4@2:2',
    'C5@0:2 E5@2:1 A5@3:1',
    'G5@0:1 Gb5@1:2 E5@3:1',
    'E5@0:2 D5@2:0.5 C5@2.5:0.5 B4@3:1',
    'A4@0:1 D5@1:1 F5@2:1 E5@3:1',
    'C5@0:3',
    'B4@1:1 D5@2:1 F5@3:1',

    'E5@0:2 C5@2:1 B4@3:1',
    'A4@0:1.5 Ab4@1.5:0.5 B4@2:2',
    'C5@0:2 E5@2:1 A5@3:1',
    'G5@0:1 Gb5@1:2 E5@3:1',
    'A5@0:2 G5@2:1 E5@3:1',
    'D5@0:2 B4@2:1 Ab4@3:1',
    'A4@0:4',
    'A4@2.5:0.5 C5@3:1',

    'F5@0:1.5 E5@1.5:0.5 D5@2:1 C5@3:1',
    'B4@0:2 D5@2:1 E5@3:1',
    'G5@0:2 E5@2:1 D5@3:1',
    'C5@0:1 E5@1:1 A5@2:2',
    'A5@0:1 F5@1:1 D5@2:1 B4@3:1',
    'F5@0:2 E5@2:1 D5@3:1',
    'C5@0:2 E5@2:1 Gb5@3:1',
    'F5@0:1 E5@1:1 D5@2:1 B4@3:1',

    'E5@1:1 C5@2:1 B4@3:1',
    'A4@0:1.5 Ab4@1.5:0.5 B4@2:2',
    'C5@0:2 E5@2:1 A5@3:1',
    'G5@0:1 Gb5@1:2 E5@3:1',
    'E5@0:2 D5@2:0.5 C5@2.5:0.5 B4@3:1',
    'D5@0:1.5 C5@1.5:0.5 B4@2:1 Ab4@3:1',
    'A4@0:4',
    '',
]);

/* The Rhodes chorus. Two-bar phrases with air between them, swung
   eighths, a triplet pickup into the high A, the bridge as a long
   descent from A5, and the last eight bars quoting the head before
   settling on a low A. */
const SOLO = _bars([
    'E4@1.5:0.5 G4@2:0.5 A4@2.5:0.5 C5@3:0.5 B4@3.5:0.5',
    'Ab4@0:1 B4@1:0.5 D5@1.5:0.5 F5@2:1.5 E5@3.5:0.5',
    'C5@0:1.5 A4@1.5:0.5 G4@2:1',
    'Gb4@0.5:0.5 A4@1:0.5 C5@1.5:0.5 E5@2:0.5 D5@2.5:0.5 A4@3:1',
    'B4@0:2 A4@2.5:0.5 E4@3:1',
    'D4@0:0.5 F4@0.5:0.5 A4@1:0.5 B4@1.5:0.5 Ab4@2:0.5 B4@2.5:0.5 D5@3:0.5 F5@3.5:0.5',
    'E5@0:1.5 D5@1.5:0.5 C5@2:2',
    'F4@1:0.5 A4@1.5:0.5 G4@2:0.5 Ab4@2.5:0.5 B4@3:1',

    'A4@0:0.5 B4@0.5:0.5 C5@1:0.5 E5@1.5:0.5 G5@2:1.5 E5@3.5:0.5',
    'F5@0:1 E5@1:1 D5@2:0.5 B4@2.5:0.5 Ab4@3:1',
    'A4@0:2',
    'E5@1:0.333 Gb5@1.333:0.333 G5@1.667:0.333 A5@2:1.5 G5@3.5:0.5',
    'E5@0:1 C5@1:0.5 B4@1.5:0.5 A4@2:2',
    'A4@0:1 B4@1:1 Ab4@2:0.5 F4@2.5:0.5 D4@3:1',
    'C4@0:0.5 E4@0.5:0.5 G4@1:0.5 B4@1.5:0.5 C5@2:2',
    'A4@3:0.5 C5@3.5:0.5',

    'D5@0:1 F5@1:0.5 E5@1.5:0.5 D5@2:0.5 C5@2.5:0.5 A4@3:1',
    'B4@0:1 D5@1:0.5 E5@1.5:0.5 F5@2:1.5 E5@3.5:0.5',
    'D5@0:2 B4@2:0.5 G4@2.5:0.5 E4@3:1',
    'A4@0.5:0.5 B4@1:0.5 C5@1.5:0.5 E5@2:0.5 G5@2.5:0.5 A5@3:1',
    'A5@0:0.5 F5@0.5:0.5 D5@1:0.5 B4@1.5:0.5 A4@2:0.5 F4@2.5:0.5 D4@3:1',
    'E4@0:0.5 Ab4@0.5:0.5 B4@1:0.5 D5@1.5:0.5 F5@2:1 E5@3:1',
    'C5@0:1.5 B4@1.5:0.5 A4@2:0.5 C5@2.5:0.5 Gb5@3:1',
    'F5@0:1 D5@1:1 G5@2:0.5 F5@2.5:0.5 E5@3:1',

    'E5@1:1 C5@2:1 B4@3:1',
    'A4@0:1.5 Ab4@1.5:0.5 B4@2:0.5 D5@2.5:0.5 F5@3:0.5 Ab5@3.5:0.5',
    'A5@0:1 G5@1:0.5 E5@1.5:0.5 C5@2:2',
    'A4@0.5:0.5 C5@1:0.5 E5@1.5:0.5 Gb5@2:0.5 E5@2.5:0.5 D5@3:1',
    'E5@0:2 B4@2:0.5 A4@2.5:0.5 E4@3:1',
    'F4@0:0.5 Ab4@0.5:0.5 B4@1:0.5 D5@1.5:0.5 C5@2:1 B4@3:1',
    'A4@0:3',
    '',
]);

/* Under the last head's bridge: the guide tones, a step down every two
   bars (F F E E D D C), turning onto the dominant's third. */
const COUNTER = _bars([
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    'F4@0:4', 'F4@0:4', 'E4@0:4', 'E4@0:4', 'D4@0:4', 'D4@0:4', 'C4@0:4', 'B3@0:2 Ab3@2:2',
    '', '', '', '', '', '', '', '',
]);

/* The bass in two: half notes through the A sections, the line cliché
   in the first four bars, chromatic approaches into every return; the
   bridge walks in four. Every chorus but the rhythm chorus plays this. */
const BASS = _bars([
    'A2@0:2 E2@2:2',  'Ab2@0:2 B2@2:2', 'G2@0:2 E2@2:2', 'Gb2@0:2 D2@2:1 E2@3:1',
    'F2@0:2 C3@2:2',  'B2@0:2 E2@2:2',  'A2@0:2 E2@2:1 G2@3:1', 'B2@0:2 E2@2:1 Ab2@3:1',
    'A2@0:2 E2@2:2',  'Ab2@0:2 B2@2:2', 'G2@0:2 E2@2:2', 'Gb2@0:2 D2@2:1 E2@3:1',
    'F2@0:2 A2@2:2',  'E2@0:2 E2@2:1 B2@3:1', 'A2@0:2 E2@2:2', 'A2@0:1 G2@1:1 F2@2:1 E2@3:1',
    'D2@0:1 F2@1:1 A2@2:1 C3@3:1', 'G2@0:1 B2@1:1 D3@2:1 Db3@3:1',
    'C3@0:1 B2@1:1 A2@2:1 G2@3:1', 'F2@0:1 G2@1:1 A2@2:1 C3@3:1',
    'B2@0:1 A2@1:1 F2@2:1 Eb2@3:1', 'E2@0:1 Ab2@1:1 B2@2:1 Bb2@3:1',
    'A2@0:1 C3@1:1 D3@2:1 C3@3:1', 'B2@0:1 D3@1:1 E2@2:1 Ab2@3:1',
    'A2@0:2 E2@2:2',  'Ab2@0:2 B2@2:2', 'G2@0:2 E2@2:2', 'Gb2@0:2 D2@2:1 E2@3:1',
    'F2@0:2 C3@2:2',  'E2@0:2 B2@2:1 Ab2@3:1', 'A2@0:2 E2@2:2', 'B2@0:2 E2@2:1 Ab2@3:1',
]);

/* Comping cells: [beat, beats held, velocity, flag]. 'g' is a ghost (a
   muted touch); 'ant' voices the NEXT bar's chord on the last swung
   "and", and that bar then skips its downbeat. */
const CELLS = {
    ballad:     [[0, 1.6, 0.85]],
    breath:     [[0, 2.4, 0.7]],
    push:       [[0, 1.0, 0.75], [3.5, 0.5, 0.6, 'ant']],
    charleston: [[0, 0.7, 0.7], [1.5, 0.5, 0.55]],
    sparse:     [[1, 1.5, 0.6]],
    ghosts:     [[0, 1.2, 0.75], [2.5, 0.3, 0.35, 'g'], [3.5, 0.3, 0.3, 'g']],
    rest:       [],
};
const TWO_CELLS = [
    [[0, 1.4, 0.75], [2, 1.4, 0.7]],
    [[0, 0.7, 0.7], [1.5, 0.3, 0.35, 'g'], [2, 1.3, 0.7]],
];
/* The machine's comping: quarters, all the same weight. */
const GRID_CELL = [[0, 0.5, 0.62], [1, 0.5, 0.62], [2, 0.5, 0.62], [3, 0.5, 0.62]];

/* The set: who leads each chorus, how the bass plays, how the piano comps. */
const SET = [
    { lead: 'head', bass: 'two',  comp: { ballad: 3, push: 2, ghosts: 2, breath: 1, rest: 0.5 } },
    { lead: 'solo', bass: 'two',  comp: { sparse: 3, breath: 2, rest: 1.5, ballad: 1 } },
    { lead: null,   bass: 'walk', comp: { charleston: 3, push: 2, ghosts: 1, ballad: 1 } },
    { lead: 'out',  bass: 'two',  comp: { ballad: 2, push: 2, ghosts: 2, charleston: 1 } },
];

/* =============== STINGERS AND CUES =============== */

/* The wire bell: a struck bell's inharmonic partials, high and short.
   One for a dispatch; the flash (a superevent) is five. */
const BELL_PARTIALS = [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]];
const BELL_F0 = 1318.5;         // E6, the fifth of the key
const BELL_GAP = 0.19;          // seconds between strikes of the flash

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
        _setupRhodesBus();
    } catch { /* AudioContext unavailable */ }
}

function _isReady() {
    return _ctx && _ctx.state === 'running';
}

/* ---- Reverb: convolver with synthetic impulse response ----
   Small intimate room — 1.8 s tail with 12 ms predelay,
   darkened via lowpass on the return to simulate air absorption. */

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
            d[i] = (_rand() * 2 - 1) * Math.exp(-3.5 * (i - pre) / rate);
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

/* ---- The suitcase: every Rhodes note passes one stereo tremolo, a slow
   pan between the speakers. The machine flattens it to a point. */
function _setupRhodesBus() {
    _rhodesBus = _ctx.createGain();
    _rhodesBus.gain.value = 1;
    if (typeof _ctx.createStereoPanner !== 'function') {
        _rhodesBus.connect(_jazzGain);
        return;
    }
    const pan = _ctx.createStereoPanner();
    const lfo = _ctx.createOscillator();
    lfo.frequency.value = 4.6;
    _tremDepth = _ctx.createGain();
    _tremDepth.gain.value = 0.32;
    lfo.connect(_tremDepth);
    _tremDepth.connect(pan.pan);
    lfo.start();
    _rhodesBus.connect(pan);
    pan.connect(_jazzGain);
}

/* =============== INSTRUMENTS =============== */

/** Ensure the noise buffer exists for percussion and breath. */
function _ensureNoise() {
    if (_noiseBuffer) return;
    const len = _ctx.sampleRate * 2;
    _noiseBuffer = _ctx.createBuffer(1, len, _ctx.sampleRate);
    const d = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = _rand() * 2 - 1;
}

/** Rhodes: a 1:1 FM tine whose index falls fast (the bark of the hammer),
    a short high partial for the tine's ting, and a long exponential
    decay. Ghosts are dark and barkless. Machine: the bark and the
    warmth detune flatten, the attack sharpens from a touch to a
    trigger, and the filter opens bright and even. */
function _rhodesNote(freq, time, durBeats, vol, isGhost = false, dest = _rhodesBus) {
    const dur = durBeats * BEAT;
    const m = _machine;

    const car = _ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = freq;

    const mod = _ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * _lerp(1.0012, 1.0, m);

    const index = _ctx.createGain();
    const bark = isGhost ? 0.35 : _lerp(1.5, 0.7, m);
    index.gain.setValueAtTime(freq * bark, time);
    index.gain.exponentialRampToValueAtTime(freq * 0.06, time + _lerp(0.4, 0.15, m));
    mod.connect(index);
    index.connect(car.frequency);


    const flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = isGhost ? _lerp(1100, 3200, m) : _lerp(2600, 4200, m);
    flt.Q.value = 0.6;

    // A 1:1 FM pair throws a sideband at 0 Hz: a decaying DC offset that
    // thumps and eats headroom. Nothing a Rhodes sounds sits below its note.
    const hp = _ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = freq * 0.5;
    hp.Q.value = 0.5;
    flt.connect(hp);

    // Envelope: a touch, an exponential fall to the sustain, a short
    // release. Event times stay strictly ordered for every duration.
    const atk = _lerp(0.004, 0.0015, m);
    const rel = Math.min(0.22, dur * 0.3);
    const decayEnd = time + Math.max(atk + 0.01, Math.min(1.4, dur - rel));
    const holdEnd = Math.max(decayEnd, time + dur - rel);
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + atk);
    g.gain.exponentialRampToValueAtTime(vol * 0.42, decayEnd);
    g.gain.setValueAtTime(vol * 0.42, holdEnd);
    g.gain.linearRampToValueAtTime(0, Math.max(holdEnd + 0.01, time + dur));

    car.connect(flt);
    hp.connect(g);
    g.connect(dest);
    if (_reverbSend && dest === _rhodesBus) g.connect(_reverbSend);

    const end = Math.max(holdEnd + 0.01, time + dur) + 0.03;
    car.start(time);  car.stop(end);
    mod.start(time);  mod.stop(end);

    // The tine's ting: a short partial high above the note (struck notes only).
    if (!isGhost) {
        const tine = _ctx.createOscillator();
        tine.type = 'sine';
        tine.frequency.value = freq * 7.02;
        const tineG = _ctx.createGain();
        tineG.gain.setValueAtTime(vol * 0.18, time);
        tineG.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
        tine.connect(tineG);
        tineG.connect(flt);
        tine.start(time);
        tine.stop(time + 0.1);
    }
}

/** Upright bass: triangle body under a sub-octave sine, a filter that
    closes after the pluck, and a short knock of finger on string.
    Machine: the ring shortens toward sequenced staccato and the body
    brightens toward a synth voice — the same line, walked by something
    that never had hands. */
function _bassNote(freq, time, durBeats, vol, dest = _jazzGain) {
    const dur = durBeats * BEAT * _lerp(0.95, 0.62, _machine);
    const decay = Math.max(dur * 0.3, 0.1);

    const osc1 = _ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    const flt1 = _ctx.createBiquadFilter();
    flt1.type = 'lowpass';
    flt1.Q.value = 1;
    flt1.frequency.setValueAtTime(_lerp(900, 1100, _machine), time);
    flt1.frequency.exponentialRampToValueAtTime(_lerp(330, 560, _machine), time + 0.16);

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

    // The pluck: a knock of noise around 700 Hz, gone in a few ms.
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;
    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 2;
    const kg = _ctx.createGain();
    kg.gain.setValueAtTime(vol * 0.25 * (1 - 0.6 * _machine), time);
    kg.gain.exponentialRampToValueAtTime(0.0001, time + 0.012);
    src.connect(bp); bp.connect(kg); kg.connect(dest);
    src.start(time, _rand() * 1.5);
    src.stop(time + 0.02);
}

/** Harmon-muted trumpet: two sawtooths a few cents apart, through the
    mute's two resonances (around 1.6 and 3.1 kHz) over a small body;
    each note scoops up from a little flat, carries a puff of breath, and
    takes its vibrato late, as a player does. */
function _trumpetNote(freq, time, durBeats, vol, dest = _jazzGain) {
    const dur = durBeats * BEAT;

    const o1 = _ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    const o2 = _ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = freq;
    o2.detune.value = -5;

    for (const o of [o1, o2]) {
        o.detune.setValueAtTime(o === o2 ? -40 : -35, time);
        o.detune.linearRampToValueAtTime(o === o2 ? -5 : 0, time + 0.07);
    }

    const vib = _ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibAmt = _ctx.createGain();
    const vOn = time + Math.min(0.35, dur * 0.4);
    vibAmt.gain.setValueAtTime(0, time);
    vibAmt.gain.setValueAtTime(0, vOn);
    vibAmt.gain.linearRampToValueAtTime(dur > 0.6 ? 13 : 0, vOn + 0.4);
    vib.connect(vibAmt);
    vibAmt.connect(o1.detune);
    vibAmt.connect(o2.detune);

    const mix = _ctx.createGain();
    mix.gain.value = 0.5;
    o1.connect(mix);
    o2.connect(mix);

    const f1 = _ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 1600; f1.Q.value = 4;
    const f2 = _ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 3100; f2.Q.value = 6;
    const body = _ctx.createBiquadFilter();
    body.type = 'lowpass'; body.frequency.value = 1000; body.Q.value = 0.7;
    const g2 = _ctx.createGain(); g2.gain.value = 0.55;
    const gb = _ctx.createGain(); gb.gain.value = 0.45;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.05);
    g.gain.linearRampToValueAtTime(vol * 0.85, time + Math.max(0.06, dur * 0.7));
    g.gain.linearRampToValueAtTime(0, time + dur);

    mix.connect(f1); f1.connect(g);
    mix.connect(f2); f2.connect(g2); g2.connect(g);
    mix.connect(body); body.connect(gb); gb.connect(g);
    g.connect(dest);
    if (_reverbSend && dest === _jazzGain) g.connect(_reverbSend);

    // Breath at the front of the note.
    _ensureNoise();
    const br = _ctx.createBufferSource();
    br.buffer = _noiseBuffer;
    const bbp = _ctx.createBiquadFilter();
    bbp.type = 'bandpass'; bbp.frequency.value = 2200; bbp.Q.value = 1;
    const bg = _ctx.createGain();
    bg.gain.setValueAtTime(vol * 0.5, time);
    bg.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    br.connect(bbp); bbp.connect(bg); bg.connect(dest);
    br.start(time, _rand() * 1.5);
    br.stop(time + 0.1);

    const end = time + dur + 0.05;
    o1.start(time);  o1.stop(end);
    o2.start(time);  o2.stop(end);
    vib.start(time); vib.stop(end);
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
    src.start(time, _rand() * 1.5);
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
    src.start(time, _rand() * 1.5);
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

/** Cross-stick: tight bandpass noise for a woody turnaround accent. */
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
    src.start(time, _rand() * 1.5);
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
    src.start(time, _rand() * 1.5);
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

/** The wire bell: one strike, partials decaying faster the higher they sit. */
function _bell(time, vol, dest = _stingerGain) {
    for (const [ratio, amp] of BELL_PARTIALS) {
        const osc = _ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = BELL_F0 * ratio;
        const g = _ctx.createGain();
        const tail = 1.3 / Math.sqrt(ratio);
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(vol * amp, time + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, time + tail);
        osc.connect(g); g.connect(dest);
        osc.start(time);
        osc.stop(time + tail + 0.05);
    }
}

/* =============== THE BAND =============== */

/** Pick a comping cell by weight. */
function _pickCell(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = _rand() * total;
    for (const k in weights) {
        r -= weights[k];
        if (r <= 0) return CELLS[k];
    }
    return CELLS.ballad;
}

/** Voice one comp hit. Velocities flatten toward a mezzo as the machine
    rises, which is what "expressive" sounds like after quantization. */
function _compHit(chord, at, dur, vel, ghost) {
    const base = ghost ? 0.016 : 0.04;
    const v = _lerp(vel, 0.62, _machine * 0.8);
    for (const name of VOICING[chord]) _rhodesNote(_note(name), at, dur, base * v, ghost);
}

/** The walking bass for one bar: the chord's bass note on the downbeat,
    chord tones heading for the next bar, and a chromatic step into it. */
function _walkBar(bar) {
    const chords = CHART[bar];
    const next = CHART[(bar + 1) % CHART.length][0];
    const near = (pc, from) => {
        let best = null;
        for (let m = 38; m <= 55; m++) {
            if (m % 12 !== pc) continue;
            if (best == null || Math.abs(m - from) < Math.abs(best - from)) best = m;
        }
        return best;
    };
    const tone = (chord, aim, avoid) => {
        let best = null, score = Infinity;
        for (let m = 38; m <= 55; m++) {
            if (!CHORD_PCS[chord].includes(m % 12) || m === avoid) continue;
            const s = Math.abs(m - aim) + _rand() * 1.5;
            if (s < score) { score = s; best = m; }
        }
        return best;
    };
    const b0 = near(CHORD_BASS[chords[0]], _walkPrev);
    const target = near(CHORD_BASS[next], b0);
    const notes = [b0];
    if (chords.length === 2) {
        notes.push(tone(chords[0], (b0 + target) / 2, b0));
        notes.push(near(CHORD_BASS[chords[1]], notes[1]));
    } else {
        notes.push(tone(chords[0], b0 + (target - b0) / 3, b0));
        notes.push(tone(chords[0], b0 + 2 * (target - b0) / 3, notes[1]));
    }
    const last = notes[2];
    notes.push(target + (last > target ? 1 : -1));
    _walkPrev = target;
    return notes;
}

/** Ornament the closing head: a turn from above into some long notes. */
function _ornament(notes) {
    const out = [];
    for (const n of notes) {
        if (n.dur >= 1.5 && _rand() < 0.35) {
            out.push({ beat: n.beat, freq: n.freq * 2 ** (2 / 12), dur: 0.12, grace: true });
            out.push(n);
        } else out.push(n);
    }
    return out;
}

/** Schedule one bar of the set at t0. Everything human is read from the
    machine parameter at schedule time, so the same tune re-renders bar
    by bar with whatever humanity is left. */
function _scheduleBar(t0) {
    const bar = _bar;
    const part = SET[_chorus % SET.length];
    const m = _machine;
    const dest = _jazzGain;
    const chords = CHART[bar];
    const sw = _swing();

    if (bar === 0) {
        // Who carries the head this time round: the breath instrument goes
        // first (gone past machine 0.4), and the tune moves into the Rhodes.
        _melodyVoice = _rand() < Math.max(0, 1 - m / 0.4) ? 'trumpet' : 'rhodes';
    }

    /* Bass */
    if (part.bass === 'walk') {
        const line = _walkBar(bar);
        for (let i = 0; i < 4; i++) _bassNote(_hz(line[i]), t0 + i * BEAT + _jit(), 0.95, 0.20);
    } else {
        for (const b of BASS[bar]) _bassNote(b.freq, t0 + b.beat * BEAT + _jit(), b.dur, 0.20);
        const lastBass = BASS[bar][BASS[bar].length - 1];
        _walkPrev = Math.round(12 * Math.log2(lastBass.freq / 440) + 69);
    }

    /* Comp */
    const gridOdds = Math.max(0, (m - 0.6) / 0.4);
    let cell;
    if (_rand() < gridOdds) cell = GRID_CELL;
    else if (chords.length === 2) cell = TWO_CELLS[Math.floor(_rand() * TWO_CELLS.length)];
    else cell = _pickCell(part.comp);
    const skip = _skipDownbeat;
    _skipDownbeat = false;
    for (const [beat, dur, vel, flag] of cell) {
        if (skip && beat === 0) continue;
        const at = t0 + _pos(beat) * BEAT + _jit();
        if (flag === 'ant') {
            _compHit(CHART[(bar + 1) % CHART.length][0], at, dur + 1, vel, false);
            _skipDownbeat = true;
        } else {
            const chord = chords.length === 2 && beat >= 2 ? chords[1] : chords[0];
            _compHit(chord, at, dur, vel, flag === 'g');
        }
    }

    /* The lead */
    const lead = part.lead;
    if (lead === 'head' || lead === 'out') {
        const notes = lead === 'out' && m < 0.4 ? _ornament(HEAD[bar]) : HEAD[bar];
        for (const n of notes) {
            const at = t0 + _pos(n.beat) * BEAT - (n.grace ? 0.1 : 0) + _jit();
            if (_melodyVoice === 'trumpet') _trumpetNote(n.freq, at, n.dur, n.grace ? 0.013 : 0.022);
            else _rhodesNote(n.freq, at, n.dur, n.grace ? 0.025 : 0.065);
        }
        if (lead === 'out') {
            for (const n of COUNTER[bar]) _rhodesNote(n.freq, t0 + n.beat * BEAT, n.dur, 0.02);
        }
    } else if (lead === 'solo') {
        for (const n of SOLO[bar]) {
            const at = t0 + _pos(n.beat) * BEAT + _jit();
            const accent = n.beat % 1 === 0 ? 1 : 0.85;
            _rhodesNote(n.freq, at, n.dur * 0.95, _lerp(0.065 * accent, 0.058, m));
        }
    }

    /* Drums: brush circles with dabs on 2 and 4, a soft kick at section
       starts, cross-stick on the turnarounds, ride shimmer on the swung
       upbeats (steady in the rhythm chorus), and a triplet fill into
       every new section. The kit is the machine's first conquest — the
       circles thin to nothing and the swung shimmer dies with the swing;
       what replaces them ticks on the machine bus, in its own time. */
    const brush = 1 - m * 0.85;
    const walk = part.bass === 'walk';
    for (let i = 0; i < 4; i++) {
        _brushSwish(t0 + i * BEAT, 0.30, (walk ? 0.022 : 0.018) * brush, dest);
        _brushSwish(t0 + (i + sw) * BEAT, 0.22, 0.010 * brush, dest);
    }
    const fill = bar % 8 === 7 && _rand() < 0.7;
    _brushDab(t0 + BEAT, 0.030 * brush, dest);
    if (fill) {
        for (const f of [3, 3 + 1 / 3, 3 + 2 / 3]) _brushDab(t0 + f * BEAT, 0.024 * brush, dest);
    } else {
        _brushDab(t0 + 3 * BEAT, 0.030 * brush, dest);
    }
    if (bar % 8 === 0) _kick(t0, 0.035, dest);
    if (!fill && (bar === 7 || bar === 15 || bar === 31)) _crossStick(t0 + 3 * BEAT, 0.025 * brush, dest);
    if (walk) {
        for (const b of [0, 1, 1 + sw, 2, 3, 3 + sw]) _rideTing(t0 + b * BEAT, 0.008 * (1 - m), dest);
    } else if (bar % 2 === 0) {
        _rideTing(t0 + sw * BEAT, 0.012 * (1 - m), dest);
        _rideTing(t0 + (2 + sw) * BEAT, 0.010 * (1 - m), dest);
    }

    _bar = (bar + 1) % CHART.length;
    if (_bar === 0) _chorus++;
}

/** Look-ahead scheduler: keeps LOOKAHEAD seconds of band queued, a bar at a time. */
function _jazzSchedule() {
    if (!_jazzPlaying || !_ctx) return;
    while (_jazzNext < _ctx.currentTime + LOOKAHEAD) {
        _scheduleBar(_jazzNext);
        _jazzNext += BAR;
    }
    clearTimeout(_jazzTimer);
    _jazzTimer = setTimeout(_jazzSchedule, 1000);
}

/* =============== SUPEREVENT CUES ===============

   Each cue takes the band's place for one dispatch, on its own bus,
   built from the tune: the motif, the line cliché, the E7 ache. */

const CUES = {
    /* The motif in the major: E, C♯, B, A over F → E → A. The wonder
       arrives in the third that the tune never had. */
    triumph(t, dest) {
        const ch = (names, at, beats, v) => { for (const n of names) _rhodesNote(_note(n), t + at * BEAT, beats, v, false, dest); };
        ch(['A3', 'B3', 'E4'], 0, 2, 0.03);
        _bassNote(_note('F2'), t, 2, 0.2, dest);
        ch(['A3', 'B3', 'D4'], 2, 2, 0.03);
        _bassNote(_note('E2'), t + 2 * BEAT, 2, 0.2, dest);
        ch(['Db4', 'E4', 'B4'], 4, 8, 0.032);
        _bassNote(_note('A2'), t + 4 * BEAT, 8, 0.2, dest);
        const motif = [['E5', 1, 1], ['Db5', 2, 1], ['B4', 3, 1], ['A4', 4, 6]];
        for (const [n, b, d] of motif) _trumpetNote(_note(n), t + b * BEAT, d, 0.02, dest);
    },
    /* The line cliché keeps falling: A, G♯, G, F♯, F, E in half notes,
       past where the tune stops it, under the piano's same chords. */
    collapse(t, dest) {
        const line = ['A2', 'Ab2', 'G2', 'Gb2', 'F2', 'E2'];
        line.forEach((n, i) => _bassNote(_note(n), t + i * 2 * BEAT, i === 5 ? 6 : 2, 0.22, dest));
        const ch = (names, at, beats) => { for (const n of names) _rhodesNote(_note(n), t + at * BEAT, beats, 0.028, false, dest); };
        ch(['G3', 'B3', 'C4', 'E4'], 0, 4);
        ch(['C4', 'E4', 'A4'], 6, 2);
        ch(['A3', 'B3', 'E4'], 8, 2);
        ch(['Ab3', 'B3', 'D4', 'F4'], 10, 6);
    },
    /* A heartbeat on E under the diminished cluster, and the trumpet
       holding the ♭9 until it is not sure it should. */
    tension(t, dest) {
        for (let i = 0; i < 12; i++) _bassNote(_note('E2'), t + i * BEAT, 0.6, 0.22 * (1 - i / 16), dest);
        for (const at of [0, 2, 4, 6, 8, 10])
            for (const n of ['Ab3', 'B3', 'D4', 'F4']) _rhodesNote(_note(n), t + at * BEAT, 1.2, 0.016, true, dest);
        _trumpetNote(_note('F5'), t + 2 * BEAT, 8, 0.016, dest);
    },
};

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

/**
 * A short sound for a fired event. 'alert' rings the wire bell once
 * (at most one bell per second, so a busy wire does not become a
 * carillon); 'positive' and 'negative' are two Rhodes notes in the key,
 * a third up or a half step down. The flash belongs to playMusic.
 */
export function playStinger(type) {
    if (!_isReady()) return;
    const now = _ctx.currentTime;
    if (type === 'alert') {
        if (now - _lastBell < 1) return;
        _lastBell = now;
        _bell(now + 0.01, 0.05);
    } else if (type === 'positive') {
        _rhodesNote(_note('C5'), now + 0.01, 0.6, 0.045, false, _stingerGain);
        _rhodesNote(_note('E5'), now + 0.01 + 0.3 * BEAT, 1.2, 0.045, false, _stingerGain);
    } else if (type === 'negative') {
        _rhodesNote(_note('F4'), now + 0.01, 0.6, 0.045, false, _stingerGain);
        _rhodesNote(_note('E4'), now + 0.01 + 0.3 * BEAT, 1.4, 0.04, false, _stingerGain);
    }
}

/**
 * A superevent's cue: the band ducks, the flash rings (the dispatch has
 * already rung its own bell, so four more make five), and a cue built
 * from the tune plays on its own bus until stopMusic.
 */
export function playMusic(track) {
    if (!_isReady()) return;
    const cue = CUES[track];
    if (!cue) return;
    stopMusic(500);

    const now = _ctx.currentTime;
    for (const g of [_jazzGain, _droneGain]) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + 0.5);
    }

    for (let i = 1; i < 5; i++) _bell(now + 0.01 + i * BELL_GAP, 0.05);
    _lastBell = now;

    _cueBus = _ctx.createGain();
    _cueBus.gain.value = 1;
    _cueBus.connect(_musicGain);
    cue(now + 1.2, _cueBus);
}

export function stopMusic(fadeMs = 1000) {
    if (!_ctx || !_cueBus) return;
    clearTimeout(_musicFadeTimer);
    const now = _ctx.currentTime;
    const bus = _cueBus;
    _cueBus = null;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    _musicFadeTimer = setTimeout(() => { try { bus.disconnect(); } catch {} }, fadeMs + 200);

    if (_jazzPlaying && _currentMood && !_deskSilenced) {
        const mix = MOOD_MIX[_currentMood] || [1, 0];
        const restoreAt = now + fadeMs / 1000;
        _jazzGain.gain.setValueAtTime(0, restoreAt);
        _jazzGain.gain.linearRampToValueAtTime(mix[0], restoreAt + 1);
        _droneGain.gain.setValueAtTime(0, restoreAt);
        _droneGain.gain.linearRampToValueAtTime(mix[1], restoreAt + 1);
    }
}

/**
 * Act III machine intensity, 0..1 (act3.js drives it). Monotone in
 * spirit — the transformation is designed as a one-way slide — but the
 * function itself is stateless about direction and safe to call daily.
 * Bar-rendered changes (swing, dynamics, who plays the tune, the
 * instruments) land on the next scheduled bar; the room, the tremolo
 * and the machine layer ramp live.
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

    // The suitcase stops breathing: the tremolo narrows to a point.
    if (_tremDepth) {
        _tremDepth.gain.cancelScheduledValues(now);
        _tremDepth.gain.setValueAtTime(_tremDepth.gain.value, now);
        _tremDepth.gain.linearRampToValueAtTime(_lerp(0.32, 0, Math.min(1, _machine * 1.4)), now + 8);
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
 * The terminal failing to keep up, made audible (act3's degradation
 * clustering fires these). 1 = dropout (the feed blinks), 2 = stutter
 * (a skipping repeat of the last instant), 3 = stutter with warble
 * (the repeat itself is wrong). Presentation-layer only, like the
 * visual degradation: nothing musical mutates.
 */
export function glitchAudio(severity) {
    if (!_isReady()) return;
    const now = _ctx.currentTime;

    if (severity <= 1) {
        const hold = 0.06 + _rand() * 0.12;
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
 * The terminal latch (main.js calls it at game over): the band stops
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

    // The set starts over from the head, and the band is human again.
    _bar = 0;
    _chorus = 0;
    _skipDownbeat = false;
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
        if (_tremDepth) {
            _tremDepth.gain.cancelScheduledValues(now);
            _tremDepth.gain.setValueAtTime(0.32, now);
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
