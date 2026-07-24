/* ===================================================
   src/events/policy.js -- Government policy + the
   controlRegime ratchet + reporting regime + Consensus
   disputes (overhaul phase 5; prose landed content round 5).

   MACHINERY SHELLS (bridge/main.js-fired, never Poisson):
   - regime_* : fired by the race bridge on
     race.lastTransitions.regimeChange. Each transition also
     does the real work in the settlement machinery
     (Consensus/compute freeze, decree, fallback); these
     shells are the NARRATIVE around it.
   - dispute_* : fired by main.js on the Consensus dispute
     lifecycle (openDispute / ruleDispute / deadline
     fallback; adjudicator succession per 09).

   POISSON-LIVE ('policy' left the exclusion, round 5):
   - reporting_regime_enacted : the Whitfield-bill lever;
     the choice carries `_applyReportingRegime` (retroactive-
     once disclosure wave). Declining lets it resurface in a
     later season -- bills do that.
   - gov_flail : the satire pulse, one-liner texture per 04.
     The Act-III turn where the flail goes abruptly COMPETENT
     belongs to the 'ghostwritten' arc, not here.

   All prose token-free; shells carry decaying `impulse`,
   never permanent `params` (03 incident-coupling rule).
   =================================================== */

export const POLICY_EVENTS = [
    // ---- controlRegime ratchet shells (bridge-fired on tr.regimeChange) ---
    {
        id: 'regime_supervised',
        category: 'regime',
        magnitude: 'moderate',
        headline: 'The AI czar announces "a new era of partnership between the frontier and the public": quarterly capability filings, security attestations, a standing liaison office with a seal designed faster than its authorities. The frontier now files with the government. The disclosures get thicker immediately; the timelines do not move at all, which both sides privately count as the win.',
        params: {},
        impulse: { xi: 0.01 },   // decaying (P4): mild uncertainty
    },
    {
        id: 'regime_mobilized',
        category: 'regime',
        popup: true,
        superevent: true,
        magnitude: 'major',
        headline: 'MOBILIZATION. The order is signed before the markets open: frontier development continues "under federal direction," a phrase the general counsel of every lab reads four times. Consensus freezes mid-book — open contracts hold, the successor adjudicator keeps settling what matures, and the mobilization memo circulating the agencies is crisp, structured, and, per two people who would know, not written by anyone. The government has taken the wheel of a vehicle it is discovering, at speed, was not built with one.',
        context: 'The Consensus classes halt where they stand; frozen quotes become risk marks, not exits. The compute decree schedule publishes at listed multipliers. What the desk owns, it still owns — what it can do about that has narrowed to what the settlement machinery permits. The instruments were always downstream of the world. Today the world reminded them.',
        params: {},
        impulse: { mu: -0.03, xi: 0.03 },   // decaying (P4): the state intervenes, vol up
        choices: [
            {
                label: 'Mark to the machinery',
                desc: 'Frozen books, live settlements, a successor adjudicator. Note what still pays and what merely still exists.',
            },
        ],
    },
    {
        id: 'regime_nationalized',
        category: 'regime',
        popup: true,
        superevent: true,
        magnitude: 'major',
        headline: 'NATIONALIZATION. The announcement takes ninety seconds and ends a listed company: Halcyon’s frontier assets pass to federal control, and HCN converts to a compensation claim at the published reference times a multiple the market has been pricing as a distribution for months. The distribution just printed. Every desk that ran the nationalization trade finds out, simultaneously, what it was actually long — and the ones who read the reference-window rules closely find the mark exactly where the rules said it would be, which is the only mercy the mechanism offers.',
        context: 'Shares become claims; the book settles into the closeout matrix. There is no more HCN to trade, which resolves a remarkable number of open questions and replaces them with one: what, exactly, does the government now believe it bought — and was the buying about the upside, or the tail?',
        params: {},
        impulse: { mu: -0.06, xi: 0.04 },   // decaying (P4): conversion shock
        choices: [
            {
                label: 'Settle the claim',
                desc: 'The reference was frozen before the halt, the multiple was sampled before you were born, run-wise. The matrix does the rest.',
            },
        ],
    },
    {
        id: 'regime_classified',
        category: 'regime',
        popup: true,
        superevent: true,
        magnitude: 'major',
        headline: 'CLASSIFICATION. The frontier goes dark by statute: capability disclosures end, the filings seal, and repeating certain benchmark numbers in public becomes, as of this morning, a crime with a sentencing range. Consensus settles everything outstanding at fallback — for everyone alike, the rulebook’s one incorruptible sentence. The tape still prints; it just no longer refers to anything. The insider channel does not become more valuable. It becomes the only channel.',
        context: 'The screens stop meaning what they meant. The desk marks the fallback, files the claims, and joins everyone else in the oldest information regime there is: what you can learn is what someone who knows decides to tell you, at their risk, for their reasons.',
        params: {},
        impulse: { mu: -0.05, xi: 0.04 },   // decaying (P4): information blackout
        choices: [
            {
                label: 'Mark the fallback',
                desc: 'The contracts end fairly and blind, which is the design. What the world does next happens off-tape.',
            },
        ],
    },

    // ---- Consensus dispute shells (main.js-fired on the dispute lifecycle) --
    {
        id: 'dispute_opened',
        category: 'dispute',
        magnitude: 'moderate',
        headline: 'A Consensus settlement is formally disputed — the evidence packet contests the oracle reading, trading in the contract halts where it stands, and the adjudicator’s clock starts. Rule by the deadline or the contract takes its listed fallback; the venue’s founding promise is that nothing, whatever else happens, parks in limbo. The desk’s position is now an opinion about a committee.',
        params: {},
    },
    {
        id: 'dispute_ruled',
        category: 'dispute',
        magnitude: 'moderate',
        headline: 'The adjudicator rules, inside the deadline, and the disputed contract settles on the panel’s word — synchronously, terminally, no appeal in the rulebook because the rulebook considered appeals and chose finality. Half the holders think the panel got it right. The settlement pays both halves identically, which is the entire point of having a panel.',
        params: {},
    },
    {
        id: 'dispute_fallback',
        category: 'dispute',
        magnitude: 'moderate',
        headline: 'The dispute deadline passes with no ruling — the panel deadlocked, or dissolved, or simply ran out of world — and the contract settles at its listed fallback, exactly as the terms said it would the day it listed. No cost-basis mercy, no indefinite limbo. Somewhere a holder is furious at arithmetic that treated everyone the same. The venue counts that fury as the system working.',
        params: {},
    },

    // ---- Reporting-regime lever (policy choice -> applyReportingRegime) -----
    {
        id: 'reporting_regime_enacted',
        category: 'policy',
        likelihood: 0.6,
        popup: true,
        magnitude: 'moderate',
        when: (sim, world) => !world.ai.reportingRegime && world.ai.frontierRung >= 2,
        headline: 'Whitfield’s incident-reporting mandate reaches the floor with the votes in reach — mandatory disclosure of frontier safety incidents, federal timelines, whistleblower cover. The labs’ testimony against it was written, visibly, by counsel; the testimony for it was written by people who used to work there. A fund with standing could tip it either way, and both sides have noticed which fund has standing.',
        context: 'Pass it, and detection lags shorten industry-wide — retroactively, for the incidents already latent and unfound: the disclosure wave. A safer world, a better-informed market, and a thinner edge for everyone whose alpha was the lag. The bill is, among its other properties, a vote on whether your information advantage should exist.',
        choices: [
            {
                label: 'Put Meridian behind it',
                desc: 'Lobby your own alpha away. Incidents surface faster from here — including the ones already ticking that nobody has found yet.',
                _applyReportingRegime: true,
                playerFlag: 'lobbied_evals_regime',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 8 }],
                resultToast: 'The mandate passes. The first disclosure wave hits the wire within days — the backlog, surfacing.',
            },
            {
                label: 'Let it die in committee',
                desc: 'The lag is your edge, and the edge is the mandate you actually hold. Keep it.',
                playerFlag: 'killed_evals_regime',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: -3 }],
                resultToast: 'The bill dies quietly. The people who counted the votes know roughly why.',
            },
        ],
    },

    // ---- The government flail (satire pulse; the texture register) ----------
    {
        id: 'gov_flail',
        category: 'policy',
        likelihood: 2,
        magnitude: 'minor',
        headlines: [
            'The Senate convenes an emergency hearing on artificial intelligence and spends four of its five hours on a chatbot that impersonated a senator, with the senator present, relitigating the impersonation. The frontier lab witnesses are dismissed early, unquestioned, visibly relieved. The one staffer who prepared capability questions watches her binder go unopened.',
            'The federal evals office loses its funding in a continuing-resolution rider nobody claims authorship of. Its nine remaining staff are absorbed into an agency that measures other things. This is the office the adjudication rulebook names as successor authority "should circumstances require," a sentence that ages one day at a time.',
            'Commerce publishes the new export rule to great fanfare, and by Thursday a deputy under-secretary has explained to a live camera — for the second time this administration — that model weights, once released, cannot be recalled, embargoed, or asked to return. The chips are controlled. The intelligence is a torrent. The rule controls the chips.',
            'A Russian column probes a border it should not and the administration’s response is a strongly worded letter, physically mailed, a detail the Kremlin releases itself because no one in Washington thought it damaging. Foreign policy has one lobe now, and it is priced in wafers.',
            'OPEC announces a production cut and the market reaction runs through the datacenter complex before it touches an airline — power purchase agreements reprice, a utility CEO uses the phrase "compute basin" unironically, and the barrel is now, functionally, an AI input. The cartel meeting minutes reportedly mention "the training demand" twice.',
            'Bolivia nationalizes a lithium concession and the event surfaces in American markets as one sentence in Cambria’s cost guidance, which is either a sign of resilient supply chains or a sign that only one supply chain matters anymore, and the analysts covering it genuinely cannot tell which.',
        ],
        params: {},
        impulse: { xi: 0.003 },   // decaying (P4): the flail is noise; the market trades it anyway
    },
];
