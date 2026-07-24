/* ===================================================
   src/events/china.js -- "China in the dark" arc
   (overhaul phase 5a SKELETON + strait machinery shells).

   Two kinds of content live here:

   1. STRAIT MACHINERY SHELLS (wired, fire NOW via the race
      bridge on race.lastTransitions.strait): gray-zone
      scares, a blockade superevent, and the blockade-lifted
      relief beat. Their prose is a placeholder; the MACHINERY
      is real (strait.js generates the beats, bridgeStrait
      fires these shells). Token-free prose -> the bridge's
      finalize just picks/capitalizes.

   2. CHINA-ARC SEED EVENTS (skeleton, DORMANT): export-control
      politics and the domestic Tianxia constituency. Category
      'china' is Poisson-EXCLUDED (events.js _PULSE_CATEGORIES),
      so these do not fire until the content rounds wire them.

   PROSE: coordinator. Every player-facing string is a terse
   placeholder ("[P] ...") for the coordinator to replace with
   final prose. Followup-chain topology is sketched; only 1-2
   real seed events plus the machinery shells.

   MARKET COUPLING (03/P4): race-bridge-fired shells carry
   `impulse` (a DECAYING overlay), never permanent `params`
   deltas -- same rule as race-events.js. Magnitudes are the
   rev-1 sign intents (UNRATIFIED).
   =================================================== */

export const CHINA_EVENTS = [
    // ---- Strait machinery shells (bridge-fired on strait.js beats) --------
    {
        id: 'strait_grayzone',
        category: 'strait',
        magnitude: 'minor',
        // PROSE: coordinator
        headline: '[P] Gray-zone incident near the median line: a Cambria-flagged tender, a coast-guard ram, a risk premium that was not there yesterday.',
        params: {},                    // no permanent delta (03 incident-coupling rule)
        impulse: { xi: 0.006 },        // decaying (P4): a hair of tail premium, no direction
    },
    {
        id: 'strait_blockade',
        category: 'strait',
        popup: true,
        superevent: true,
        magnitude: 'major',
        // PROSE: coordinator
        headline: '[P] BLOCKADE. Beijing closes the water off Hsinchu. The fabs are a hundred miles from a shooting gallery, and the compute curve knows it before the Pentagon says it.',
        params: {},                    // no permanent delta (03 incident-coupling rule)
        impulse: { mu: -0.05, xi: 0.05, lambda: 0.8 },   // decaying (P4): compute crunch hits HCN, vol/jump up
        choices: [
            // PROSE: coordinator
            { label: '[P] Acknowledge', desc: '[P] The compute book reprices force-majeure. The desk marks and waits.' },
        ],
        followups: [{ id: 'strait_postmortem', mtth: 20 }],
    },
    {
        id: 'strait_blockade_lifted',
        category: 'strait',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] The blockade lifts. The near curve exhales; the far tail does not fully un-price what it just learned.',
        params: {},                    // no permanent delta (03 incident-coupling rule)
        impulse: { mu: 0.02, xi: -0.02 },   // decaying (P4): relief rally, tail bleeds
    },
    {
        id: 'strait_postmortem',
        followupOnly: true,
        category: 'strait',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] The after-action on the blockade week: what the curve priced, what the desks lost, and the standing premium that never goes back to zero.',
        params: {},
        impulse: { xi: 0.004 },
    },

    // ---- China-arc seed events (skeleton, DORMANT until content rounds) ----
    {
        id: 'china_export_controls',
        category: 'china',
        popup: true,
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] The administration tightens chip export controls — and the domestic Tianxia constituency lobbies against its own government.',
        // PROSE: coordinator
        context: '[P] American firms built on free Cangjie weights want the chips to keep flowing. The controls bind silicon, never weights already released. Where do you stand?',
        choices: [
            {
                // PROSE: coordinator
                label: '[P] Back the controls',
                desc: '[P] Slow Tianxia; heat the China arcs; buy a little comfort-margin (the reluctant-accelerationist trap).',
                effects: [{ path: 'ai.exportControlStage', op: 'add', value: 1 }],
                playerFlag: 'lobbied_export_controls',
                followups: [{ id: 'china_controls_backlash', mtth: 30 }],
            },
            {
                // PROSE: coordinator
                label: '[P] Fight the controls',
                desc: '[P] Side with the domestic constituency; the chips keep flowing.',
                playerFlag: 'lobbied_deregulation',
            },
        ],
    },
    {
        id: 'china_controls_backlash',
        followupOnly: true,
        category: 'china',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] Beijing answers the controls — the trade war ratchets, and the strait tension with it.',
        params: {},
    },
];
