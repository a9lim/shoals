/* ===================================================
   src/race/control-regime.js -- The controlRegime ratchet
   evaluator (overhaul phase 5a): the state's grip on the
   frontier tightening private -> supervised -> mobilized ->
   nationalized/classified, driven by detected incidents,
   heat, elections, and lobbying (02-race-model.md).

   DESIGN BOUNDARY. This module is the pure THRESHOLD LOGIC
   only: `desiredRegime(race, heatNow, exo)` reads race +
   heat + exogenous signals and returns the TARGET regime
   string. It performs NO side effects and calls NO writer.
   The sole writer stays `setControlRegime` in race-state.js
   (which owns the Consensus / compute-market freeze
   consequences and the monotonicity guard). The evaluator is
   NOT invoked by advanceRace -- it is driven by the SEPARATE
   orchestrated step `stepControlRegime` (race-state.js), which
   main.js and the reachability harness call after advanceRace;
   that separation (advanceRace stays a pure ledger producer)
   is ratified in 02a's phase-5a block. `stepControlRegime`
   calls `desiredRegime` and then `setControlRegime` only on a
   forward move. The import stays one-way (race-state.js ->
   control-regime.js) with no cycle, and monotonicity is
   guaranteed structurally by the one writer, never re-derived
   here.

   REGIME_RANK / CONTROL_REGIMES live here (not race-state.js)
   so both modules share them without a cycle.

   Pure / DOM-free -- headless-importable so the reachability
   + monotonicity harness (tools/plumbing-test.mjs) drives it.

   RATIFIED (02a "Content plumbing (phase-5a ratifications,
   2026-07-23)"): the full disjunctive transition predicates in
   desiredRegime AND the CONTROL_TUNING thresholds below are the
   design (the strict conjunctive reading was rejected -- it
   drives the terminal regimes to ~0%, killing the
   nationalization trade). Tuned against the reachability
   targets (supervised common-but-not-universal, mobilized a
   strict minority, nationalization/classification rare, all
   reachable). The object stays mutable so the harness can
   sweep it (mirrors RACE_TUNING).
   =================================================== */

/** The ordered control regimes (09): the state's grip tightening. Moved here
 *  from race-state.js so control-regime.js and race-state.js share it with no
 *  import cycle. nationalized/classified are terminal peers (same rank). */
export const CONTROL_REGIMES = ['private', 'supervised', 'mobilized', 'nationalized', 'classified'];
export const REGIME_RANK = { private: 0, supervised: 1, mobilized: 2, nationalized: 3, classified: 3 };

/**
 * Phase-5a transition gates (RATIFIED, 02a phase-5a block). The regime escalates
 * when a DECAYING "grip pressure" (recent detected-incident severity, weighted;
 * theft; blockade) crosses a gate, or heat is high, or an exogenous push (lobbying
 * / election) fires. Pressure DECAYS so the ratchet responds to recent SPIKES
 * (S3/S4/persuasion clusters) rather than the ever-accumulating S0/S1 farce
 * stream -- which is what keeps mobilized+ a minority despite ~80-160 detected
 * incidents/run.
 */
export const CONTROL_TUNING = {
    // Pressure dynamics.
    pressureDecay: 0.97,     // per-day geometric decay (half-life ~23 trading days)
    // Per-detected-incident pressure increments by severity (persuasion separate).
    // Heavily weighted toward high severity so the farce wing barely moves the grip.
    sevWeight: [0.10, 0.20, 0.80, 4.0, 15.0],   // S0..S4
    persuasionWeight: 2.5,   // a detected persuasion-class campaign
    theftWeight: 2.0,        // a successful exfiltration (guards-vs-GPUs politics)
    blockadeWeight: 4.0,     // a strait blockade starting

    // Supervised gate (private -> supervised): the czar announces supervision.
    // Tuned (phase 5a, N=2500): supervised reached ~85% of runs, `private` stays
    // a live outcome in ~15%.
    supPressure: 7.0,
    supHeat: 0.45,

    // Mobilized gate (-> mobilized): the government takes the wheel; freezes
    // Consensus. Tuned so mobilized is a STRICT MINORITY (~16% reached) -- the
    // knife-edge constraint that no ratchet's harder state is the attractor of
    // most runs.
    mobPressure: 12.0,
    mobHeat: 0.60,           // heat threshold that, WITH a blockade or theft, mobilizes

    // Nationalization / classification gate (from mobilized -> terminal). Rare,
    // both reachable (tuned: nationalized ~1.6%, classified ~0.9% of runs).
    natPressure: 22.0,
    natHeat: 0.55,
    persuasionClassifyCount: 2,   // detected persuasion campaigns that tip toward CLASSIFIED
};

/**
 * Decay + accrue the control-signal "grip pressure" for one completed day from
 * the transition ledger, and latch the qualitative flags. Mutates
 * `race.controlSignals` in place. Pure of RNG (so it cannot perturb any race
 * substream -- the reachability harness relies on this). Call from advanceRace
 * AFTER the incident/strait steps, so the ledger is populated.
 *
 * @param {object} race  race state (createRaceState)
 * @param {object} tr    this tick's lastTransitions ledger
 */
export function stepControlSignals(race, tr) {
    const sig = race.controlSignals;
    const T = CONTROL_TUNING;
    sig.pressure *= T.pressureDecay;

    for (const det of (tr.incidents ? tr.incidents.detected : [])) {
        if (det.cls === 'persuasion') { sig.pressure += T.persuasionWeight; sig.persuasionSeen++; }
        else sig.pressure += T.sevWeight[det.severity] ?? 0;
        if (det.severity >= 3) sig.s3Count++;
        if (det.severity >= 4) sig.s4Seen = true;
    }
    for (const th of (tr.thefts || [])) {
        if (th.success) sig.pressure += T.theftWeight;
    }
    if (tr.strait && tr.strait.blockadeStart) sig.pressure += T.blockadeWeight;
}

/**
 * The target control regime given current race + heat + exogenous signals. Never
 * moves backward (returns at most a forward regime; the caller's setControlRegime
 * enforces monotonicity structurally regardless). A severe shock (S4) can jump
 * private -> mobilized in one call; the terminal step (nationalized/classified)
 * requires the run to ALREADY be mobilized (read off `race.controlRegime`, not
 * the in-call target), which spreads the terminal regimes out and keeps them rare.
 *
 * `exo` (all optional, default absent) carries the lobbying / election nudges the
 * content layer feeds: { supervisionPush, evalsPush, mobilizationPush,
 * nationalizationPush, classificationPush, hawkishElection }. Headless (harness /
 * Classic) passes none, so reachability is driven purely by endogenous signals.
 *
 * @param {object} race     race state
 * @param {number} heatNow  heatValue(race.heat) (passed in to avoid a race-state import cycle)
 * @param {object} [exo]    exogenous push signals
 * @returns {string} the target regime (>= current)
 */
export function desiredRegime(race, heatNow, exo = {}) {
    const T = CONTROL_TUNING;
    const sig = race.controlSignals;
    const curRank = REGIME_RANK[race.controlRegime] ?? 0;
    let target = race.controlRegime;

    // private -> supervised. Driven by recent grip pressure or heat (an isolated
    // S3 alone does NOT force it -- pressure captures clustering, which keeps
    // `private` a live outcome in quiet worlds).
    if (REGIME_RANK[target] < 1) {
        if (sig.pressure >= T.supPressure || heatNow >= T.supHeat
            || exo.supervisionPush || exo.evalsPush) {
            target = 'supervised';
        }
    }
    // -> mobilized (may jump from private on a severe shock)
    if (REGIME_RANK[target] < 2) {
        if (sig.pressure >= T.mobPressure
            || sig.s4Seen
            || (race.mobilizationGateOpen && (heatNow >= T.mobHeat || sig.pressure >= T.supPressure))
            || (race.theftCount >= 1 && heatNow >= T.mobHeat)
            || exo.mobilizationPush) {
            target = 'mobilized';
        }
    }
    // -> nationalized / classified (terminal peers). REQUIRES already-mobilized
    // (curRank, not the in-call target): the panic button follows mobilization,
    // never leapfrogs it. Physical/theft crisis -> nationalized; information/
    // persuasion crisis -> classified.
    if (curRank >= 2 && REGIME_RANK[target] < 3) {
        const severe = sig.pressure >= T.natPressure && heatNow >= T.natHeat;
        if (exo.nationalizationPush || (sig.s4Seen && race.theftCount >= 1)) {
            target = 'nationalized';
        } else if (exo.classificationPush || (sig.persuasionSeen >= T.persuasionClassifyCount && heatNow >= T.natHeat)) {
            target = 'classified';
        } else if (severe) {
            // Ambiguous severe crisis: theft-flavored -> nationalized, else classified.
            target = race.theftCount >= 1 ? 'nationalized' : 'classified';
        }
    }
    return target;
}

/** Fresh control-signal accumulator (called from resetRaceState). `lastConsumedDay`
 *  is the idempotency stamp -- stepControlRegime consumes a given race day's ledger
 *  at most once (F5), so replaying the same tick cannot double-walk the ratchet. */
export function freshControlSignals() {
    return { pressure: 0, s3Count: 0, s4Seen: false, persuasionSeen: 0, lastConsumedDay: -1 };
}
