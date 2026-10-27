/* ===================================================
   src/race/rounds.js -- Private rounds and primary capital
   (02a "Private rounds and primary offerings", 2026-10-24).

   Polaris has a public round mark, not a price process.
   Its schedule observes the walkout ledger and draws from
   a NEW `rounds` substream outside race.streams. Prices
   consume only public claimed rungs and the passed-in Pi
   from B. No participant means no change to the race.

   Halcyon's primary allocations supply a dated input to
   the existing bounded cost-of-capital channel. Financial
   fills, effects, dispatches and ledger attribution remain
   at their canonical portfolio/orchestrator chokepoints.
   Pure helpers plus a run-scoped singleton; DOM-free.
   =================================================== */

import { createRng, deriveSeed } from './rng.js';
import { buildPublicView } from './consensus.js';
import { raceChannelsLive } from './ledger.js';

// 02a "Private rounds and primary offerings". Mutable for headless sweeps.
export const ROUNDS_TUNING = {
    foundingDelay: 21,
    foundingPrice: 1.00,
    spacing: 126,
    spacingJitter: 21,
    rungWeight: 0.8,
    piWeight: 1.0,
    carry: 0.15,
    ratioMin: 0.5,
    ratioMax: 3.0,
    polarisEquityFraction: 0.20,
    polarisAllocationCap: 2000,
    halcyonEquityFraction: 0.15,
    halcyonAllocationCap: 1500,
    polarisSafety: 0.04,
    halcyonDilution: 0.98,
    halcyonDiscount: 0.97,
    primaryScale: 3,
    primaryWindow: 126,
    terminalWon: 6,
    terminalDawn: 3,
    terminalOtherWest: 1,
    terminalDeal: 1.5,
    terminalFizzle: 0.3,
    terminalChina: 0.1,
    terminalDoom: 0,
    terminalConversion: 0.5,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
let _active = false, _seed = null, _spawnDay = null, _schedule = null, _roundIndex = 0;
let _last = null, _lastPi = null, _series = 0;
const _primary = new Map();

/**
 * Polaris's NOMINAL round schedule (02a "Demonstrations"): the founding round
 * `foundingDelay` days after the public spawn day, then each next round
 * `spacing` ± `spacingJitter` days after the last, drawn in order from the
 * `rounds` substream. One function of the seed and the spawn day, kept apart
 * from whether a round executes: stepRounds opens rounds on these days, and the
 * demonstration hazard's funding window reads them, so headless worlds see the
 * windows play does. Returns every scheduled day up to `throughDay` and the
 * first one past it. The draws come in order, so a longer schedule extends a
 * shorter one and never changes its prefix.
 */
export function polarisRoundDays(seed, spawnDay, throughDay) {
    const T = ROUNDS_TUNING;
    const rng = createRng(deriveSeed(seed, 'rounds'));
    const days = [spawnDay + T.foundingDelay];
    while (days[days.length - 1] <= throughDay) {
        days.push(days[days.length - 1] + T.spacing + rng.int(2 * T.spacingJitter + 1) - T.spacingJitter);
    }
    return days;
}

/** Clear all marks, clocks and primary commitments, including in Classic. */
export function resetRounds() {
    _active = false; _seed = null; _spawnDay = null; _schedule = null; _roundIndex = 0;
    _last = null; _lastPi = null; _series = 0;
    _primary.clear();
}

/** Initialize at race creation; this never attaches state or RNG to the race. */
export function initRounds(race) {
    resetRounds();
    if (!race) return;
    _active = true;
    _seed = race.seed;
}

/** The public price-ratio rule; inputs are changes since the previous round. */
export function roundPriceRatio(rungGain, piGain) {
    const T = ROUNDS_TUNING;
    return clamp(Math.exp(T.rungWeight * rungGain + T.piWeight * piGain - T.carry), T.ratioMin, T.ratioMax);
}

function seriesLetter(index) {
    let out = '';
    for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out;
    return out;
}

/** Observe one completed day and return any newly opened public round. Pi is
 *  the valuation layer's unconditional B probability; never terminal truth. */
export function stepRounds(race, pi) {
    if (!_active || !race || race.resolution) return [];
    const view = buildPublicView(race);
    if (_spawnDay == null && (race.lastTransitions?.spawned || []).includes('polaris')) {
        _spawnDay = view.day;
        _schedule = polarisRoundDays(_seed, _spawnDay, _spawnDay);
    }
    // Active status is the public walkout, not capability. Below-ladder Polaris
    // still holds its founding round; a zero claimed rung is a valid public price input.
    if (_schedule == null || view.day < _schedule[_roundIndex] || !race.capability.labs.polaris.active) return [];
    const claimedRung = view.claimedRung.polaris;
    const founding = !_last;
    const previousPrice = _last ? _last.price : ROUNDS_TUNING.foundingPrice;
    const rungGain = founding ? 0 : claimedRung - _last.claimedRung;
    const ratio = founding ? 1 : roundPriceRatio(rungGain, pi - _lastPi);
    const round = Object.freeze({
        kind: 'polaris',
        id: founding ? 'polaris_founding' : `polaris_series_${seriesLetter(++_series).toLowerCase()}`,
        day: view.day,
        price: previousPrice * ratio,
        previousPrice, ratio, claimedRung, rungGain,
        letter: founding ? null : seriesLetter(_series),
        founding,
    });
    _last = round; _lastPi = pi;
    // The next nominal day; extend the schedule when the run outlives it.
    if (++_roundIndex >= _schedule.length) _schedule = polarisRoundDays(_seed, _spawnDay, view.day);
    return [round];
}

/** Public last-round mark; null before founding and in Classic. */
export function lastPolarisRound() { return _last; }

/** Meridian's offered cap, in the portfolio's internal k-dollar scale. */
export function roundAllocation(kind, equity) {
    if (!Number.isFinite(equity) || equity <= 0) return 0;
    const T = ROUNDS_TUNING;
    if (kind === 'polaris') return Math.min(T.polarisEquityFraction * equity, T.polarisAllocationCap);
    if (kind === 'halcyon') return Math.min(T.halcyonEquityFraction * equity, T.halcyonAllocationCap);
    return 0;
}

/** Post-dilution, post-valuation spot is supplied by the day-close owner. */
export function halcyonOfferPrice(postGapSpot) {
    return postGapSpot * ROUNDS_TUNING.halcyonDiscount;
}

/** Record actual cash deployed, once per offering. The portfolio caps the fill
 *  before this call; the effect is gated on the same live channel as raceEffects. */
export function recordPrimaryAllocation(id, day, allocation, equity) {
    if (!_active || !raceChannelsLive() || _primary.has(id)
        || !Number.isFinite(allocation) || allocation <= 0 || !Number.isFinite(equity) || equity <= 0) return null;
    const entry = Object.freeze({ id, day, input: Math.min(1, ROUNDS_TUNING.primaryScale * allocation / equity) });
    _primary.set(id, entry);
    return entry;
}

/** Capital is deployed for the 126 days AFTER the offering: d+1 through d+126.
 *  Per-offering inputs are preserved for exact C-channel source attribution;
 *  the existing coupling channel clamps their combined input/output. */
export function primaryInputs(day) {
    if (!_active || !raceChannelsLive()) return [];
    const result = [];
    for (const entry of _primary.values()) {
        if (day > entry.day && day <= entry.day + ROUNDS_TUNING.primaryWindow) result.push({ id: entry.id, input: entry.input });
    }
    return result;
}

/** Cell 10: the terminal record may reveal Polaris's leadership only now. */
export function privateTerminalMultiple(resolution, regime) {
    const T = ROUNDS_TUNING;
    if (regime === 'nationalized' || regime === 'classified') return T.terminalConversion;
    switch (resolution.family) {
        case 1: return resolution.leader === 'polaris' ? T.terminalWon : T.terminalOtherWest;
        case 2: return resolution.leader === 'polaris' ? T.terminalDawn : T.terminalOtherWest;
        case 5: return T.terminalDeal;
        case 6: return T.terminalFizzle;
        case 4: return T.terminalChina;
        case 3: return T.terminalDoom;
        default: return 0;
    }
}
