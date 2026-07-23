/* ===================================================
   src/race/rng.js -- Small seeded PRNG for the hidden
   AI-race state machine. Pure, DOM-free, dependency-
   free: importable headless in Node so Monte-Carlo
   verification can drive the race deterministically.

   The sim's own Math.random paths (simulation.js etc.)
   are untouched; this stream is exclusively the race
   layer's, seeded from a per-run seed.

   The mulberry32 core is the codebase's canonical PRNG
   (matches shared/utils.js bit-for-bit) so seeded race
   runs behave like the rest of the site's seeded work.
   =================================================== */

/**
 * Mulberry32 core -- fast 32-bit seeded PRNG. Deterministic from `seed`;
 * yields floats in [0, 1). Bit-for-bit identical to shared/utils.js.
 * @param {number} seed  32-bit integer seed
 * @returns {() => number}
 */
function mulberry32(seed) {
    let a = seed | 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Create a seeded RNG with distribution helpers. All draws come off the
 * one mulberry32 stream, so a given seed reproduces an entire race run.
 * @param {number} seed  32-bit integer seed
 */
export function createRng(seed) {
    const next = mulberry32(seed >>> 0);

    /** Uniform in [a, b). */
    function uniform(a = 0, b = 1) {
        return a + (b - a) * next();
    }

    /**
     * Standard-form normal N(mu, sd) via Box-Muller (cos branch, one value
     * per call). Clamps u1 away from 0 to avoid log(0). Matches the shared
     * `gaussian` helper's construction.
     */
    function normal(mu = 0, sd = 1) {
        let u1 = next();
        if (u1 < 1e-12) u1 = 1e-12;
        const u2 = next();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mu + sd * z;
    }

    /**
     * Gamma(shape=k, scale=1) via Marsaglia-Tsang (2000). Robust for all
     * k > 0: for k < 1 it boosts to k+1 and scales by U^(1/k). Used only as
     * the building block for `beta`.
     */
    function gamma(k) {
        if (k < 1) {
            // Boosting: Gamma(k) = Gamma(k+1) * U^(1/k). Draw U from (0, 1]
            // (1 - next()) so next() === 0 can't produce a zero gamma.
            return gamma(k + 1) * Math.pow(1 - next(), 1 / k);
        }
        const d = k - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);
        for (;;) {
            let x, v;
            do {
                x = normal();
                v = 1 + c * x;
            } while (v <= 0);
            v = v * v * v;
            const u = next();
            const x2 = x * x;
            if (u < 1 - 0.0331 * x2 * x2) return d * v;
            if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
        }
    }

    /**
     * Beta(a, b) as gamma-ratio: X = Gamma(a), Y = Gamma(b), return
     * X / (X + Y). Exact in distribution; handles a, b >= 1 (the only
     * shapes the sampler uses) cleanly.
     */
    function beta(a, b) {
        const x = gamma(a);
        const y = gamma(b);
        const s = x + y;
        return s > 0 ? x / s : 0.5;
    }

    /** Bernoulli(p) -> boolean. */
    function bernoulli(p) {
        return next() < p;
    }

    /**
     * Exponential with the given mean (rate 1/mean). Draws U from (0, 1]
     * via 1 - next() so the log is always finite (no -Infinity).
     */
    function exponential(meanDays) {
        return -meanDays * Math.log(1 - next());
    }

    /**
     * Categorical draw over a weight vector -> index. Weights need not be
     * normalized; non-positive total falls back to index 0.
     */
    function categorical(weights) {
        let total = 0;
        for (let i = 0; i < weights.length; i++) total += weights[i];
        if (total <= 0) return 0;
        let r = next() * total;
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r < 0) return i;
        }
        return weights.length - 1;
    }

    /** Uniform integer in [0, n). */
    function int(n) {
        return Math.floor(next() * n);
    }

    return { seed: seed >>> 0, next, uniform, normal, gamma, beta, bernoulli, exponential, categorical, int };
}

/** Draw a fresh 32-bit seed from the ambient (non-seeded) generator. */
export function randomSeed() {
    return (Math.random() * 0x100000000) >>> 0;
}

/**
 * Derive a stable named child seed from a run seed: FNV-1a hash of `name`
 * XORed into the seed, then run through a splitmix32 finalizer for good
 * dispersion. Lets each subsystem (capability shocks, theft, certification,
 * incidents, treaty, ...) draw from an independent substream, so adding
 * draws to one subsystem in a later phase never perturbs another's
 * trajectory for the same run seed.
 * @param {number} seed  32-bit run seed
 * @param {string} name  substream name
 * @returns {number} 32-bit child seed
 */
export function deriveSeed(seed, name) {
    let h = 0x811c9dc5 >>> 0;                      // FNV-1a offset basis
    for (let i = 0; i < name.length; i++) {
        h ^= name.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;       // FNV prime
    }
    let x = ((seed >>> 0) ^ h) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;   // splitmix32 finalizer
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
    return (x ^ (x >>> 15)) >>> 0;
}
