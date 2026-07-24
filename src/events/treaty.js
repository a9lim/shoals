/* ===================================================
   src/events/treaty.js -- The Reykjavik Framework treaty
   track (overhaul phase 5a SKELETON) -- AI 2040-shaped.

   Verification talks surface early and die of farce (the
   summit collapses over seating protocol). Mid-game,
   compute-reporting groundwork (player-lobbyable) keeps the
   door ajar. Act III: the window -- one live negotiation, its
   viability SECRETLY gated on chinaTrue.dealPossible (the
   latent in the race sampler) and PUBLICLY gated on nobody
   having a bad incident during summit week. Mostly it fails;
   the failure should feel like the world's fault, not the
   dice's.

   1-2 seeds, DORMANT (category 'treaty' Poisson-excluded).
   The arc advances race.treaty.{stage,discovered,initiated,
   summitDay} and world.ai.treatyStage; the discovery roll
   (02a: 0.65/run) draws from race.streams.treaty when the
   content lands. Effects here NEVER read the latent
   dealPossible directly -- the discovery event does, once,
   in content.

   PROSE: coordinator (all "[P] ..." placeholders).
   =================================================== */

export const TREATY_EVENTS = [
    {
        id: 'treaty_talks_farce',
        category: 'treaty',
        magnitude: 'minor',
        // PROSE: coordinator. Satire register: the summit collapses over seating protocol.
        headline: '[P] Verification talks surface, and die of farce — the summit collapses over seating protocol. The door is not open, but it is not welded shut either.',
        effects: [{ path: 'ai.treatyStage', op: 'set', value: 1 }],
        params: {},
    },
    {
        id: 'treaty_window',
        category: 'treaty',
        popup: true,
        magnitude: 'major',
        // PROSE: coordinator. Act III: the one live negotiation. Gated (secret) on
        // chinaTrue.dealPossible, (public) on no bad incident summit week.
        headline: '[P] The window: one live negotiation. Compute-reporting groundwork kept the door ajar; summit week begins.',
        // PROSE: coordinator
        context: '[P] Verification, mutually assured compute destruction, the long plateau. Your fingerprints (compute-reporting lobbying, the leak that did not happen) are on this. What do you counsel?',
        choices: [
            // PROSE: coordinator
            { label: '[P] Counsel the deal', desc: '[P] One voice among several. The room is influence, not authorship.', playerFlag: 'counseled_deal',
              factionShifts: [{ faction: 'safetyNetworkTrust', value: 5 }] },
            // PROSE: coordinator
            { label: '[P] Counsel against', desc: '[P] Verification is unverifiable; racing is the only equilibrium.', playerFlag: 'counseled_no_deal' },
        ],
        followups: [{ id: 'treaty_resolution', mtth: 20 }],
    },
    {
        id: 'treaty_resolution',
        followupOnly: true,
        category: 'treaty',
        magnitude: 'major',
        // PROSE: coordinator. Mostly fails; when it holds, sets ai.treatyStage -> implemented.
        headline: '[P] The summit resolves. Mostly the world’s fault when it fails; when it holds, markets become boring again and the wonders arrive slower, argued over, chosen.',
        params: {},
    },
];
