/* ===================================================
   world-state.js -- Mutable world state machine for
   the Shoals event system. Tracks congressional
   control, geopolitical
   escalation, Fed credibility, ongoing investigations,
   and election state. Provides LLM effect validation
   and application via structured path mutations.
   =================================================== */

// -- Fresh world state factory -------------------------------------------

export function createWorldState() {
    return {
        congress: {
            senate: { federalist: 52, farmerLabor: 48 },
            house:  { federalist: 221, farmerLabor: 214 },
            filibusterActive: false,
            bigBillStatus:    0,
        },
        geopolitical: {
            tradeWarStage:       0,
            mideastEscalation:   0,
            southAmericaOps:     0,
            sanctionsActive:     false,
            oilCrisis:           false,
            recessionDeclared:   false,
            chinaRelations:     0,
            gulfEscalation: 0,
            russianCrisis:     0,
            straitClosed:              false,
            taiwanBlockade:            false,
            energyCrisis:               false,
        },
        fed: {
            hikeCycle:        false,
            cutCycle:         false,
            qeActive:         false,
            hartleyFired:     false,
            vaneAppointed:    false,
            credibilityScore: 10,
        },
        investigations: {
            tanBowmanStory:   0,
            tanNsaStory:      0,
            okaforProbeStage: 0,
            impeachmentStage: 0,
            meridianExposed:  false,
        },
        election: {
            midtermComplete:  false,
            midtermResult:    null,
            barronApproval:   50,
            lobbyMomentum:    0,
            primarySeason:    false,
            okaforRunning:    false,
            presidentialResult: null,
        },
        media: {
            tanCredibility:    5,
            sentinelRating:    5,
            pressFreedomIndex: 7,
            leakCount:         0,
            lobbyingExposed:   false,
        },
        // AI-policy domain (overhaul phase 5a; 07-migration). The slim narrative-
        // facing state the new arcs read via event `when` guards. Export-control
        // politics + the treaty track + the wonders track live here; controlRegime
        // and reportingRegime are READ-ONLY MIRRORS of race-state (main.js writes
        // them each day from raceState -- race-state.js stays the sole authority,
        // this exists so event guards can read the regime without a race handle).
        // The five race dials (C/S/heat/B/F) stay on raceState, never mirrored here.
        ai: {
            exportControlStage: 0,      // 0 none .. 3 total chip embargo (china-arc lobbying)
            treatyStage:        0,      // 0 dormant, 1 talks, 2 framework, 3 signed, 4 implemented
            wonderCount:        0,      // model-designed breakthroughs surfaced (wonders track)
            controlRegime:      'private',   // MIRROR of race.controlRegime (read-only for guards)
            reportingRegime:    false,       // MIRROR of race.incidentReporting (read-only for guards)
            frontierRung:       1,           // MIRROR of the released frontier rung (read-only for guards;
                                             // the public act proxy -- same driver as eta / base-rate scale)
            fixedpointPublic:   false,       // the codename belongs to the world (halcyon-arc one-shot sets it)
        },
    };
}

// -- Congress derived helpers --------------------------------------------

export function congressHelpers(world) {
    const { senate, house } = world.congress;
    const fedControlsSenate = senate.federalist >= 50;
    const fedControlsHouse  = house.federalist  >= 218;
    return {
        fedControlsSenate,
        fedControlsHouse,
        trifecta:     fedControlsSenate && fedControlsHouse,
        superMajority: senate.federalist >= 60,
    };
}

/** Clamp congress seats to valid ranges and enforce conservation. */
export function validateCongress(world) {
    const { senate, house } = world.congress;
    senate.federalist = Math.max(0, Math.min(100, Math.round(senate.federalist)));
    senate.farmerLabor = 100 - senate.federalist;
    house.federalist = Math.max(0, Math.min(435, Math.round(house.federalist)));
    house.farmerLabor = 435 - house.federalist;
}

// -- LLM effect validation ranges (whitelist) ----------------------------
// Numeric: { min, max, type: 'number' }
// Boolean: { type: 'boolean' }
// Enum:    { type: 'enum', values: [...] } — set-only, value must be in list
// Null/string fields (midtermResult, presidentialResult) are omitted —
// the LLM cannot set them via structured effects.

const WORLD_STATE_RANGES = {
    // congress.senate
    'congress.senate.federalist':       { min: 0,   max: 100, type: 'number' },
    'congress.senate.farmerLabor':      { min: 0,   max: 100, type: 'number' },
    // congress.house
    'congress.house.federalist':        { min: 0,   max: 435, type: 'number' },
    'congress.house.farmerLabor':       { min: 0,   max: 435, type: 'number' },
    // congress
    'congress.filibusterActive':        { type: 'boolean' },
    'congress.bigBillStatus':           { min: 0,   max: 4,   type: 'number' },
    // geopolitical
    'geopolitical.tradeWarStage':       { min: 0,   max: 4,   type: 'number' },
    'geopolitical.mideastEscalation':   { min: 0,   max: 3,   type: 'number' },
    'geopolitical.southAmericaOps':     { min: 0,   max: 3,   type: 'number' },
    'geopolitical.sanctionsActive':     { type: 'boolean' },
    'geopolitical.oilCrisis':           { type: 'boolean' },
    'geopolitical.recessionDeclared':   { type: 'boolean' },
    'geopolitical.chinaRelations':      { min: -3,  max: 3,   type: 'number' },
    'geopolitical.gulfEscalation': { min: 0,   max: 3,   type: 'number' },
    'geopolitical.russianCrisis':     { min: 0,   max: 3,   type: 'number' },
    'geopolitical.straitClosed':        { type: 'boolean' },
    // geopolitical.taiwanBlockade is RACE-OWNED (strait.js sets it; main.js mirrors
    // it read-only) -- deliberately NOT whitelisted, so a structured effect cannot
    // forge the Taiwan blockade. Hormuz's `straitClosed` (Gulf arc) stays writable.
    // fed
    'fed.hikeCycle':                    { type: 'boolean' },
    'fed.cutCycle':                     { type: 'boolean' },
    'fed.qeActive':                     { type: 'boolean' },
    'fed.hartleyFired':                 { type: 'boolean' },
    'fed.vaneAppointed':                { type: 'boolean' },
    'fed.credibilityScore':             { min: 0,   max: 10,  type: 'number' },
    // investigations
    'investigations.tanBowmanStory':    { min: 0,   max: 3,   type: 'number' },
    'investigations.tanNsaStory':       { min: 0,   max: 3,   type: 'number' },
    'investigations.okaforProbeStage':  { min: 0,   max: 3,   type: 'number' },
    'investigations.impeachmentStage':  { min: 0,   max: 3,   type: 'number' },
    // election
    'election.midtermComplete':         { type: 'boolean' },
    'election.barronApproval':          { min: 0,   max: 100, type: 'number' },
    'election.lobbyMomentum':           { min: -3,  max: 3,   type: 'number' },
    'election.primarySeason':           { type: 'boolean' },
    'election.okaforRunning':           { type: 'boolean' },
    // media
    'media.tanCredibility':             { min: 0,   max: 10,  type: 'number' },
    'media.sentinelRating':             { min: 0,   max: 10,  type: 'number' },
    'media.pressFreedomIndex':          { min: 0,   max: 10,  type: 'number' },
    'media.leakCount':                  { min: 0,   max: 5,   type: 'number' },
    // factions
    'factions.firmStanding':            { min: 0,   max: 100, type: 'number' },
    'factions.regulatoryExposure':      { min: 0,   max: 100, type: 'number' },
    'factions.federalistSupport':       { min: 0,   max: 100, type: 'number' },
    'factions.farmerLaborSupport':      { min: 0,   max: 100, type: 'number' },
    'factions.mediaTrust':              { min: 0,   max: 100, type: 'number' },
    'factions.fedRelations':            { min: 0,   max: 100, type: 'number' },
    'factions.safetyNetworkTrust':      { min: 0,   max: 100, type: 'number' },
    'factions.labRelations':            { min: 0,   max: 100, type: 'number' },
    // ai-policy domain (phase 5a). controlRegime / reportingRegime are race-owned
    // MIRRORS -- deliberately NOT whitelisted, so structured effects cannot forge
    // the regime (race-state.js stays the sole authority).
    'ai.exportControlStage':            { min: 0,   max: 3,   type: 'number' },
    'ai.treatyStage':                   { min: 0,   max: 4,   type: 'number' },
    'ai.wonderCount':                   { min: 0,   max: 100, type: 'number' },
};

// -- Apply structured effects from LLM -----------------------------------
// effects: [{ path, op, value }, ...]
// op: 'add' | 'set'
// Skips unknown paths and unknown ops. Clamps numbers, coerces booleans.

export function applyStructuredEffects(world, effects) {
    if (!Array.isArray(effects)) return;
    for (const effect of effects) {
        const { path, op, value } = effect;
        const range = WORLD_STATE_RANGES[path];
        if (!range) continue;                  // not in whitelist
        if (op !== 'add' && op !== 'set') continue;

        // Navigate to parent object and leaf key
        const parts = path.split('.');
        const leafKey = parts[parts.length - 1];
        let obj = world;
        let valid = true;
        for (let i = 0; i < parts.length - 1; i++) {
            if (obj == null || typeof obj !== 'object') { valid = false; break; }
            obj = obj[parts[i]];
        }
        if (!valid || obj == null) continue;

        if (range.type === 'boolean') {
            const boolVal = Boolean(value);
            obj[leafKey] = boolVal;
        } else if (range.type === 'enum') {
            // Enum: categorical state with no ordering, so 'add' is undefined.
            // Only accept 'set' with a value from the whitelist.
            if (op !== 'set') continue;
            if (!range.values.includes(value)) continue;
            obj[leafKey] = value;
        } else {
            // numeric
            const current = typeof obj[leafKey] === 'number' ? obj[leafKey] : 0;
            let next = op === 'add' ? current + value : value;
            next = Math.max(range.min, Math.min(range.max, next));
            obj[leafKey] = next;
        }
    }
}
