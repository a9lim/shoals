/* ===================================================
   src/events/race-bridge.js -- Race -> narrative bridge
   (overhaul phase 2, thin slice).

   Converts each completed day's `race.lastTransitions`
   (the phase-1 ledger) into fired narrative events through
   the standard EventEngine path (`_fireEvent`). Runs in the
   daily pipeline right after `advanceRace`, Dynamic modes
   only, guarded like everything else. It CONSUMES the
   ledger -- it never state-diffs the race machine.

   This is the generalized successor of the dead
   `model_release` clock pulse: releases now fire because the
   race ledger says a release happened, not because a timer
   elapsed. Incidents fire on DETECTION only -- occurrence
   stays silent, and that silence is the design (the
   occurrence->detection gap is the insider channel's trade).

   Routing:
     releases      -> release headline events, tier/magnitude-aware
     certifications-> certification/settlement events (direct settlements)
     incidents     -> DETECTED incidents only, severity-scaled
                      (S0/S1 toast-minor, S2 toast-moderate, S3 popup,
                       S4 superevent); persuasion class distinct
     thefts        -> stub (records intent, fires nothing -- see bridgeThefts)
     evidence      -> NOT bridged this slice (generated + laddered in the race
                      state; surfaced through belief / the insider channel later)

   DOM-free. The bridge selects a shell, attaches `raceMeta`
   (the data the real prose draws on), and fires it for its
   headline/popup. MARKET COUPLING (phase 4): each shell's
   permanent `params` stays `{}` (03 incident-coupling rule --
   the stream is too high-volume for permanent additive deltas),
   and the coupling now rides `ev.impulse`, seeded into the
   DECAYING event-impulse overlay (src/race/impulse.js) scaled
   by the Act-II alpha-decay pre-pricing factor (1 - eta*frac)
   and the player-net-delta coupling, with a causal event ID.
   `B` moves separately in stepBelief off the ledger -- the
   impulse is the HCN-price reaction, not the timeline belief.
   =================================================== */

import { getEventById } from './index.js';
import { buildPublicView } from '../race/consensus.js';
import { marketEfficiency } from '../race/belief.js';

// Act-II alpha decay: as market efficiency `eta` rises with the RELEASED
// frontier (02a ruling), a fraction of each race event's move was already
// PRE-PRICED off its legible precursor (a rung claim precedes its certification;
// the release ladder gaps the market before the headline). The headline residual
// the player can still catch shrinks by eta*PREPRICE_FRAC -- edges thin, exactly
// the alpha-decay mechanic, and it is public-state-derived (eta reads only the
// released rung). UNRATIFIED magnitude.
const PREPRICE_FRAC = 0.6;

/** Clone a shell by id, apply overrides, attach raceMeta. Null if id unknown. */
function shell(id, overrides, raceMeta) {
    const base = getEventById(id);
    if (!base) return null;
    const ev = { ...base, ...overrides };
    ev.raceMeta = raceMeta;
    return ev;
}

// ---- Prose finalization: variant pools + token substitution --------------
// Every fired string (headline + each choice label/desc) is finalized in ONE
// place -- `finalize()`, called from `emit()` -- so every bridge path passes
// through it. Two steps, in order: (1) pick a headline variant from a `headlines`
// pool (scalar `headline` is the fallback), (2) substitute display tokens from
// raceMeta. Neither step consumes any race RNG substream -- prose choice must
// never perturb model draws.

const LAB_NAME = { halcyon: 'Halcyon', tianxia: 'Tianxia', polaris: 'Polaris', open: 'the open ecosystem' };
// {model}: bare model name (prose supplies its own article). {aModel}: name with
// the correct indefinite article baked in (article agreement -- "a Aleph" is broken).
const MODEL_NAME = { halcyon: 'Aleph', tianxia: 'Cangjie', polaris: 'Holt', open: 'Cangjie fine-tune' };
const AMODEL_NAME = { halcyon: 'an Aleph', tianxia: 'a Cangjie', polaris: 'a Holt', open: 'a Cangjie fine-tune' };
const RUNG_NAME = {
    1: 'reliable agency', 2: 'autonomous engineering', 3: 'autonomous research',
    4: 'recursive self-improvement', 5: 'takeoff',
};

/** Canonical entity id from a raceMeta: incidents carry `source`, releases
 *  `entity`, certifications `lab`. These never overlap on one meta. */
function entityOf(meta) {
    return meta ? (meta.source ?? meta.entity ?? meta.lab) : undefined;
}

// Deduped mismatch warnings: a shell whose prose uses a token raceMeta cannot
// satisfy is a PROSE bug (e.g. {rung} on a routine-release shell). Flagged, not
// fixed -- the literal token is left in place so the bug is visible in-game too.
const _warned = new Set();
function warnToken(shellId, token) {
    const key = shellId + token;
    if (_warned.has(key)) return;
    _warned.add(key);
    if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[race-bridge] shell '${shellId}' text uses ${token} but its raceMeta lacks it`);
    }
}

/**
 * Substitute the known display tokens in `str` from `meta`. Only tokens actually
 * present are touched; a present-but-unsatisfiable known token is warned and left
 * literal. Unknown braces are never touched (no template-engine generalization).
 * Exported for unit-testability (the real code path, not a copy).
 */
export function substituteTokens(str, meta, shellId) {
    if (typeof str !== 'string') return str;
    let out = str;
    const entity = entityOf(meta);
    if (out.includes('{lab}')) {
        const v = LAB_NAME[entity];
        if (v != null) out = out.replaceAll('{lab}', v); else warnToken(shellId, '{lab}');
    }
    if (out.includes('{aModel}')) {
        const v = AMODEL_NAME[entity];
        if (v != null) out = out.replaceAll('{aModel}', v); else warnToken(shellId, '{aModel}');
    }
    if (out.includes('{model}')) {
        const v = MODEL_NAME[entity];
        if (v != null) out = out.replaceAll('{model}', v); else warnToken(shellId, '{model}');
    }
    if (out.includes('{rung}')) {
        const r = meta ? meta.rung : null;
        if (r != null) out = out.replaceAll('{rung}', 'R' + r); else warnToken(shellId, '{rung}');
    }
    if (out.includes('{rungName}')) {
        const v = meta ? RUNG_NAME[meta.rung] : null;
        if (v != null) out = out.replaceAll('{rungName}', v); else warnToken(shellId, '{rungName}');
    }
    if (out.includes('{lag}')) {
        const l = meta ? meta.lag : null;
        if (l != null) out = out.replaceAll('{lag}', String(Math.round(l))); else warnToken(shellId, '{lag}');
    }
    return out;
}

// Per-shell fire counter -> even variant rotation with no repeat-in-a-row across
// consecutive firings of the same shell. RNG-free and deterministic in fire
// order (which is itself determined by the model, not the other way around).
const _fireCount = new Map();
function pickHeadline(ev) {
    if (Array.isArray(ev.headlines) && ev.headlines.length) {
        const n = _fireCount.get(ev.id) || 0;
        _fireCount.set(ev.id, n + 1);
        return ev.headlines[n % ev.headlines.length];
    }
    return ev.headline;
}

/**
 * Finalize a cloned shell for firing: pick the headline variant, then substitute
 * tokens in the headline AND every choice label/desc. Choices are deep-copied so
 * the shared shell objects are never mutated across firings. Mutates + returns ev.
 * Exported for unit-testability (the real code path, not a copy).
 */
export function finalize(ev) {
    const meta = ev.raceMeta;
    // Headline: pick variant, substitute, then uppercase the first character --
    // several variants open with {aModel}/{lab} whose fill can start lowercase
    // ("an Aleph…", "the open ecosystem…"). Headline only; choices already
    // start capitalized.
    let h = substituteTokens(pickHeadline(ev), meta, ev.id);
    if (h) h = h.charAt(0).toUpperCase() + h.slice(1);
    ev.headline = h;
    if (Array.isArray(ev.choices)) {
        ev.choices = ev.choices.map(c => {
            // Deep clone: nested `deltas`/`followups` must NOT alias the shared
            // shell -- a shallow {...c} leaves those references pointing at the
            // shell, so anything that later mutates a fired choice's deltas or
            // followups would corrupt the shell for all future firings.
            const cc = structuredClone(c);
            cc.label = substituteTokens(c.label, meta, ev.id);
            cc.desc = substituteTokens(c.desc, meta, ev.id);
            return cc;
        });
    }
    return ev;
}

/**
 * Reset per-run bridge state (the variant-rotation fire counter). Call wherever
 * the engine/race resets so same-seed narrative playback does not depend on
 * process history -- variant rotation must restart cleanly each run.
 */
export function resetRaceBridge() {
    _fireCount.clear();
}

// ---- Releases ------------------------------------------------------------

function bridgeReleases(tr, emit) {
    for (const rel of tr.releases) {
        const entity = rel.labId;
        const isTianxia = entity === 'tianxia';
        const topRung = rel.releasedCrossings.length ? Math.max(...rel.releasedCrossings) : null;
        const openCrossed = !!(rel.openCrossings && rel.openCrossings.length);

        let id, overrides = {};
        if (topRung == null) {
            id = isTianxia ? 'release_routine_tianxia' : 'release_routine_frontier';
        } else {
            id = isTianxia ? 'release_rung_tianxia' : 'release_rung_frontier';
            if (topRung >= 3) overrides.magnitude = 'major';   // R3+ crossing is major news
        }
        emit(shell(id, overrides, { entity, rung: topRung, openCrossed, C_released: rel.C_released }));
    }
}

// ---- Certifications ------------------------------------------------------

function bridgeCertifications(tr, emit) {
    // Nested settlement can emit several entries for one lab in a tick (one
    // `direct` top rung + `impliedBy` lower rungs). Fire ONE settlement beat per
    // lab, on its top DIRECT rung; the entailed lower rungs are absorbed.
    const byLab = new Map();
    for (const cert of tr.certifications) {
        if (!cert.direct) continue;
        byLab.set(cert.lab, Math.max(byLab.get(cert.lab) ?? 0, cert.rung));
    }
    for (const [lab, rung] of byLab) {
        emit(shell('certification_settled', {}, { lab, rung }));
    }
}

// ---- Incidents (DETECTED only; occurrence stays silent) ------------------

function bridgeIncidents(tr, emit) {
    for (const det of tr.incidents.detected) {
        const meta = { source: det.source, severity: det.severity, cls: det.cls, lag: det.lag };
        let id;
        // Severity DOMINATES class: an S4 always routes catastrophe, whatever the
        // class label -- the absolute S4 self-disclosure rule (02a). (The generator
        // also never produces a persuasion S4; this is the belt to that suspenders.)
        if (det.severity >= 4) id = 'incident_catastrophe';
        else if (det.cls === 'persuasion') id = 'incident_persuasion';
        else if (det.severity === 3) id = 'incident_grave';
        else if (det.severity === 2) id = 'incident_moderate';
        else id = 'incident_minor';   // S0 / S1
        emit(shell(id, {}, meta));
    }
}

// ---- Thefts (stub: records intent, fires nothing) ------------------------

function bridgeThefts(tr) {
    // DELIBERATE NO-OP for this slice. Detected-theft narrative comes later:
    // thefts have their OWN disclosure track (attribution is sampled and
    // disputed -- spies, or the model itself -- and the public post-mortem
    // rarely settles it), which this thin slice does not build. The successful
    // records in tr.thefts carry { from, to, epsilon, attribution, day }; a later
    // phase adds the theft occurrence->disclosure two-track and its event shells.
    // Nothing is fired here on purpose -- surfacing a theft as narrative now
    // would leak the discontinuity ahead of its designed disclosure path.
    void tr.thefts;
}

// ---- Public entry --------------------------------------------------------

/**
 * Fire the day's race transitions as narrative events through `engine._fireEvent`.
 * Returns { fired, popups } in the same shape EventEngine.maybeFire produces, so
 * main.js can merge them into its existing display path.
 *
 * @param {EventEngine} engine   the active event engine (Dynamic modes)
 * @param {object} race          race state; reads race.lastTransitions
 * @param {object} sim           simulation (param deltas apply here)
 * @param {number} day           current day
 * @param {number} netDelta      player net delta (for event coupling)
 */
export function runRaceBridge(engine, race, sim, day, netDelta = 0) {
    const tr = race.lastTransitions;
    if (!tr) return { fired: [], popups: [] };
    const fired = [], popups = [];
    // eta from the RELEASED frontier (public view) drives Act-II alpha decay: a
    // fraction of every race impulse is treated as already pre-priced.
    const eta = marketEfficiency(buildPublicView(race));
    const prePrice = 1 - eta * PREPRICE_FRAC;
    const emit = (ev) => {
        if (!ev) return;
        finalize(ev);   // variant pick + token substitution + headline capitalization
        // Market coupling: stamp the Act-II alpha-decay pre-pricing factor on the
        // shell so the CANONICAL impulse dispatch inside _fireEvent seeds it (the
        // one path shared with followup-fired shells -- no double-seeding here).
        // _fireEvent multiplies this by the player-net-delta coupling.
        if (ev.impulse) ev._impulseScale = prePrice;
        const r = engine._fireEvent(ev, sim, day, 0, netDelta);
        if (r && r.queued) popups.push(r.event);
        else if (r) fired.push(r);
    };

    bridgeReleases(tr, emit);
    bridgeCertifications(tr, emit);
    bridgeIncidents(tr, emit);
    bridgeThefts(tr);

    return { fired, popups };
}
