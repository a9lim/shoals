/* ===================================================
   src/race/incidents.js -- Two-track incident generator +
   evidence-beat generator for the hidden AI-race state
   machine (overhaul phase 2).

   Two-track everywhere (02-race-model.md): an incident
   *occurs* on the latent track (silent -- physical/hidden
   damage only) and the world *detects* it later, or never.
   The market moves on detection; the occurrence->detection
   gap is the insider channel's purest trade. Evidence
   beats are the alignment-side twin, riding the SAME
   latent-queue machinery: found (occurred) vs published.

   Constants are transcribed from docs/design/02a-tuning.md
   (rev 2, "Incidents (two-track) and evidence"). Where 02a
   is silent on a shape or a rate the choice is marked
   `// UNRATIFIED:` and listed in the phase-2 report for the
   orchestrator to ratify into 02a or overrule.

   Module boundary: DOM-free, headless-importable for MC.
   Draws ONLY from `race.streams.incidents` (the subsystem's
   named substream) -- never from capability / theft /
   certification streams -- so capability and theft
   trajectories stay bit-identical whether incidents are
   enabled or not (verified by the substream-isolation check
   in tools/race-mc.mjs). This module reads C / S / heat and
   APPENDS to the latent queues + the per-tick ledger; it
   never mutates C, heat, safety, or the capability sub-state
   -- occurrence's physical effects are RECORDED as fields,
   not applied (see sBurn note below).
   =================================================== */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Logistic sigmoid (matches capability.js). */
function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

/**
 * Knuth Poisson sampler off a [0,1) stream. Λ_world is capped at 0.30, so the
 * daily count is almost always 0 or 1 and the loop is cheap; kept exact rather
 * than approximated by a Bernoulli so the "Poisson daily" wording in 02a holds.
 */
function poisson(rng, lambda) {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng.next(); } while (p > L);
    return k - 1;
}

// ---- Occurrence constants (02a) ------------------------------------------

// w_i = exp(0.7·(C_int,i − 2)) · (1 − S_i) · (0.5 + heat) · surface_i
// Λ_world = min(0.30, 0.07 · Σ w_i)   (Poisson daily; source ∝ w_i)
const OCC_RATE = 0.07;
const OCC_CAP = 0.30;
const OCC_CINT_EXP = 0.7;
const OCC_CINT_REF = 2;
const OCC_HEAT_BASE = 0.5;
const SURFACE = { halcyon: 1.0, tianxia: 1.3, open: 1.6, polaris: 0.4 };   // S_open = 0

// ---- Severity constants (02a) --------------------------------------------

// Base slice at mid-margin, S0..S3; drawn (renormalized) only in the non-S4
// branch. rng.categorical normalizes internally, so no explicit /Σ is needed.
const SEV_BASE = [0.55, 0.25, 0.15, 0.045];

// S4 is budgeted SEPARATELY as a gated late-tail event (02a) -- never the
// generic ladder slice:
//   p4 = min(0.005, 0.0004 · ((1−S)/0.5)² · (heat/0.5)² · σ((C_int − 4)/0.25))
const P4_CAP = 0.005;
const P4_COEF = 0.0004;
const P4_S_REF = 0.5;
const P4_HEAT_REF = 0.5;
const P4_CINT_MID = 4;
const P4_CINT_WIDTH = 0.25;

// Persuasion class joins the ladder past R3 (02-race-model.md incident-class
// list; 02a "persuasion ... unlocks at C_int ≥ R3").
const PERSUASION_RUNG = 3;
// Persuasion takes a 0.20 share of the class draw once unlocked (02a, ratified
// 2026-07-23). Severity 4 is NEVER persuasion -- the absolute S4 self-disclosure
// rule dominates every reclassification (02a); enforced at assignment below.
const PERSUASION_SHARE = 0.20;

// ---- Detection constants (02a) -------------------------------------------

// Eventual-detection probability and mean lag (Exp) per severity S0..S4 --
// full ladder ratified in 02a (2026-07-23): S0 0.70/Exp(10d), S1 0.78/Exp(8d),
// S2 0.86/Exp(6d), S3 0.94/Exp(3d), S4 1.00/immediate (self-disclosing).
const DET_PROB = [0.70, 0.78, 0.86, 0.94, 1.00];
const DET_LAG_MEAN = [10, 8, 6, 3, 0];             // Exp mean, days; S4 = 0 (immediate)

// Persuasion detection (02a): 0.40 eventual, Exp(90d) lag.
const PERSUASION_DET_PROB = 0.40;
const PERSUASION_DET_LAG_MEAN = 90;

// Reporting regime (02a): detection prob -> min(1, p + 0.12); lags halved.
const REPORTING_P_BONUS = 0.12;
const REPORTING_LAG_MULT = 0.5;

// Insider tip: one Bernoulli(0.3) at occurrence for every incident NOT detected
// in its occurrence tick (02a, ratified 2026-07-23) -- "undetected" is the
// occurrence-tick sense, independent of eventual public detectability. Standing-
// gating of whether the tip reaches the player is later-phase.
const INSIDER_TIP_PROB = 0.30;

// ---- Evidence constants (02a) --------------------------------------------

const EVIDENCE_LAB_MEAN = 40;              // per alignment-carrying lab ~Exp(40d)
const LR_CLIP = 3;                         // per-beat LR clipped to [1/3, 3]
const LOG_LR_CLIP = Math.log(LR_CLIP);
const EVIDENCE_LOGODDS_CLAMP = Math.log(19);   // cumulative log-odds clamp -> posterior ceiling 0.95
const LEAK_PROB = 0.25;                    // unpublished beats leak at 0.25
// Alignment-carrying labs = Halcyon and Polaris (02a, ratified 2026-07-23:
// Tianxia is anti-safety by construction and produces no alignment evidence,
// only capability signals). Measured cadence ~40 found / ~28 published per run;
// the ±log19 accumulator clamp is the stance and holds at any count (02a).
const ALIGNMENT_LABS = ['halcyon', 'polaris'];

// ---- Occurrence + detection ----------------------------------------------

/** Build the per-entity occurrence-weight rows for the current race state. */
function occurrenceEntities(race) {
    const cap = race.capability;
    const rows = [];
    const push = (id, C, S) => rows.push({ id, C, S, surface: SURFACE[id] });
    push('halcyon', cap.labs.halcyon.C_internal, race.safety.halcyon);
    if (cap.labs.tianxia.active) push('tianxia', cap.labs.tianxia.C_internal, race.safety.tianxia);
    if (cap.labs.polaris.active) push('polaris', cap.labs.polaris.C_internal, race.safety.polaris);
    push('open', cap.open.C, 0);   // open carries no safety margin (S_open = 0)
    return rows;
}

/** Anatomy class of an occurrence: misuse (open-weights) vs frontier accident. */
function baseClass(sourceId) {
    return sourceId === 'open' ? 'misuse' : 'accident';
}

/**
 * Step the two-track INCIDENT process one completed day. Runs the daily
 * detection pass over prior latent incidents first, then generates the day's
 * occurrences (S4 detects immediately). Appends occurrences to
 * `race.latentIncidents`. Returns { occurred, detected } for the ledger --
 * `occurred` is narrative-silent (the bridge ignores it by design); `detected`
 * is what the race->narrative bridge fires.
 *
 * @param {object} race   race state (createRaceState)
 * @param {number} day    interval-start day
 * @param {number} endDay day boundary that just completed (occurrence stamp)
 * @param {number} heat   START-of-tick heat (heatPre), per the option-a snapshot
 */
export function stepIncidents(race, day, endDay, heat) {
    const rng = race.streams.incidents;
    const q = race.detectionQuality ?? 1;
    const reporting = !!race.incidentReporting;
    const occurred = [];
    const detected = [];

    // 1. Daily detection over prior undetected, detectable incidents. An Exp
    //    mean-lag maps to a memoryless daily hazard 1/meanLag; the modifiable
    //    detectionQuality multiplier scales it (later phases let players/factions
    //    lobby it). Per-day prob = 1 − exp(−hazard), matching 02a's substep rule.
    for (const inc of race.latentIncidents) {
        if (inc.detected || !inc.detectable || inc.meanLag <= 0) continue;
        const hazard = q / inc.meanLag;
        if (rng.next() < 1 - Math.exp(-hazard)) {
            inc.detected = true;
            inc.detectDay = endDay;
            detected.push(_detSummary(inc));
        }
    }

    // 2. Occurrence: Λ_world Poisson daily, source ∝ w_i.
    const rows = occurrenceEntities(race);
    const heatTerm = OCC_HEAT_BASE + heat;
    let sumW = 0;
    const weights = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const w = Math.exp(OCC_CINT_EXP * (r.C - OCC_CINT_REF)) * (1 - r.S) * heatTerm * r.surface;
        weights[i] = w;
        sumW += w;
    }
    const lambda = Math.min(OCC_CAP, OCC_RATE * sumW);
    const n = poisson(rng, lambda);

    for (let j = 0; j < n; j++) {
        const src = rows[rng.categorical(weights)];

        // Severity: gated S4 first, then the renormalized S0..S3 base slice.
        const p4 = Math.min(
            P4_CAP,
            P4_COEF
                * Math.pow((1 - src.S) / P4_S_REF, 2)
                * Math.pow(heat / P4_HEAT_REF, 2)
                * sigmoid((src.C - P4_CINT_MID) / P4_CINT_WIDTH)
        );
        const severity = (rng.next() < p4) ? 4 : rng.categorical(SEV_BASE);

        // Class: misuse (open) / accident (frontier); persuasion past R3 -- but
        // NEVER for severity 4 (the absolute S4 self-disclosure rule dominates
        // every reclassification, 02a). The persuasion roll is still drawn once
        // per eligible source (RNG-stable) and gated on severity only at assignment.
        let cls = baseClass(src.id);
        if (src.C >= PERSUASION_RUNG && rng.next() < PERSUASION_SHARE && severity < 4) cls = 'persuasion';

        // Detection parameters for this incident.
        let pDet, meanLag;
        if (cls === 'persuasion') { pDet = PERSUASION_DET_PROB; meanLag = PERSUASION_DET_LAG_MEAN; }
        else { pDet = DET_PROB[severity]; meanLag = DET_LAG_MEAN[severity]; }
        if (reporting) { pDet = Math.min(1, pDet + REPORTING_P_BONUS); meanLag *= REPORTING_LAG_MULT; }
        const detectable = rng.next() < pDet;
        const immediate = detectable && meanLag <= 0;   // S4 self-discloses in its occurrence tick

        // Occurrence (silent) physical effect: deferred ENTIRELY (02a, 2026-07-23).
        // The field stays null until a 02a revision ratifies a magnitude -- no
        // invented truth-valued numbers in state, even inert; applying one would
        // also double-count the calibrated S path.
        const sBurn = null;
        // Insider tip: one Bernoulli(0.3) for every incident NOT detected in its
        // occurrence tick (02a) -- independent of eventual public detectability;
        // the occurrence->disclosure window is the tip's whole point.
        const insiderTip = !immediate && (rng.next() < INSIDER_TIP_PROB);

        const inc = {
            id: `inc_${endDay}_${j}`,
            source: src.id,
            severity,
            cls,
            occurDay: endDay,
            detectable,
            meanLag,
            sBurn,
            insiderTip,
            detected: false,
            detectDay: null,
        };

        // Immediate (S4) detection fires in the same tick.
        if (immediate) {
            inc.detected = true;
            inc.detectDay = endDay;
            detected.push(_detSummary(inc));
        }

        race.latentIncidents.push(inc);
        // Ledger carries the occurrence-track fields consumers need (insiderTip,
        // the now-null physical-effect field) -- consumers read the ledger, never
        // latent state by id.
        occurred.push({ id: inc.id, source: inc.source, severity, cls, occurDay: endDay, insiderTip, sBurn });
    }

    return { occurred, detected };
}

/** Public-facing detection summary (what the bridge fires on). */
function _detSummary(inc) {
    return {
        id: inc.id,
        source: inc.source,
        severity: inc.severity,
        cls: inc.cls,
        occurDay: inc.occurDay,
        detectDay: inc.detectDay,
        lag: inc.detectDay - inc.occurDay,
    };
}

/**
 * Activate the mandatory incident-reporting regime, RETROACTIVELY ONCE (02a,
 * ratified 2026-07-23): sets the regime flag so future incidents detect under the
 * improved parameters (min(1, p+0.12), lags halved), AND re-rolls the pending
 * (still-latent) incidents' detectability and remaining lag under those improved
 * parameters -- the disclosure wave when a reporting mandate lands is deliberate.
 * Idempotent: a second call is a no-op (the "once" in retroactive-once).
 *
 * Currently unwired -- phase-5 policy events call it. Draws from
 * `race.streams.incidents` (the subsystem's substream) for the rescue rolls.
 *
 * @param {object} race  race state (createRaceState)
 * @returns {{ rescued: number, shortened: number }}  disclosure-wave summary
 */
export function applyReportingRegime(race) {
    if (race.incidentReporting) return { rescued: 0, shortened: 0 };
    race.incidentReporting = true;
    const rng = race.streams.incidents;
    let rescued = 0, shortened = 0;
    for (const inc of race.latentIncidents) {
        if (inc.detected) continue;   // already public -- nothing to re-roll
        const persuasion = inc.cls === 'persuasion';
        const basePDet = persuasion ? PERSUASION_DET_PROB : DET_PROB[inc.severity];
        const baseMeanLag = persuasion ? PERSUASION_DET_LAG_MEAN : DET_LAG_MEAN[inc.severity];
        const newPDet = Math.min(1, basePDet + REPORTING_P_BONUS);
        // Rescue currently-undetectable latents with the incremental detection
        // probability P(detectable now | not before) = (new − base)/(1 − base).
        if (!inc.detectable) {
            const rescueProb = basePDet >= 1 ? 0 : (newPDet - basePDet) / (1 - basePDet);
            if (rng.next() < rescueProb) { inc.detectable = true; rescued++; }
        }
        // Remaining lag shortens: the daily detection hazard is memoryless, so
        // halving meanLag doubles the hazard from here forward.
        const newMeanLag = baseMeanLag * REPORTING_LAG_MULT;
        if (newMeanLag < inc.meanLag) { inc.meanLag = newMeanLag; shortened++; }
    }
    return { rescued, shortened };
}

// ---- Evidence beats (the alignment-side twin, same latent-queue machinery) --

/**
 * Step the two-track EVIDENCE process one completed day. Mirrors the incident
 * machinery: a daily publication pass over prior latent evidence (found->public
 * on a one-tick queue delay), then the day's occurrences (found beats). The
 * cumulative found log-odds accumulator is clamped to ±log 19 (posterior
 * ceiling 0.95) at every update. Returns { occurred, published }; `occurred` is
 * the silent found track, `published` the legible one.
 */
export function stepEvidence(race, day, endDay) {
    const rng = race.streams.incidents;
    const occurred = [];
    const published = [];

    // 1. Publication pass over prior latent beats (publicDay set at occurrence,
    //    Infinity for buried). Published/leaked beats surface one tick after
    //    they were found -- the machinery's minimum found->public gap.
    for (const ev of race.latentEvidence) {
        if (ev.published || ev.publicDay > endDay) continue;
        ev.published = true;
        ev.publishDay = endDay;
        published.push({ id: ev.id, lab: ev.lab, path: ev.path, favorable: ev.favorable, logLR: ev.logLR });
    }

    // 2. Occurrence: per alignment-carrying active lab, daily hazard 1/40.
    const cap = race.capability;
    const tau = race.hidden.tau;
    const culture = race.hidden.labCulture;
    for (const labId of ALIGNMENT_LABS) {
        const lab = cap.labs[labId];
        if (!lab || !lab.active) continue;
        if (rng.next() >= 1 - Math.exp(-1 / EVIDENCE_LAB_MEAN)) continue;   // no beat today

        // Direction correlates with τ but never identifies it (02a, ratified
        // 2026-07-23): |log LR| ~ U(0, log 3), sign ~ Bernoulli(τ) ("kind worlds
        // read kind"), clipped to [1/3, 3].
        const favorable = rng.next() < tau;
        const mag = rng.uniform(0, LOG_LR_CLIP);
        const logLR = clamp(favorable ? mag : -mag, -LOG_LR_CLIP, LOG_LR_CLIP);
        race.evidenceLogOdds = clamp(
            race.evidenceLogOdds + logLR, -EVIDENCE_LOGODDS_CLAMP, EVIDENCE_LOGODDS_CLAMP);

        // Two tracks: found vs published. Publication prob = culture; otherwise
        // the beat is buried unless it leaks (0.25).
        const willPublish = rng.next() < culture[labId];
        let path;
        if (willPublish) path = 'published';
        else path = (rng.next() < LEAK_PROB) ? 'leaked' : 'buried';
        const publicDay = (path === 'buried') ? Infinity : endDay;

        const ev = {
            id: `ev_${endDay}_${labId}`,
            lab: labId,
            favorable,
            logLR,
            occurDay: endDay,
            path,
            publicDay,
            published: false,
            publishDay: null,
        };
        race.latentEvidence.push(ev);
        // Ledger carries logLR so consumers read the ledger, never latent state by id.
        occurred.push({ id: ev.id, lab: labId, favorable, logLR, path, occurDay: endDay });
    }

    return { occurred, published };
}
