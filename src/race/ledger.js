/* ===================================================
   src/race/ledger.js -- The complicity ledger (overhaul
   phase 6, endings round 2): what the player's capital DID.

   05's complicity accounting. An append-only record of the
   player's attributable contributions to the five dials --
   `{day, channel: C|S|heat|B|F|treaty, source, amount, note}`
   -- surfaced fully only at the end (P6-3's epilogue). Two
   binding principles from the brief:

   - CHANNELS, NOT FILLS (03): an ordinary secondary fill
     moves nothing and is NEVER a ledger row. Only the three
     real channels write: primary/choice raceEffects (S/heat),
     governance/advice acts (F, treaty), and the integrated
     cost-of-capital coupling (C). Enumerated-but-unfed
     channels (B until the evidence round; fund-as-actor
     until P7) stay SILENT -- declared seams, never padded.
   - NO ZERO-EFFECT ROWS: appendLedger drops a zero amount.
     The harness reconstructs every total from the entries
     alone (the beliefCauses pattern), so a padded row would
     corrupt the audit.

   `freezeLedger()` is called at the checkResolution latch
   (resolution.js) BEFORE any terminal marking (09): the
   complicity record is sealed at the moment the world
   resolves, so nothing the closeout does can rewrite it.

   Also hosts `applyRaceEffects` -- the whitelisted, clamped,
   ledgered route by which event-choice `raceEffects` reach
   the race dials (the ONLY sanctioned choice->race mutation).
   DOM-free; singleton mirroring belief / consensus.
   =================================================== */

import { RETUNE } from './race-state.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Whitelisted raceEffects dials (S per lab, heat). B/F/treaty are ledgered by
// their own act paths, not by raceEffects.
const RACE_EFFECT_DIALS = new Set(['S', 'heat']);
// Per-effect clamp so a single choice can never swing a dial wildly.
const RACE_EFFECT_MAX = 0.15;

export const ledger = { entries: [], frozen: false, active: false };

/** In-place reset (singleton-reset convention; Dynamic-mode init/reset). */
export function resetLedger() { ledger.entries = []; ledger.frozen = false; ledger.active = true; }

/** Classic / no-race: ledger inert. */
export function deactivateLedger() { ledger.entries = []; ledger.frozen = false; ledger.active = false; }

/** Seal the ledger at the resolution latch (09) -- before terminal marking. After
 *  this, appendLedger is a no-op; the complicity record is final. */
export function freezeLedger() { ledger.frozen = true; }

/**
 * THE player->race mutation gate (02a P6-2 ruling 2), exported so every player
 * channel shares ONE predicate rather than re-deriving it. False in Classic /
 * no-race (inactive) and after the terminal latch (frozen): a player act past
 * either boundary does nothing MECHANICAL -- narrative still fires, by design.
 * `applyRaceEffects` gates on this, and so does the insider channel's leak verb
 * (the evidence machinery round's `raceLeak`), so a leak after the latch is inert
 * for exactly the same reason a raceEffects choice is.
 */
export function raceChannelsLive() { return ledger.active && !ledger.frozen; }

/**
 * Append one attributable channel entry. Drops a zero amount (no zero-effect rows)
 * and a frozen/ inactive ledger. Returns the entry, or null if dropped.
 */
export function appendLedger(day, channel, source, amount, note = '') {
    if (!ledger.active || ledger.frozen || !amount) return null;
    const entry = { day, channel, source, amount, note };
    ledger.entries.push(entry);
    return entry;
}

/** Reconstruct per-channel totals from the entries ALONE (the audit basis). */
export function ledgerTotals() {
    const totals = {};
    for (const e of ledger.entries) totals[e.channel] = (totals[e.channel] || 0) + e.amount;
    return totals;
}

/** All entries for a channel (read-only). */
export function ledgerEntries(channel) {
    return channel ? ledger.entries.filter(e => e.channel === channel) : ledger.entries.slice();
}

/**
 * C-channel translation to the epilogue's "compute-hours financed / release-days
 * pulled forward" equivalents. `cAmount` is rung-units of player-attributable dC to
 * Halcyon (the coupling-integrated total). PLACEHOLDER linear map -- the P6-3 prose
 * round sets the final coefficients; the shape (a positive C total reads as
 * acceleration financed, a negative one as a brake bought) is what matters here.
 */
export function ledgerComputeEquiv(cAmount) {
    return {
        releaseDaysPulledForward: cAmount / 0.001,   // dC / a typical daily base drift (rough)
        computeDoublings: cAmount,                   // rung-units ~ frontier doublings (rough)
    };
}

/**
 * Apply a choice's declarative `raceEffects` to the race dials -- the ONE sanctioned
 * choice->race mutation route. Each effect is `{dial:'S'|'heat', lab?, amount}`.
 * Whitelisted dials only; amount clamped to +-RACE_EFFECT_MAX; the resulting dial
 * value clamped to its bounds (S floors at the Tianxia purchased base / 0 for the
 * American labs -- the P6-1b leg-C floor; the taper then scales its burn). Every
 * applied delta is tracked on race.playerS (S) for the d_P decomposition and
 * ledgered under the event `source`. Returns the applied deltas.
 *
 * @param {object} race     race state
 * @param {Array}  effects  raceEffects array from the chosen option
 * @param {string} source   event id (ledger attribution)
 * @param {number} day      current day
 */
export function applyRaceEffects(race, effects, source, day) {
    if (!race || !Array.isArray(effects)) return [];
    // Freeze is a MUTATION gate, not merely an append gate (02a P6-2 ruling 2):
    // post-resolution (frozen) and in Classic / no-race (inactive), player channels
    // are INERT -- check BEFORE touching any dial. Mutating S/heat/playerS and only
    // then dropping the row would leave a race mutation with no ledger record, which
    // is exactly the corruption 09's freeze exists to prevent. Full no-op here.
    if (!raceChannelsLive()) return [];
    const applied = [];
    for (const eff of effects) {
        if (!eff || !RACE_EFFECT_DIALS.has(eff.dial)) continue;
        const amount = clamp(eff.amount || 0, -RACE_EFFECT_MAX, RACE_EFFECT_MAX);
        if (!amount) continue;
        if (eff.dial === 'S') {
            const lab = eff.lab;
            if (race.safety[lab] == null) continue;   // unspawned Polaris / unknown lab
            const floor = (lab === 'tianxia') ? RETUNE.S0_tianxia : 0;
            const before = race.safety[lab];
            race.safety[lab] = clamp(before + amount, floor, 1);
            const delta = race.safety[lab] - before;   // the ACTUAL applied delta (post-clamp)
            if (delta) {
                race.playerS[lab] += delta;             // d_P S-channel (per lab)
                appendLedger(day, 'S', source, delta, `S[${lab}]`);
                applied.push({ dial: 'S', lab, amount: delta });
            }
        } else if (eff.dial === 'heat') {
            const before = race.heat.transient;
            race.heat.transient = clamp(before + amount, 0, 1);
            const delta = race.heat.transient - before;
            if (delta) {
                appendLedger(day, 'heat', source, delta, 'heat.transient');
                applied.push({ dial: 'heat', amount: delta });
            }
        }
    }
    return applied;
}
