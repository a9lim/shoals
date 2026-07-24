/* ===================================================
   src/race/treaty-track.js -- The Reykjavik Framework
   treaty gauntlet, race-side (overhaul phase 6, endings
   round 1 + fix round). The HIDDEN truth under treaty.js's
   public farce texture: whether the gauntlet survives to a
   live window, and -- SECRETLY -- whether Beijing would ever
   deal.

   04's treaty arc + 02a's sub-gates. Verification talks
   surface, initiate, survive (or die of) a farce gauntlet,
   and reach one live Act-III window whose success is gated
   on nobody having a bad incident during summit week. The
   Deal is the rarest ending (02a: ~4% overall).

   LEAK-FREE BY CONSTRUCTION (02a phase-6 ruling): window
   OPENING is INDEPENDENT of hidden.chinaTrue.dealPossible.
   Non-deal worlds traverse the SAME viability-blind gauntlet
   pacing and open doomed windows at the same rate; dealPossible
   gates ONLY the holds outcome AFTER a clean summit week, never
   the opening. So P(dealPossible | window) = the 0.15 prior --
   the summit convening is never a tell (04/09's information
   boundary). At most ONE summit window per run.

   Module boundary: DOM-free, headless-importable for the
   endings MC harness. Draws ONLY from `race.streams.treaty`,
   TWO uniforms per day UNCONDITIONALLY (branch-independent draw
   count, the strait.js pattern) -- uTime paces, uGate resolves
   the current gate -- so the treaty stream never desyncs under
   extension and no OTHER stream is touched. It has NO race-level
   side effects beyond `race.treaty` (and stamping the window-open
   transition on the ledger for the bridge): never capability,
   heat, safety, theft, incidents, or the strait -- an implemented
   treaty is TERMINAL (the Deal ends the race). This makes the
   treaty substream-isolation probe hold: all NON-treaty streams
   are bit-identical treaty-on vs -off.

   Self-drives WITHOUT the event engine (the MC has none):
   day-based hazards carry the gauntlet. The public `treatyStage`
   (advanced in-game by treaty.js's talks-farce / groundwork
   events) is a PACING accelerator only -- it can open talks
   earlier, never bypass a gate.
   =================================================== */

// ---- Stage enum ----------------------------------------------------------
export const TREATY_STAGE = {
    DORMANT: 0,       // no talks yet
    INITIATING: 1,    // talks began; gate 1 drawn
    FARCE: 2,         // gate 2 drawn; the farce gauntlet runs
    PRE_WINDOW: 3,    // gauntlet survived, waiting for the Act-III window band
    WINDOW_OPEN: 4,   // summit week; the incident gate decides
    RESOLVED: 5,      // implemented (Deal) or failed -- terminal
};

// ---- Gate probabilities (02a treaty sub-gates -- VERBATIM) ---------------
// "discovery 0.65 · initiation 0.85 · farce-gauntlet survival 0.65 ·
//  summit-week-no-incident 0.75 ~= 0.27 completion given eligible" -> Deal
// ~= 4%. The first three are Bernoulli gates drawn for ALL runs (viability-
// blind); summit-week-no-incident is REAL-INCIDENT-DRIVEN. Named constants for
// P7 to modulate (the room's leverage on gate odds).
export const P_DISCOVER = 0.65;
export const P_INITIATE = 0.85;
export const P_FARCE = 0.65;

// ---- Timing hazards (self-drive; the Deal RATE is gate-product-invariant to
// these -- they only set WHEN the gauntlet traverses, and the +2520 extrapolation
// cap leaves ample room for completion) ------------------------------------
const TALKS_MIN_DAY = 120;    // talks can begin from the mid-run (or earlier via public groundwork)
const TALKS_HAZARD = 1 / 150; // per-day hazard once eligible (mean talks-start ~day 270; clears the gauntlet before R5)
const INIT_HAZARD = 1 / 40;   // initiation resolves ~40d after talks begin
const FARCE_HAZARD = 1 / 60;  // farce resolves over ~60d (02a "farce resolution over ~60d")
const WINDOW_MIN_DAY = 700;   // the window is the late-run band (~R3/Act III)

// ---- Summit-week incident gate (02a target ~0.75 pass) -------------------
// The window stays open SUMMIT_WINDOW trading days ("summit week"); the attempt
// fails if a detected incident at/above SUMMIT_INCIDENT_SEVERITY fires while it
// is open. SUMMIT_WINDOW is tuned so the measured pass rate lands ~0.75 (02a is
// the calibration target for this gate, not a Bernoulli). Reads the detection
// ledger, never state-diffs, draws NOTHING from streams.treaty.
const SUMMIT_WINDOW = 8;   // measured pass ~0.75 at the day-700 window band (incident-driven, not a draw)
const SUMMIT_INCIDENT_SEVERITY = 2;   // "a bad incident" = alarming (exfiltration-class) or worse

/** Stamp the window-outcome transition on the ledger for the bridge (race-model
 *  decision -> ledger-fired). Only the WINDOW outcome stamps -- a pre-window
 *  gauntlet collapse (never opened a window) fires nothing. */
function _stampOutcome(race, implemented) {
    if (race.lastTransitions) race.lastTransitions.treatyOutcome = { implemented };
}

/**
 * Advance the treaty gauntlet one completed day. Called once per day by the
 * orchestrator (main.js) and by the resolution extrapolation loop, AFTER
 * advanceRace (so `race.lastTransitions` holds this tick's detection ledger for
 * the summit gate, and the window-open transition can be stamped on it). No-op
 * once resolved, or when the MC toggle is off.
 *
 * @param {object} race     race state (post-advanceRace)
 * @param {object} [inputs] { treatyStage? } -- public stage from treaty.js events
 *                          (0 headless); a PACING accelerator only, never a gate bypass
 * @returns {object|null} race.treaty (for convenience), or null if disabled/terminal
 */
export function stepTreaty(race, inputs = {}) {
    if (race.treatyEnabled === false) return null;
    const t = race.treaty;
    if (t.stage >= TREATY_STAGE.RESOLVED) return null;

    const rng = race.streams.treaty;
    const day = race.day;
    const dealPossible = race.hidden.chinaTrue.dealPossible;
    const publicStage = inputs.treatyStage || 0;

    // TWO uniforms per day, drawn UNCONDITIONALLY (branch-independent count --
    // strait.js pattern): uTime paces the gauntlet, uGate resolves whichever gate
    // is current. Drawn every day regardless of stage so the treaty stream never
    // desyncs under extension.
    const uTime = rng.next();
    const uGate = rng.next();

    switch (t.stage) {
        case TREATY_STAGE.DORMANT: {
            // Talks begin from the mid-run, or earlier if player-lobbied groundwork
            // fired (public treatyStage >= 1). VIABILITY-BLIND: gate 1 is drawn for
            // ALL runs, so windows open at the same rate whether or not a deal is
            // secretly possible (no leak of dealPossible).
            const eligible = day >= TALKS_MIN_DAY || publicStage >= 1;
            if (eligible && uTime < TALKS_HAZARD) {
                t.talksOpened = uGate < P_DISCOVER;      // gate 1 (viability-blind)
                t.talksBeganDay = day;
                t.stage = TREATY_STAGE.INITIATING;
            }
            break;
        }
        case TREATY_STAGE.INITIATING: {
            if (uTime < INIT_HAZARD) {
                t.initiated = t.talksOpened && (uGate < P_INITIATE);   // gate 2
                t.stage = TREATY_STAGE.FARCE;
            }
            break;
        }
        case TREATY_STAGE.FARCE: {
            if (uTime < FARCE_HAZARD) {
                t.farceSurvived = t.initiated && (uGate < P_FARCE);    // gate 3
                if (t.farceSurvived) {
                    t.stage = TREATY_STAGE.PRE_WINDOW;
                } else {
                    t.failed = true;                                   // gauntlet collapsed pre-window
                    t.stage = TREATY_STAGE.RESOLVED;
                }
            }
            break;
        }
        case TREATY_STAGE.PRE_WINDOW: {
            // One live negotiation, in the Act-III band. A run that cleared the
            // gauntlet early waits for the band; one that cleared it late (or in
            // extrapolation) opens immediately.
            if (day >= WINDOW_MIN_DAY) {
                t.stage = TREATY_STAGE.WINDOW_OPEN;
                t.windowOpened = true;
                t.summitOpen = true;
                t.summitDay = day;
                t.windowEndDay = day + SUMMIT_WINDOW;
                // Stamp the window-open transition on the ledger so race-bridge.js
                // fires treaty_window: the window is a race-model DECISION, and
                // model decisions fire from the ledger, never Poisson (02a phase-6).
                if (race.lastTransitions) race.lastTransitions.treatyWindowOpen = { day };
            }
            break;
        }
        case TREATY_STAGE.WINDOW_OPEN: {
            // Summit-week-no-incident (02a ~0.75): fails on a detected incident
            // at/above the severity threshold while the window is open.
            const detected = (race.lastTransitions && race.lastTransitions.incidents)
                ? race.lastTransitions.incidents.detected : [];
            const badIncident = detected.some(d => (d.severity ?? 0) >= SUMMIT_INCIDENT_SEVERITY);
            if (badIncident) {
                t.summitOpen = false;
                t.failed = true;
                t.stage = TREATY_STAGE.RESOLVED;
                _stampOutcome(race, false);   // window-failure -> bridge fires treaty_resolution
            } else if (day >= t.windowEndDay) {
                // Summit week survived clean. dealPossible gates ONLY the holds
                // outcome here (never the opening): a viable world signs; a non-deal
                // world's summit succeeds procedurally but was never viable (doomed).
                t.summitOpen = false;
                t.summitPassed = true;
                if (dealPossible) t.implemented = true;   // the Deal -- TERMINAL (resolution family 5)
                else t.failed = true;                     // doomed window (secretly unviable)
                t.stage = TREATY_STAGE.RESOLVED;
                // The window OUTCOME is a race-model decision, so the model fires the
                // news of it (02a re-gate ruling, one level below the window itself):
                // treaty_holds on the Deal, treaty_resolution on the failure/doom.
                _stampOutcome(race, t.implemented);
            }
            break;
        }
    }
    return t;
}
