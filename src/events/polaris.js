/* ===================================================
   src/events/polaris.js -- The Polaris schism arc
   (overhaul phase 5a SKELETON).

   A scaling decision goes the wrong way; the walkout is a
   superevent; the founding sets up the fund-as-actor wager
   (04). Polaris as conscience, competitor, and compute-
   starved supplicant -- and, in some worlds, the margin-
   carrier that matters at resolution. 1-2 seeds, DORMANT
   (category 'polaris' Poisson-excluded) until the content
   rounds wire the walkout to the race's Polaris spawn.

   PROSE: coordinator (all "[P] ..." placeholders).
   =================================================== */

export const POLARIS_EVENTS = [
    {
        id: 'polaris_walkout',
        category: 'polaris',
        popup: true,
        superevent: true,
        magnitude: 'major',
        // PROSE: coordinator. Fires around the race's Polaris spawn (~day 400).
        headline: '[P] THE WALKOUT. A scaling decision goes the wrong way, and the careful ones leave to found Polaris. The wager now has a second actor.',
        params: {},
        impulse: { xi: 0.02 },   // decaying (P4): the field fractures, vol up
        choices: [
            // PROSE: coordinator
            { label: '[P] Watch it happen', desc: '[P] The board fight is not yours yet. The book notes the new variable.' },
        ],
        followups: [{ id: 'polaris_supplicant', mtth: 60 }],
    },
    {
        id: 'polaris_supplicant',
        followupOnly: true,
        category: 'polaris',
        popup: true,
        magnitude: 'moderate',
        // PROSE: coordinator. The fund-as-actor hook (gated on F + credibility later).
        headline: '[P] Polaris comes to the desk: compute-starved, careful, and asking. Backing the careful racer might split the West’s lead — fatally, or not. The game refuses to say which.',
        // PROSE: coordinator
        context: '[P] This is the wager expressed purest. Fund-as-actor is gated on firm belief and credibility; the choice surfaces only when you have earned it.',
        choices: [
            // PROSE: coordinator
            { label: '[P] Hear them out', desc: '[P] Note it for the fund-as-actor menu.', playerFlag: 'backed_polaris_interest' },
            // PROSE: coordinator
            { label: '[P] Not our mandate', desc: '[P] The desk trades the race; it does not run it.' },
        ],
    },
];
