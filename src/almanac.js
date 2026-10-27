/* ===================================================
   src/almanac.js -- The almanac (02a "The evening", "The
   almanac"): one record per Dynamic run, appended when
   its last edition is shown (natural resolution and
   ejection alike), kept in browser storage under
   `shoals-almanac`, versioned, the latest 200.

   A record holds the seed and the opening fixture, the
   family, overlay, terminal day and cause, the sampler's
   draws, and the scored record -- per quarter and rung o,
   p_P, p_M and the lock's classification, with S_P, sigma0
   and credibility -- beside the reader-copier's record on
   the same world (src/race/belief.js copierRecord). The
   reader-copier stays out of view until the run ends.

   Every storage access is wrapped in try/catch: without
   storage the almanac is empty and the game is unchanged.
   DOM-free; the Meridian page renders the summary.
   =================================================== */

export const ALMANAC_KEY = 'shoals-almanac';
export const ALMANAC_VERSION = 1;
export const ALMANAC_KEEP = 200;

/** The neutral-input baseline the families seen are set beside: the target
 *  outcome distribution's band centres, in percent (02a "Target outcome
 *  distribution (the tuning contract)"). It is the distribution of headless
 *  runs with no player inputs, labelled as that, not a forecast for a run played
 *  from an inherited book (02a "The opening hand": no refit). */
export const NEUTRAL_BASELINE = Object.freeze({ 1: 14, 2: 21, 3: 32, 4: 14, 5: 5, 6: 14 });

/** One scored record (forecastRecord / copierRecord) in the almanac's shape. */
function _scored(rec) {
    if (!rec) return null;
    return {
        S: rec.S, sigma0: rec.sigma0, credibility: rec.credibility,
        quarters: rec.history.map(q => ({
            from: q.from, to: q.to, terminal: q.terminal,
            rungs: q.rungs.map(r => (r.cls ? { R: r.R, o: r.o, pP: r.pP, pM: r.pM, cls: r.cls } : { R: r.R, o: r.o, pP: r.pP, pM: r.pM })),
        })),
    };
}

/**
 * Build one run's record. `race` gives the seed and the sampler's draws (read
 * only once the run has ended); `resolution` the family, terminal day and cause;
 * `ending` the desk's own ending (natural or an ejection); `fixture` the opening
 * hand's id, or null; `player` and `copier` the two scored records.
 */
export function buildAlmanacRecord({ race, resolution, overlay, ending, fixture = null, player, copier }) {
    const h = race.hidden;
    return {
        seed: race.seed,
        fixture: fixture ?? null,
        family: resolution ? resolution.family : null,
        overlay: overlay ?? null,
        day: resolution ? resolution.day : null,
        cause: resolution ? resolution.terminalCause : null,
        extrapolated: resolution ? !!resolution.extrapolated : false,
        ending: ending ?? null,
        draws: {
            tau: h.tau, takeoffSharpness: h.takeoffSharpness, scalingElasticity: h.scalingElasticity,
            chinaPosition: h.chinaTrue.position, chinaVelocity: h.chinaTrue.velocity, dealPossible: h.chinaTrue.dealPossible,
            cultureHalcyon: h.labCulture.halcyon, culturePolaris: h.labCulture.polaris, polarisSpawnDay: h.polarisSpawnDay,
        },
        player: _scored(player),
        copier: _scored(copier),
    };
}

/** The browser's storage, or null where there is none (or it throws). */
function _storage(storage) {
    if (storage !== undefined) return storage;
    try { return globalThis.localStorage || null; } catch { return null; }
}

/** The stored records, oldest first; empty without storage, on a version
 *  mismatch or on anything unreadable. */
export function readAlmanac(storage) {
    const st = _storage(storage);
    if (!st) return [];
    try {
        const raw = st.getItem(ALMANAC_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return data && data.version === ALMANAC_VERSION && Array.isArray(data.records) ? data.records : [];
    } catch {
        return [];
    }
}

/** Append one record, keeping the latest ALMANAC_KEEP. Returns true when it was
 *  written. */
export function appendAlmanac(record, storage) {
    const st = _storage(storage);
    if (!st || !record) return false;
    try {
        const records = readAlmanac(st).concat([record]).slice(-ALMANAC_KEEP);
        st.setItem(ALMANAC_KEY, JSON.stringify({ version: ALMANAC_VERSION, records }));
        return true;
    } catch {
        return false;
    }
}

/**
 * The almanac's summary, the Meridian page's data:
 *   runs        the number of records;
 *   S           cumulative S_P (`player`) beside the reader-copier's (`copier`);
 *   reliability ten rows over the player's CARRIED rung-quarters, deciles of p_P
 *               ([lo, hi), the last closed): count n, mean p_P and the observed
 *               frequency of o (null where n is 0);
 *   families    per family 1-6: runs seen, their share, and the neutral-input
 *               baseline share beside it.
 */
export function summarizeAlmanac(records) {
    const recs = Array.isArray(records) ? records : [];
    const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10, n: 0, sumP: 0, sumO: 0 }));
    const seen = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let player = 0, copier = 0;
    for (const r of recs) {
        if (r.player) {
            player += r.player.S;
            for (const q of r.player.quarters) for (const x of q.rungs) {
                if (x.cls !== 'carried') continue;
                const b = bins[Math.min(9, Math.max(0, Math.floor(x.pP * 10)))];
                b.n++; b.sumP += x.pP; b.sumO += x.o;
            }
        }
        if (r.copier) copier += r.copier.S;
        if (r.family in seen) seen[r.family]++;
    }
    const runs = recs.length;
    return {
        runs,
        S: { player, copier },
        reliability: bins.map(b => ({ lo: b.lo, hi: b.hi, n: b.n, meanP: b.n ? b.sumP / b.n : null, freq: b.n ? b.sumO / b.n : null })),
        families: [1, 2, 3, 4, 5, 6].map(f => ({ family: f, n: seen[f], share: runs ? seen[f] / runs : null, baseline: NEUTRAL_BASELINE[f] / 100 })),
    };
}
