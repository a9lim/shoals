/* ===================================================
   src/events/policy.js -- Government policy + the
   controlRegime ratchet + reporting regime + Consensus
   disputes (overhaul phase 5a machinery shells + skeleton).

   MACHINERY SHELLS (wired, fire NOW):
   - regime_* : fired by the race bridge on
     race.lastTransitions.regimeChange (the controlRegime
     ratchet in control-regime.js -> setControlRegime). Each
     transition also does the real work in the settlement
     machinery (Consensus/compute freeze, decree, fallback);
     these shells are the NARRATIVE around it.
   - dispute_* : fired by main.js when the Consensus dispute
     lifecycle transitions (consensus.js openDispute /
     ruleDispute / deadline-fallback; adjudicator succession
     exchange panel -> federal evals office -> fallback per 09).
   - reporting_regime_enacted : a POLICY LEVER whose choice
     carries `_applyReportingRegime` -- main.js calls
     applyReportingRegime(race) (the retroactive-once P2
     machinery). Dormant until lobbying/content triggers it.

   SKELETON SEEDS (DORMANT): the government-flail satire pulse.
   Category 'policy'/'regime'/'dispute' are Poisson-EXCLUDED, so
   nothing here random-fires; the machinery shells fire only via
   the bridge / main.js hooks.

   PROSE: coordinator (all "[P] ..." placeholders).
   Race-bridge-fired shells carry decaying `impulse`, never
   permanent `params` (03 incident-coupling rule); UNRATIFIED
   magnitudes.
   =================================================== */

export const POLICY_EVENTS = [
    // ---- controlRegime ratchet shells (bridge-fired on tr.regimeChange) ---
    {
        id: 'regime_supervised',
        category: 'regime',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] The czar announces supervision. The frontier now files with the government; the disclosures get thicker and the timelines do not.',
        params: {},
        impulse: { xi: 0.01 },   // decaying (P4): mild uncertainty
    },
    {
        id: 'regime_mobilized',
        category: 'regime',
        popup: true,
        superevent: true,
        magnitude: 'major',
        // PROSE: coordinator
        headline: '[P] MOBILIZATION. The government takes the wheel. Consensus freezes; the successor adjudicator keeps settling; the mobilization memo is, of course, ghostwritten.',
        params: {},
        impulse: { mu: -0.03, xi: 0.03 },   // decaying (P4): the state intervenes, vol up
        choices: [
            // PROSE: coordinator
            { label: '[P] Acknowledge', desc: '[P] The Consensus classes halt. Positions mark to the risk surface.' },
        ],
    },
    {
        id: 'regime_nationalized',
        category: 'regime',
        popup: true,
        superevent: true,
        magnitude: 'major',
        // PROSE: coordinator
        headline: '[P] NATIONALIZATION. HCN converts to a compensation claim at the published reference. The nationalization trade was a bet on a distribution, and the distribution just printed.',
        params: {},
        impulse: { mu: -0.06, xi: 0.04 },   // decaying (P4): conversion shock
        choices: [
            // PROSE: coordinator
            { label: '[P] Acknowledge', desc: '[P] Shares become claims. The book settles into the closeout matrix.' },
        ],
    },
    {
        id: 'regime_classified',
        category: 'regime',
        popup: true,
        superevent: true,
        magnitude: 'major',
        // PROSE: coordinator
        headline: '[P] CLASSIFICATION. Disclosure becomes a secret. The tape goes dark, the insider channel goes gold, and Consensus settles to fallback for everyone alike.',
        params: {},
        impulse: { mu: -0.05, xi: 0.04 },   // decaying (P4): information blackout
        choices: [
            // PROSE: coordinator
            { label: '[P] Acknowledge', desc: '[P] The screens stop meaning what they meant. The desk marks the fallback.' },
        ],
    },

    // ---- Consensus dispute shells (main.js-fired on the dispute lifecycle) --
    {
        id: 'dispute_opened',
        category: 'dispute',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] A Consensus settlement is disputed. Trading in the contract halts; the adjudicator has until the dispute deadline to rule, or it falls back.',
        params: {},
    },
    {
        id: 'dispute_ruled',
        category: 'dispute',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] The adjudicator rules. The disputed contract settles on the panel’s word, at or before the deadline.',
        params: {},
    },
    {
        id: 'dispute_fallback',
        category: 'dispute',
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] The dispute deadline passes with no ruling. The contract settles at its listed fallback — no indefinite limbo, no cost-basis payout.',
        params: {},
    },

    // ---- Reporting-regime lever (policy choice -> applyReportingRegime) -----
    {
        id: 'reporting_regime_enacted',
        category: 'policy',
        popup: true,
        magnitude: 'moderate',
        // PROSE: coordinator
        headline: '[P] Mandatory incident reporting becomes law.',
        // PROSE: coordinator
        context: '[P] Detection lags shorten and the never-detected tail thins — a safer world, and a thinner edge. The pending latents re-roll under the improved parameters (the disclosure wave). Enact it?',
        choices: [
            {
                // PROSE: coordinator
                label: '[P] Enact the reporting regime',
                desc: '[P] Lobby your own alpha away: incidents surface faster from here, retroactively for the ones already latent.',
                _applyReportingRegime: true,
                playerFlag: 'lobbied_evals_regime',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 8 }],
            },
            {
                // PROSE: coordinator
                label: '[P] Let it die in committee',
                desc: '[P] The lag is your edge. Keep it.',
            },
        ],
    },

    // ---- Government-flail satire seed (DORMANT skeleton) --------------------
    {
        id: 'gov_flail_seed',
        category: 'policy',
        magnitude: 'minor',
        // PROSE: coordinator
        headline: '[P] A hearing convenes about the wrong thing; an evals office is defunded the week it matters; a rule bans chips and rediscovers, in public, that weights do not un-release.',
        params: {},
    },
];
