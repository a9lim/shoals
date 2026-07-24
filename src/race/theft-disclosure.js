/* ===================================================
   src/race/theft-disclosure.js -- The theft DISCLOSURE
   track (evidence machinery round, 2026-07-24).

   Thefts keep OCCURRING silently. `commitTheft`'s physical
   bundle (the C discontinuity, the +0.04 heat floor, the
   90d race-wide S freeze, the count) is complete and
   UNTOUCHED at occurrence -- this module adds only the
   second track: WHEN, and WHETHER, the world finds out,
   and what the world decides to blame.

   Two-track, exactly the incidents.js pattern:
     - at COMMIT, disclosure ELIGIBILITY is decided once
       (Bernoulli 0.75) -- the mirror of incidents deciding
       `detectable` at occurrence. A quarter of thefts stay
       rumor forever; the never-disclosed tail is REAL.
     - a daily MEMORYLESS hazard (mean lag 40d) over the
       still-undisclosed, eligible records surfaces them.
     - at DISCLOSURE the PUBLIC attribution is sampled --
       espionage 0.55 / insider 0.30 / the model itself
       0.15 -- INDEPENDENT of the record's true
       `attribution` field. Public post-mortems rarely
       settle it; the dispute is the story (02a).

   Disclosure is NARRATIVE + BELIEF only. It never touches
   C, S, heat, safety or the capability sub-state, and it
   draws ONLY from `race.streams.theftDisclosure` (a NEW
   named substream, convention 5) -- so race trajectories
   are BIT-IDENTICAL with the track on or off (harness-
   asserted). `race.theftDisclosureEnabled` is the MC
   toggle for the off-arm; always true in game.

   Constants transcribed from docs/design/02a-tuning.md
   § "Evidence machinery (pre-P7 ratifications, 2026-07-24)".
   Pure / DOM-free -- headless-importable for MC.
   =================================================== */

// ---- Constants (02a evidence-machinery block) -----------------------------

/** Eventual-disclosure probability, decided once at commit. */
export const DISCLOSE_PROB = 0.75;
/** Exp mean lag, days, from the theft day (memoryless daily hazard 1/40). */
export const DISCLOSE_MEAN_LAG = 40;
/** PUBLIC attribution categories and their sampling weights (02a). Independent
 *  of the record's TRUE attribution -- the dispute is the story. */
export const PUBLIC_ATTRIBUTIONS = ['espionage', 'insider', 'model'];
export const PUBLIC_ATTRIBUTION_WEIGHTS = [0.55, 0.30, 0.15];

/** Fresh (empty) latent-theft queue. */
export function freshTheftQueue() {
    return [];
}

/**
 * Register a COMMITTED theft on the disclosure track. Called from commitTheft
 * (race-state.js) -- the canonical commit op -- so every theft path enters the
 * track exactly once. Draws ONE Bernoulli from `streams.theftDisclosure` to fix
 * eligibility, mirroring how incidents.js fixes `detectable` at occurrence.
 * No-op (and NO draw) when the track is disabled, so the off-arm consumes
 * nothing from any stream.
 *
 * @param {object} race    race state
 * @param {object} record  the commitTheft record { from, to, epsilon, attribution, day }
 * @param {number} endDay  the day boundary the theft committed on
 * @returns {object|null}  the latent record, or null when the track is off
 */
export function registerTheft(race, record, endDay) {
    if (race.theftDisclosureEnabled === false) return null;
    if (!race.latentThefts) race.latentThefts = freshTheftQueue();
    const rng = race.streams.theftDisclosure;
    const disclosable = rng.next() < DISCLOSE_PROB;
    const latent = {
        id: `theft_${endDay}_${race.latentThefts.length}`,
        from: record.from,
        to: record.to,
        theftDay: endDay,
        trueAttribution: record.attribution,   // latent; NEVER the published one
        disclosable,
        meanLag: DISCLOSE_MEAN_LAG,
        disclosed: false,
        disclosureDay: null,
        publicAttribution: null,
    };
    race.latentThefts.push(latent);
    return latent;
}

/**
 * Daily disclosure pass over PRIOR undisclosed, disclosable thefts. Runs BEFORE
 * this tick's theft roll (advanceRace step 2b) so a theft can never disclose in
 * its own commit tick -- the same ordering incidents.js uses for detection, and
 * the reason a theft needs no "not today" guard here.
 *
 * Returns the ledger rows { id, from, to, theftDay, day, lag, publicAttribution }
 * for `tr.theftDisclosures`; consumers read the LEDGER, never the latent queue.
 *
 * @param {object} race    race state
 * @param {number} day     interval-start day
 * @param {number} endDay  the day boundary that just completed
 */
export function stepTheftDisclosure(race, day, endDay) {
    const rows = [];
    if (race.theftDisclosureEnabled === false) return rows;
    const queue = race.latentThefts;
    if (!queue || queue.length === 0) return rows;
    const rng = race.streams.theftDisclosure;
    for (const t of queue) {
        if (t.disclosed || !t.disclosable || t.meanLag <= 0) continue;
        if (rng.next() >= 1 - Math.exp(-1 / t.meanLag)) continue;
        t.disclosed = true;
        t.disclosureDay = endDay;
        t.publicAttribution = PUBLIC_ATTRIBUTIONS[rng.categorical(PUBLIC_ATTRIBUTION_WEIGHTS)];
        rows.push({
            id: t.id,
            from: t.from,
            to: t.to,
            theftDay: t.theftDay,
            day: endDay,
            lag: endDay - t.theftDay,
            publicAttribution: t.publicAttribution,
        });
    }
    return rows;
}
