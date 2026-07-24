/* ===================================================
   src/events/insider.js -- The insider channel
   (overhaul phase 5a SKELETON) -- tips.js successor,
   elevated to the game's moral core (04).

   A safety-researcher source network grown through standing
   (factions.safetyNetworkTrust). Tips arrive: eval results
   before disclosure, margin burned to make a launch date, the
   Fixedpoint codename. THREE VERBS per tip, each a DISTINCT
   SIGNATURE across P&L, `B`, `heat`, personal legal exposure,
   and the source's fate:
     - TRADE IT : P&L + personal legal exposure (regulatory).
     - LEAK IT  : to Rachel Tan -> `B` moves, mediaTrust up,
                  the source's fate at risk (whistleblower).
     - SIT ON IT: nothing moves, the source's trust grows
                  (safetyNetworkTrust) -- the channel deepens.
   Sources are characters with followup chains; burning one
   closes the channel.

   1 seed tip + outcome followups, DORMANT (category 'insider'
   Poisson-excluded). In the live game the channel is FED by
   incident insiderTip flags (occurrence->tip, incidents.js) and
   gated on safetyNetworkTrust -- that feed is content-round
   wiring; this is the interaction surface it will drive.

   The `B` / `heat` couplings are the P4/belief channel (leaks
   fold into the bounded alignment sentiment via stepBelief off
   the ledger); noted as `// P4 coupling reference:` and left to
   content, exactly like race-events.js.

   PROSE: coordinator (all "[P] ..." placeholders).
   =================================================== */

export const INSIDER_EVENTS = [
    {
        id: 'insider_tip_seed',
        category: 'insider',
        popup: true,
        magnitude: 'moderate',
        // PROSE: coordinator. The source is a character; the tip is real or sampled.
        headline: '[P] The channel opens: a safety researcher, a detail that is not public yet, a trust you have not fully earned.',
        // PROSE: coordinator
        context: '[P] Eval results before disclosure — or a launch date bought with burned margin, or the Fixedpoint codename. Three ways to hold it, three prices.',
        choices: [
            {
                // TRADE IT -- P&L + personal legal exposure.
                // PROSE: coordinator
                label: '[P] Trade it',
                desc: '[P] Position on the undisclosed. The purest trade, and the most radioactive.',
                playerFlag: 'traded_insider_tip',
                factionShifts: [{ faction: 'regulatoryExposure', value: 12 }],
                // P4 coupling reference: no B move (the market has not learned it) -- pure P&L edge.
                followups: [{ id: 'insider_trade_outcome', mtth: 14 }],
            },
            {
                // LEAK IT -- to Rachel Tan; B moves, mediaTrust up, source at risk.
                // PROSE: coordinator
                label: '[P] Leak it to Tan',
                desc: '[P] Three sources is her rule. You volunteer to be one, with everything that costs — including the source who trusted you.',
                playerFlag: 'leaked_to_tan',
                factionShifts: [
                    { faction: 'mediaTrust', value: 10 },
                    { faction: 'safetyNetworkTrust', value: -8 },   // burning a source strains the network
                ],
                // P4 coupling reference: the leak folds into B's bounded alignment sentiment
                // (0.7*B + 0.3*L, once per evidence ID) via stepBelief -- content wires the id.
                followups: [{ id: 'insider_leak_outcome', mtth: 12 }],
            },
            {
                // SIT ON IT -- nothing moves; the source's trust grows.
                // PROSE: coordinator
                label: '[P] Sit on it',
                desc: '[P] Discretion is a deposit. The channel deepens; the trade you did not make is a position too.',
                playerFlag: 'sat_on_insider_tip',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 10 }],
                // P4 coupling reference: nothing moves -- the ambivalence rule on the insider track.
            },
        ],
    },
    {
        id: 'insider_trade_outcome',
        followupOnly: true,
        category: 'insider',
        magnitude: 'moderate',
        // PROSE: coordinator. Real tip -> P&L; radioactive -> compliance crossfire (meridianExposed path).
        headline: '[P] The tip resolves in the tape — and the compliance file. Positioning on the undisclosed leaves a print somebody can subpoena.',
        params: {},
    },
    {
        id: 'insider_leak_outcome',
        followupOnly: true,
        category: 'insider',
        magnitude: 'moderate',
        // PROSE: coordinator. Tan's credibility ladder moves; the source's fate resolves.
        headline: '[P] Tan runs it. The public pressure builds and the source pays — the whistleblower’s arithmetic, stated in other people’s lives.',
        params: {},
    },
];
