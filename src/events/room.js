/* ===================================================
   src/events/room.js -- The room (P7-3, 2026-07-24):
   the endgame branch point.

   04: "One decision event, Act III ... when the leader lab
   reaches the final scaling decision, WHETHER the player is
   present -- and what weight their voice carries -- is a
   pure function of accumulated standing." The room is
   influence, not authorship. You bought a seat, not the
   steering wheel; hidden state still resolves the world.

   MACHINERY (02a Act III "The room" + P7-3 semantics item 1):
   - LATCH-FIRED, never Poisson. main.js's `_checkRoom` fires
     it once per run off the race-side pure predicate
     (`roomTriggerReady`: leader `C_internal >= R5 - 0.15`),
     strictly PRE-terminal. Category 'room' is Poisson-
     EXCLUDED in events.js and NOT terminal-safe: its effects
     require a live world by construction, so the terminal
     queue filter DISCARDS it (never an exemption).
   - STANDING GATE: in the room iff >= ROOM_MIN_CRITERIA of
     the six criteria hold; the satisfied COUNT is the voice
     weight, and it scales the advice's whitelisted
     raceEffects by voice/ROOM_MAX_VOICE. Below the gate NO
     beat fires at all -- not even a toast. The ending
     arrives as weather, on the news, which the event feed
     already is.
   - The advise-the-deal option exists ONLY while the summit
     window is open (`world.ai.summitLive`); `roomChoices`
     filters it at fire time.
   - Effects land through the STANDARD raceEffects chokepoint
     (`_applyPopupChoice` -> applyRaceEffects): whitelisted
     dials (S per lab, heat), the standard +-0.15 per-effect
     clamp, ledgered under this event id. At full voice this
     is the loudest row the complicity ledger will ever
     carry, by design.
   - PER-LEADER PRESENTATION (02a P7-3 ruling 3): the fired
     meta carries `leaderLab` (from `roomTrigger` -- the same
     race-side helper the predicate comes from, never a
     recompute), and BOTH the headline and the context are
     selected from per-leader pools. They are keyed by a
     COARSE SIDE -- 'home' (Halcyon or Polaris) vs 'rival'
     (Tianxia) -- because the two rooms are different rooms:
     an American lab about to cross is a triumph with a
     conscience problem; Beijing about to cross is a panic.
     Rotation is a deterministic per-(shell, side) counter --
     the `headlinesByAttribution` precedent, NEVER an RNG
     draw -- and `resetRoomRotation()` clears it per run, so
     same-seed playback never depends on process history.
     Context is selected at FIRE time and each pool entry is
     finished text (context is not token-substituted).
     The CHOICES stay leader-agnostic: one set, because the
     advice is the advice.
   - Flags: every path sets `sat_in_the_room` (main.js, at the
     choice chokepoint -- the seat is the beat, not one
     option); saying nothing ALSO sets `room_declined`. Both
     are endings-visible.
   - No `impulse`, no `params`: the room is a private meeting
     about a decision the world has not been told about. The
     tape does not print it.

   ALL PROSE IS PLACEHOLDER (`PROSE: coordinator`). This is
   the game's climax; the coordinator writes every word.
   Data + the pure gate/scale helpers only.
   =================================================== */

/** Minimum satisfied criteria for a seat (02a: >= 2 of six). */
export const ROOM_MIN_CRITERIA = 2;
/** Full voice = all six criteria; the advice scale is voice/ROOM_MAX_VOICE. */
export const ROOM_MAX_VOICE = 6;
/** Faction thresholds for criteria 2 and 3 (02a). Criterion 1 is belief.js's own
 *  memo gate (credibility > 0.55) -- read through `canSendMemos()`, never
 *  re-derived here; criterion 4 is main.js's firm-conversion latch. */
export const ROOM_GATE = { safetyNetworkTrust: 45, labRelations: 55 };
/** playerChoices flags criteria 5 and 6 read. Exported so the treasury-backchannel
 *  beat and this gate can be asserted to name the SAME flag (harness N). */
export const ROOM_FLAG_CRITERIA = {
    advice: ['briefed_fixedpoint', 'backed_halcyon_restraint'],   // either one satisfies criterion 5
    treasury: 'treasury_backchannel',                            // criterion 6
};

/** The shell id main.js fires. */
export const ROOM_EVENT_ID = 'the_room';
/** The two endings-visible room flags. `seat` is set by main.js at the choice
 *  chokepoint on EVERY path (the seat is the beat); `declined` rides the
 *  say-nothing choice's own `playerFlag`. */
export const ROOM_FLAGS = { seat: 'sat_in_the_room', declined: 'room_declined' };
/** The two presentation sides the pools are keyed by (02a P7-3 ruling 3). */
export const ROOM_LEADER_SIDES = ['home', 'rival'];
/** Labs whose lead makes it the RIVAL room. The explicit set is the small one; a
 *  Polaris lead is still the HOME room (Polaris is the Halcyon schism -- an
 *  American lab), and an unknown/absent leader defaults home, because the room is
 *  convened in Washington either way. A coarse side beats three near-identical
 *  pools and puts the split exactly where the prose turns. */
const RIVAL_LABS = new Set(['tianxia']);

/** Coarse presentation side for a leader lab id. Pure. */
export function roomLeaderSide(leaderLab) {
    return RIVAL_LABS.has(leaderLab) ? 'rival' : 'home';
}

export const ROOM_EVENTS = [
    {
        id: ROOM_EVENT_ID,
        category: 'room',
        popup: true,
        superevent: true,
        magnitude: 'major',
        // NO scalar `headline`/`context` BY CONSTRUCTION: both come from the
        // per-leader pools below, selected by `roomPresentation` at fire time. A
        // scalar would silently win over the pools on some future path (the intel
        // shells carry the same discipline for the same reason).
        headlinesByLeader: {
            home: [
                'PROSE: coordinator — THE ROOM, home-side: an American lab is about to cross, the desk is in the room for the decision, and the meeting is a triumph with a conscience problem.',
                'PROSE: coordinator — THE ROOM, home-side (variant 2): the same meeting, a different way in.',
            ],
            rival: [
                'PROSE: coordinator — THE ROOM, rival-side: Beijing is about to cross, and the room the desk is in is the panic room — still Washington\'s room, convened about somebody else\'s clock.',
                'PROSE: coordinator — THE ROOM, rival-side (variant 2): the same panic, a different way in.',
            ],
        },
        contextsByLeader: {
            home: [
                'PROSE: coordinator — home-side context: one voice among several, never a control knob; hidden state still resolves the world. What the seat cost, what the advice is worth, and what it means that the invitation came at all.',
                'PROSE: coordinator — home-side context (variant 2).',
            ],
            rival: [
                'PROSE: coordinator — rival-side context: the decision on the table is a response, not a choice; the margin argument sounds different when the schedule is being set abroad.',
                'PROSE: coordinator — rival-side context (variant 2).',
            ],
        },
        params: {},              // the room is not a market event: no deltas, no impulse
        choices: [
            {
                label: 'PROSE: coordinator — advise speed',
                desc: 'PROSE: coordinator — ship; the margin is a luxury the position no longer affords.',
                _roomVerb: 'speed',
                // Full-voice magnitude (02a): S[halcyon] -0.12. Scaled by
                // voice/ROOM_MAX_VOICE in roomChoices before it is ever fired.
                raceEffects: [{ dial: 'S', lab: 'halcyon', amount: -0.12 }],
                resultToast: 'PROSE: coordinator — the speed advice, received.',
            },
            {
                label: 'PROSE: coordinator — advise margin',
                desc: 'PROSE: coordinator — hold; buy the safety margin with time nobody thinks they have.',
                _roomVerb: 'margin',
                raceEffects: [{ dial: 'S', lab: 'halcyon', amount: 0.12 }],
                resultToast: 'PROSE: coordinator — the margin advice, received.',
            },
            {
                label: 'PROSE: coordinator — advise the deal',
                desc: 'PROSE: coordinator — the window is open; spend the room on the treaty instead of the schedule.',
                _roomVerb: 'deal',
                // Present ONLY while the summit window is live (02a); roomChoices
                // filters on this at fire time.
                _roomNeedsSummit: true,
                raceEffects: [
                    { dial: 'heat', amount: -0.09 },
                    { dial: 'S', lab: 'halcyon', amount: 0.04 },
                ],
                resultToast: 'PROSE: coordinator — the deal advice, received.',
            },
            {
                label: 'PROSE: coordinator — say nothing',
                desc: 'PROSE: coordinator — you are in the room and you do not use it.',
                _roomVerb: 'silence',
                // No raceEffects: declining is a real option with a real absence
                // where the effect would be. The flag is the whole consequence.
                playerFlag: 'room_declined',   // == ROOM_FLAGS.declined
                resultToast: 'PROSE: coordinator — the silence, noted.',
            },
        ],
    },
];

// ---- Pure gate + voice helpers (harness-gated; main.js calls these) --------

/**
 * Voice weight = the number of satisfied criteria. `criteria` is the six-boolean
 * array main.js builds (credibility gate, safetyNetworkTrust, labRelations,
 * firm-conversion latch, briefed/restraint advice flags, treasury backchannel).
 * Pure.
 */
export function roomVoice(criteria) {
    if (!Array.isArray(criteria)) return 0;
    let n = 0;
    for (const c of criteria) if (c) n++;
    return n;
}

/** Seat predicate: >= ROOM_MIN_CRITERIA satisfied. Pure. */
export function roomInvited(voice) {
    return voice >= ROOM_MIN_CRITERIA;
}

// ---- Per-leader presentation (deterministic rotation, never RNG) ----------
// Per-(shell, side, field) fire counters, mirroring race-bridge.js's
// `headlinesByAttribution` rotation exactly: even rotation, no repeat-in-a-row
// across consecutive firings of the same pool, and NO RNG substream draw (prose
// choice must never perturb model draws).

const _roomFireCount = new Map();

function _pickRotating(pool, key) {
    if (!Array.isArray(pool) || pool.length === 0) return undefined;
    const n = _roomFireCount.get(key) || 0;
    _roomFireCount.set(key, n + 1);
    return pool[n % pool.length];
}

/**
 * Reset the room's rotation counters (call wherever the run resets, beside
 * `resetRaceBridge`) so same-seed playback never depends on process history.
 */
export function resetRoomRotation() {
    _roomFireCount.clear();
}

/**
 * The room's presentation for ONE firing, chosen by who leads:
 *   { side, headline, context }
 * `leaderLab` comes from `roomTrigger` (race-state.js) -- never recomputed here.
 * Total by construction: an unknown/absent leader takes the home side, and each
 * side's pools are non-empty, so a fired room always has finished text. Advances
 * the rotation counters for the side it picked and no other.
 */
export function roomPresentation(leaderLab) {
    const side = roomLeaderSide(leaderLab);
    const shell = ROOM_EVENTS[0];
    return {
        side,
        headline: _pickRotating(shell.headlinesByLeader[side], `${ROOM_EVENT_ID}:${side}:headline`),
        context: _pickRotating(shell.contextsByLeader[side], `${ROOM_EVENT_ID}:${side}:context`),
    };
}

/**
 * The room's choice list for one firing: the summit-gated option filtered out when
 * the window is shut, and every raceEffect amount scaled by voice/ROOM_MAX_VOICE.
 * Deep-clones so the shared shell is never mutated across firings (the bridge's
 * `finalize` discipline). Pure; returns [] for an un-invited voice.
 */
export function roomChoices(voice, summitLive) {
    if (!roomInvited(voice)) return [];
    const scale = voice / ROOM_MAX_VOICE;
    const base = ROOM_EVENTS[0].choices;
    const out = [];
    for (const c of base) {
        if (c._roomNeedsSummit && !summitLive) continue;
        const cc = structuredClone(c);
        if (Array.isArray(cc.raceEffects)) {
            for (const eff of cc.raceEffects) eff.amount = eff.amount * scale;
        }
        out.push(cc);
    }
    return out;
}
