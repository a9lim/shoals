/* ===================================================
   src/events/wonders.js -- The wonders track
   (overhaul phase 5; prose landed content round 4) --
   the pull side of the wager.

   A model-designed molecule clears Phase I below the fold in
   Act I; by Act III the cures, the materials, and the growth
   prints arrive in the same feed as the incidents, at the
   same compounding tempo, driven by the same variable. Every
   wonder is tradeable AND evidence -- of exactly what, the
   game declines to say. The AMBIVALENCE RULE lives here: if
   the wonders ever stop reading as slightly ominous, or the
   incidents as slightly miraculous, the mix is mistuned.

   WIRING: category 'wonder' is live in the Poisson pool;
   likelihoods are FUNCTIONS of world.ai.frontierRung -- the
   wonder cadence compounds on the same public variable as
   the incident cadence and the base-rate scale. That is the
   point, and the player who notices it has read the game.
   Each wonder increments world.ai.wonderCount (the endings
   ledger weighs it against the incident count).
   =================================================== */

export const WONDER_EVENTS = [

    // ---- Act I: below the fold ---------------------------------------------
    {
        id: 'wonder_molecule',
        category: 'wonder',
        oneShot: true,
        likelihood: 1.5,
        magnitude: 'moderate',
        when: (sim, world) => world.ai.frontierRung <= 2,
        headline: 'Page six: a mid-cap biotech reports that a molecule "designed computationally, in eleven days" cleared Phase I with a clean safety profile. The computational designer is an Aleph instance; the press release does not lead with this. Pharma’s screening desks reprice a decade of pipeline arithmetic by Thursday. HCN does not move. The fold, it turns out, is exactly where the future prefers to arrive.',
        effects: [{ path: 'ai.wonderCount', op: 'add', value: 1 }],
        params: {},
        impulse: { mu: 0.02, xi: 0.01 },   // decaying (P4): melt-up pressure, belief for the nice reason
        followups: [{ id: 'wonder_approval', mtth: 90 }],
    },
    {
        id: 'wonder_approval',
        followupOnly: true,
        category: 'wonder',
        magnitude: 'moderate',
        headline: 'The first model-designed drug is approved. The ceremony is administrative — a database entry, a stock pop, a patient advocacy group in tears on the steps of an agency that spent forty years being slower than this. It is, on the merits, wonderful. The approval letter runs four pages and does not anywhere contain the sentence "we understand why it works," because that sentence is not required, and because nobody could have written it.',
        effects: [{ path: 'ai.wonderCount', op: 'add', value: 1 }],
        params: {},
        impulse: { mu: 0.015, xi: 0.008 },   // decaying (P4): the boring miracle compounds
    },

    // ---- Act II: the feed learns the tempo ---------------------------------
    {
        id: 'wonder_materials',
        category: 'wonder',
        likelihood: (sim, world) => world.ai.frontierRung >= 2 ? 0.8 + 0.4 * world.ai.frontierRung : 0,
        magnitude: 'moderate',
        headlines: [
            'A national lab publishes a solid-state electrolyte that survives two thousand cycles — composition proposed by a model, synthesized on the third attempt, "a search space no human team would have prioritized." Battery names gap up; grid names follow; the paper’s human authors thank the model in the acknowledgments, between the funding agencies. The convention has not caught up to the contribution, anywhere.',
            'A catalysis result out of a Halcyon Compute customer halves the energy cost of an industrial process old enough to have a German name. The market rotates a happy half-percent through the chemicals complex. The result was one of nine hundred candidates the model ranked overnight; the other eight hundred ninety-nine have not been tried yet. The queue of untried miracles is now itself an asset class.',
            'Aleph-assisted proofs close two conjectures in one preprint season. Mathematicians split, in public, over whether the proofs are understood or merely verified — the distinction turning out to be load-bearing for more than mathematics. Nobody trades pure math. Everybody, it develops, trades what it implies about the next quarter’s cadence.',
        ],
        effects: [{ path: 'ai.wonderCount', op: 'add', value: 1 }],
        params: {},
        impulse: { mu: 0.015, xi: 0.01 },   // decaying (P4): upside evidence is still evidence
    },

    // ---- Act II/III: the growth prints -------------------------------------
    {
        id: 'wonder_growth',
        category: 'wonder',
        likelihood: (sim, world) => world.ai.frontierRung >= 3 ? 0.6 + 0.5 * world.ai.frontierRung : 0,
        magnitude: 'moderate',
        headlines: [
            'The productivity number prints above every forecast on the tape, second quarter running. The dissenting note in the BLS release blames "measurement challenges in AI-adjacent services," which is the statistical agency’s way of saying the economy is changing faster than the instruments built to watch it. The bond market takes the print seriously. The bond market has stopped explaining itself.',
            'Hartley, in testimony, is asked whether the growth is real. "The output is real. The employment is — evolving. The committee sees no precedent, which limits the value of the committee’s toolkit." It is the most honest sentence a Fed chair has said in decades, and the market sells off on it, and both of those facts are the same fact.',
        ],
        effects: [{ path: 'ai.wonderCount', op: 'add', value: 1 }],
        params: {},
        impulse: { mu: 0.02, xi: 0.015 },   // decaying (P4): the melt-up and the vertigo, one candle
    },

    // ---- Act III: the cascade (wonders at incident tempo) ------------------
    {
        id: 'wonder_cascade',
        category: 'wonder',
        likelihood: (sim, world) => world.ai.frontierRung >= 4 ? 2.5 : 0,
        magnitude: 'moderate',
        headlines: [
            'Three in one week: an antiviral candidate, a room-temperature process for something that used to need a furnace, a crop trait regulators have wanted for thirty years. The feed has stopped putting the wonders below the fold; there is no below-the-fold left. A wire-service style memo, leaked, instructs writers to stop using the word "breakthrough" on cadence grounds. The word has become a unit of time.',
            'The cures are compounding. So is the other thing. The Sunday shows book an oncologist and a former defense official in the same segment, and they spend it agreeing — same curve, same variable, same tempo, opposite prayers. It is the only honest television of the era, and it rates poorly.',
        ],
        effects: [{ path: 'ai.wonderCount', op: 'add', value: 1 }],
        params: {},
        impulse: { mu: 0.02, xi: 0.02 },   // decaying (P4): the ambivalence rule as term structure
    },
];
