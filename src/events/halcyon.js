/* ===================================================
   src/events/halcyon.js -- Halcyon (the lab) arc
   (overhaul phase 5a SKELETON).

   The frontier lab whose common stock IS the game's chart
   underlying (HCN). Release-ladder headlines already flow
   through the race bridge (race-events.js release shells);
   this file holds the LAB-FLAVOR beats the bridge does not:
   the Fixedpoint half-sentences, the keynote, the internal-
   vs-released gap the market refuses to read. 1-2 seeds,
   DORMANT (category 'halcyon' is Poisson-excluded) until the
   content rounds wire them.

   PROSE: coordinator (all "[P] ..." placeholders).
   =================================================== */

export const HALCYON_EVENTS = [
    {
        id: 'halcyon_fixedpoint_hint',
        category: 'halcyon',
        magnitude: 'minor',
        // PROSE: coordinator. The Act-I seed that Act-III makes deafening.
        headline: '[P] A half-sentence in the Meridian Brief: "Fixedpoint." No gloss. The cadence arithmetic never decelerates, and almost nobody is doing the arithmetic.',
        params: {},
        impulse: { xi: 0.004 },   // decaying (P4): a flicker of vol nobody can source
    },
    {
        id: 'halcyon_keynote',
        category: 'halcyon',
        popup: true,
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] Aleph keynote: the loud capability, the quiet one that matters more, and the number they did not publish.',
        // PROSE: coordinator
        context: '[P] The internal build is a different animal, per two people familiar. The gap between what ships and what runs is where the trade lives. How do you position?',
        choices: [
            // PROSE: coordinator
            { label: '[P] Buy the gap', desc: '[P] Long the internal track the market prices a rung late.', playerFlag: 'long_frontier',
              followups: [{ id: 'halcyon_gap_resolves', mtth: 40 }] },
            // PROSE: coordinator
            { label: '[P] Fade the hype', desc: '[P] The claim is marketing until the audit says otherwise.' },
        ],
    },
    {
        id: 'halcyon_gap_resolves',
        followupOnly: true,
        category: 'halcyon',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] The internal-vs-released gap resolves — certification lands, and the rung claim the cadence implied becomes collateral.',
        params: {},
    },
];
