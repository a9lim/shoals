/* ===================================================
   src/events/treaty.js -- The Reykjavik Framework treaty
   track (overhaul phase 5; prose landed content round 6) --
   AI 2040-shaped.

   Verification talks surface early and die of farce.
   Mid-game, compute-reporting groundwork (player-lobbyable)
   keeps the door ajar. Act III: the window -- one live
   negotiation, its viability SECRETLY gated on
   chinaTrue.dealPossible and PUBLICLY gated on nobody having
   a bad incident during summit week. Mostly it fails; the
   failure should feel like the world's fault, not the dice's.

   WIRING (round 6): category 'treaty' is Poisson-live for
   the texture (talks_farce, groundwork). `treaty_window` is
   gated on `world.ai.summitLive`, which NOTHING sets today
   -- it is the one declared seam for the Act-III summit
   machinery (P6/P7), which owns the standing check, the
   dealPossible discovery roll (race.streams.treaty, 02a),
   and summit-week incident gating. The HOLDS branch of the
   resolution also lands with that machinery (its prose is
   the coordinator's then, like all prose); today's
   `treaty_resolution` is the common case -- the failure.
   Effects here NEVER read the latent dealPossible.
   =================================================== */

export const TREATY_EVENTS = [
    {
        id: 'treaty_talks_farce',
        category: 'treaty',
        likelihood: 1,
        magnitude: 'minor',
        when: (sim, world) => world.ai.treatyStage <= 1,
        headlines: [
            'Verification talks convene in Geneva and survive four hours. The collapse is officially "scheduling"; unofficially, the delegations could not agree on the seating protocol for observers from a country neither would name. The communiqué commits both sides to "continued dialogue on modalities," a phrase diplomats use the way doctors use "we are keeping her comfortable."',
            'The working group on frontier-compute transparency releases its interim report: forty pages, of which thirty-one are reservations appended by the parties to the other nine. The Brief notes that the acronym for the mutual-deterrence annex is, regrettably, MACD, and that the desk finds this funnier than anyone at State does. The door does not open. It is, however, not welded.',
            'A track-two dialogue in Singapore — retired officials, unofficial, deniable — produces the era’s most substantive verification framework to date, and produces it into a void: neither capital acknowledges the meeting occurred. The paper circulates anyway, samizdat-style, among the forty people who matter. One of them annotates it and sends it back. The annotations are the news, for those who can see them.',
        ],
        effects: [{ path: 'ai.treatyStage', op: 'set', value: 1 }],
        params: {},
        impulse: { xi: 0.003 },   // decaying (P4): hope, priced in basis points
    },
    {
        id: 'treaty_groundwork',
        category: 'treaty',
        likelihood: 0.8,
        popup: true,
        magnitude: 'moderate',
        when: (sim, world) => world.ai.treatyStage === 1 && world.ai.frontierRung >= 2,
        headline: 'Whitfield’s Compute Transparency Act — the domestic prerequisite every serious framework sketch assumes — is alive again in committee, quietly, with a markup date. It mandates reporting of large training runs to a federal registry: not control, not caps, just the national accounting without which no verification regime has anything to verify. The labs are split; the hawks are split; the bill’s fate is, for once, genuinely undetermined, which is Washington for "purchasable."',
        context: 'Nobody negotiating in Geneva will say it on the record, but the door the farce keeps failing to open needs a hinge, and this is the hinge: a country that cannot count its own compute cannot offer to have it counted. Backing it costs standing with the accelerationists and buys the one precondition the window will someday need. If the window ever comes. The whole trade is a long-dated option on a summit nobody has scheduled.',
        choices: [
            {
                label: 'Lean on the markup',
                desc: 'Put the fund’s weight behind the registry. The door stays ajar, and your fingerprints are on the hinge.',
                effects: [{ path: 'ai.treatyStage', op: 'set', value: 2 }],
                factionShifts: [
                    { faction: 'safetyNetworkTrust', value: 3 },
                    { faction: 'federalistSupport', value: -1 },
                ],
                playerFlag: 'lobbied_compute_transparency',
                resultToast: 'The bill clears markup. A Geneva-datelined wire story uses the word "groundwork" for the first time in a year.',
            },
            {
                label: 'Stay out of it',
                desc: 'Registries become caps, caps become allocation, allocation becomes politics. The desk declines to build the machinery of its own constraint.',
                playerFlag: 'declined_compute_transparency',
                resultToast: 'The markup slips. The door neither opens nor closes, which is also a policy.',
            },
        ],
    },
    {
        id: 'treaty_window',
        category: 'treaty',
        popup: true,
        magnitude: 'major',
        // Fired only when the Act-III summit machinery opens the window; the
        // machinery owns standing, dealPossible discovery, and summit-week gating.
        when: (sim, world) => world.ai.summitLive === true,
        headline: 'THE WINDOW. Reykjavik, of all places, because nobody could object to it — one live negotiation, heads of delegation with actual authority, verification text on the table that the track-two people would recognize as their own. The groundwork held: the registry exists, the hinge turns. Summit week begins with the whole race holding its breath, which is to say: with every desk on earth watching an event risk that has no hedge and no comparable.',
        context: 'Verification, mutually assured compute destruction, the long plateau — the future where markets get boring again and the wonders arrive slower, argued over, chosen. Your fingerprints are on this: the registry lobbying, the channels kept warm, the leak that did not happen. You have a voice in the American delegation’s prep room. One voice among several. The room is influence, not authorship — and the other side’s true position is the best-kept secret of the era.',
        choices: [
            {
                label: 'Counsel the deal',
                desc: 'Take the plateau. The race has been the risk all along; the deal is the only trade that retires it.',
                playerFlag: 'counseled_deal',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 5 }],
                // Choice-level scheduling: ordinary popups never schedule
                // top-level followups (content-gate finding). Both counsels
                // reach the same resolution -- the room is influence, not
                // authorship.
                followups: [{ id: 'treaty_resolution', mtth: 20 }],
            },
            {
                label: 'Counsel against',
                desc: 'Verification is unverifiable; a deal you cannot audit is a head start you gift-wrap. Racing is the equilibrium that tells the truth.',
                playerFlag: 'counseled_no_deal',
                factionShifts: [{ faction: 'federalistSupport', value: 3 }],
                followups: [{ id: 'treaty_resolution', mtth: 20 }],
            },
        ],
    },
    {
        id: 'treaty_resolution',
        followupOnly: true,
        category: 'treaty',
        magnitude: 'major',
        headline: 'The summit ends with a communiqué that history will file under almost. Not the dice — the world: a legislature that would not pre-ratify, an incident report that surfaced with the worst possible timestamp, a delegation recalled two days early for reasons that will stay classified until nobody cares. The verification annex survives as a "reference text." The planes go home. The race, which paused out of something like courtesy, resumes at the cadence it never actually left — and the desk, which briefly priced a boring future, takes the premium back off.',
        params: {},
        impulse: { mu: -0.02, xi: 0.02 },   // decaying (P4): the plateau un-prices
    },
];
