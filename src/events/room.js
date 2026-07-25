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

   All prose is coordinator-written (2026-07-24 prose round).
   This is the game's climax; the coordinator writes every word.
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
                'The final scaling review',
                'A car comes at six',
            ],
            rival: [
                'The intelligence is credible',
                'Not our decision to make. Except it is.',
            ],
        },
        contextsByLeader: {
            home: [
                'The room is smaller than the thing it decides. Upstairs — three floors, a badge reader, a hallway with the lights on motion sensors — a training run is holding at the edge of the last threshold anyone bothered to name. Dirks has the head of the table. There is a man from the NSC who does not give a title, a lawyer who has not spoken, a speakerphone with Treasury on it. And there is you, because enough of the right people learned to take the desk’s read seriously, one at a time, for reasons you could list. Nobody in this room can see the whole model. Everyone has a number they trust. The question is whether the lead gets spent or banked, and yours is one voice among several — which is more voice than the market gets, and less than you are about to want.',
                'There is no agenda. There is a printed sheet turned face-down at each chair, and Dirks, who has already read it, watching people decide whether to turn it over. The run upstairs is close — close enough that the word “pause” has stopped being a policy position and become a number somebody would have to own. You recognize most of the faces — from hearings, from launch events, from the news; the ones you don’t recognize are the ones who decide things. When your turn comes it will come without ceremony: Meridian sees the whole tape — what does the tape think? You have been answering that question with money the whole way here. This is the last room that will ask it.',
            ],
            rival: [
                'The briefing is short because the margin is short. The intelligence people believe Beijing is close — close enough that this meeting exists, close enough that nobody performs skepticism about the sourcing. Dirks looks like she has not slept. The man from the NSC gives his title freely now, which is worse. The options have been narrowed to the ones that can be said aloud, and everyone at the table has already counted them. Nobody uses the word “first” out loud. You are here because enough of the right people learned to take the desk’s read seriously — and because when the question is what a rival does with a lead, someone who prices other people’s intentions for a living is suddenly load-bearing. One voice among several. The world is not waiting for the minutes.',
                'You always assumed the panic room would be louder. Instead: coffee nobody drinks, a map nobody needs, and a sentence being passed around the table like a stone — they may get there before we do. Halcyon’s number is what it is; theirs, the briefers believe, is closer. Every option left is a trade someone in this room spent years calling unthinkable, and the person who has to say so out loud keeps not being anyone. Then the chair turns to you — the desk that priced this race while Washington was still calling it a product cycle — and asks what the market would do. The market is not in the room. You are.',
            ],
        },
        params: {},              // the room is not a market event: no deltas, no impulse
        choices: [
            {
                label: 'Advise speed',
                desc: 'Tell the room to go. Whatever margin is worth, second is worth less.',
                _roomVerb: 'speed',
                // Full-voice magnitude (02a): S[halcyon] -0.12. Scaled by
                // voice/ROOM_MAX_VOICE in roomChoices before it is ever fired.
                raceEffects: [{ dial: 'S', lab: 'halcyon', amount: -0.12 }],
                resultToast: 'You advised speed. The room heard you.',
            },
            {
                label: 'Advise margin',
                desc: 'Tell the room to hold the line on the checks. Arriving first matters less than arriving intact.',
                _roomVerb: 'margin',
                raceEffects: [{ dial: 'S', lab: 'halcyon', amount: 0.12 }],
                resultToast: 'You advised margin. The room heard you.',
            },
            {
                label: 'Advise the deal',
                desc: 'Tell the room to take the deal while there is a deal to take.',
                _roomVerb: 'deal',
                // Present ONLY while the summit window is live (02a); roomChoices
                // filters on this at fire time.
                _roomNeedsSummit: true,
                raceEffects: [
                    { dial: 'heat', amount: -0.09 },
                    { dial: 'S', lab: 'halcyon', amount: 0.04 },
                ],
                resultToast: 'You advised the deal. The room heard you.',
            },
            {
                label: 'Say nothing',
                desc: 'You bought the seat. Nothing says you must spend the voice.',
                _roomVerb: 'silence',
                // No raceEffects: declining is a real option with a real absence
                // where the effect would be. The flag is the whole consequence.
                playerFlag: 'room_declined',   // == ROOM_FLAGS.declined
                resultToast: 'You said nothing. It is in the minutes that you were there.',
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
