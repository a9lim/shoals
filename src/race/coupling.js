/* ===================================================
   src/race/coupling.js -- The player cost-of-capital channel
   (overhaul phase 6, endings round 2).

   03's transmission honesty made mechanical: an ordinary
   secondary fill moves NOTHING. The race feels the player's
   capital only through a bounded, LAGGED cost-of-capital
   channel driven by PERSISTENT aggregate valuation -- heavy,
   sustained HCN positioning (long OR short) shifts Halcyon's
   cost of capital, and thus its velocity, at the margin. One
   fill finances nothing; a quarter of conviction is a
   thumb on the scale.

   Mechanically: an EMA (halflife ~50 trading days) of the
   player's net persistent HCN positioning (signed, normalized
   to [-1, +1]; long positive, short negative), computed
   main.js-side from the impact-overlay cumulative state + net
   book and passed in. Output: a bounded fractional multiplier
   on Halcyon capability velocity, hard-clipped both signs
   (long -> marginal acceleration; sustained short -> marginal
   slowdown, 03's stance table). The multiplier enters race
   dynamics ONLY as the orchestrator-passed `playerCoupling`
   input to advanceRace (the straitTension precedent), which
   routes it through the single deterministicDrift source --
   never a mutation export here.

   Headless MC passes no positioning -> ema stays 0 -> the
   multiplier is 0 -> the P6-1 world-side calibration stands
   bit-identical (harness-probed).

   Singleton mirroring belief / consensus. DOM-free.
   =================================================== */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Channel tuning (propose; swept to knife-edge constraint 2 -- the max reachable
 * |d_P| the coupling's integrated C-effect can produce must, with the S channel,
 * catch >= 40% of runs' |d_W|). Exported mutable so the sweep can drive it.
 *   halflife : EMA halflife in trading days (only SUSTAINED positioning bites).
 *   cap      : hard clip on the velocity multiplier, both signs (|mult| <= cap).
 */
export const COUPLING_TUNING = { halflife: 50, cap: 0.05 };

export const coupling = { ema: 0, active: false };
const _primaryEma = new Map();

/** In-place reset (singleton-reset convention; Dynamic-mode init/reset). */
export function resetCoupling() { coupling.ema = 0; coupling.active = true; _primaryEma.clear(); }

/** Classic / no-race: channel inert. */
export function deactivateCoupling() { coupling.ema = 0; coupling.active = false; _primaryEma.clear(); }

/**
 * Fold one day's player positioning into the EMA and return the bounded velocity
 * multiplier. `positioning` is the signed, normalized net persistent HCN stance in
 * [-1, +1] (long +, short -); it is clamped defensively. Called once per completed
 * day by the orchestrator (main.js); `primary` carries the active offerings'
 * {id,input} deployment terms. Their sum shares the SAME input clamp and EMA.
 * The returned multiplier is passed to advanceRace as `playerCoupling`.
 */
export function stepCoupling(positioning, primary = []) {
    const alpha = 1 - Math.pow(0.5, 1 / COUPLING_TUNING.halflife);
    const secondary = positioning || 0;
    const raw = secondary + primary.reduce((sum, p) => sum + p.input, 0);
    const input = clamp(raw, -1, 1);
    coupling.ema = coupling.ema * (1 - alpha) + input * alpha;
    // 02a primary offerings: attribute the SAME clipped input and EMA, rather
    // than ledgering an extra dC on top of the already-integrated channel.
    const scale = raw ? input / raw : 1;
    for (const [id, ema] of _primaryEma) _primaryEma.set(id, ema * (1 - alpha));
    for (const p of primary) _primaryEma.set(p.id, (_primaryEma.get(p.id) || 0) + p.input * scale * alpha);
    return couplingMultiplier();
}

/** Partition the day's actual integrated dC by offering id and the secondary
 *  residual. Deployment inputs expire after 126 days; their EMA tails retain
 *  their source. Rows sum to the existing channel amount, never double-count it. */
export function couplingAttribution(amount) {
    if (!amount || !coupling.ema) return [];
    const rows = [];
    let attributed = 0;
    for (const [source, ema] of _primaryEma) {
        const share = amount * ema / coupling.ema;
        if (share) { rows.push({ source, amount: share }); attributed += share; }
    }
    const residual = amount - attributed;
    if (residual) rows.push({ source: 'cost_of_capital', amount: residual });
    return rows;
}

/** The current bounded multiplier (cap * clamp(ema, -1, 1)); read-only. */
export function couplingMultiplier() {
    return COUPLING_TUNING.cap * clamp(coupling.ema, -1, 1);
}
