/* ===================================================
   src/events/wonders.js -- The wonders track
   (overhaul phase 5a SKELETON) -- the pull side of the wager.

   A model-designed molecule clears Phase I below the fold in
   Act I; by Act III the cures, the materials, and the growth
   prints arrive in the same feed as the incidents, at the
   same compounding tempo, driven by the same variable. Every
   wonder is tradeable (sector rotation, a binary settling
   YES) AND evidence -- of exactly what, the game declines to
   say. The AMBIVALENCE RULE lives here: if the wonders ever
   stop reading as slightly ominous, or the incidents as
   slightly miraculous, the mix is mistuned.

   1-2 seeds, DORMANT (category 'wonder' Poisson-excluded)
   until the content rounds tie wonder cadence to the race
   variable. Each wonder increments world.ai.wonderCount.

   PROSE: coordinator (all "[P] ..." placeholders).
   =================================================== */

export const WONDER_EVENTS = [
    {
        id: 'wonder_molecule',
        category: 'wonder',
        magnitude: 'moderate',
        // PROSE: coordinator. Play the good news one step too quiet, one step too ominous.
        headline: '[P] A model-designed molecule clears Phase I — below the fold. Pharma rallies before it moves HCN. Upside evidence and risk evidence are the same trade with different signs.',
        effects: [{ path: 'ai.wonderCount', op: 'add', value: 1 }],
        params: {},
        impulse: { mu: 0.02, xi: 0.01 },   // decaying (P4): the melt-up pressure of belief-for-the-nice-reason
        followups: [{ id: 'wonder_approval', mtth: 90 }],
    },
    {
        id: 'wonder_approval',
        followupOnly: true,
        category: 'wonder',
        magnitude: 'moderate',
        // PROSE: coordinator. Could settle a "first model-designed drug approved" binary YES.
        headline: '[P] The first model-designed drug is approved. The boring miracle of a world that persists and compounds — indistinguishable, still, from the hazard one step away.',
        effects: [{ path: 'ai.wonderCount', op: 'add', value: 1 }],
        params: {},
    },
];
