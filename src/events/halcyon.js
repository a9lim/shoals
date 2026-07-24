/* ===================================================
   src/events/halcyon.js -- Halcyon (the lab) arc
   (overhaul phase 5; prose landed content round 1).

   The frontier lab whose common stock IS the game's chart
   underlying (HCN). Release-ladder headlines flow through
   the race bridge (race-events.js release shells); this
   file holds the LAB-FLAVOR beats the bridge does not:
   the Fixedpoint half-sentences, the keynote gap, the
   cadence arithmetic, Reinholt's hedges, Malhotra's calls,
   the board hum. Category 'halcyon' is live in the Poisson
   pool; guards key on `world.ai.frontierRung` (the public
   act proxy) -- never latent race state.

   04's seeding rule governs the whole file: Act I is not
   quiet, it's UNHEARD. Every beat here is audible to a
   player who is listening and invisible to one who isn't.

   Prose is engine-fired, not bridge-fired: token
   substitution does NOT apply -- all strings literal.
   =================================================== */

export const HALCYON_EVENTS = [

    // ---- The Fixedpoint seed (Act I; the word Act III makes deafening) ----
    {
        id: 'halcyon_fixedpoint_hint',
        category: 'halcyon',
        oneShot: true,
        likelihood: 1.5,
        magnitude: 'minor',
        when: (sim, world) => world.ai.frontierRung <= 2 && !world.ai.fixedpointPublic,
        headline: 'Page four of the Meridian Brief, between a bond auction recap and the cafeteria schedule: Halcyon’s infra spend came in under guidance, "reflecting efficiencies attributed internally to Project Fixedpoint." No gloss. No follow-up. The Brief’s editor did not ask what the word means, because the Brief’s editor does not know it means anything.',
        params: {},
        impulse: { xi: 0.004 },   // decaying (P4): a flicker of vol nobody can source
    },

    // ---- The keynote (Act I/II centerpiece: the internal-vs-released gap) ----
    {
        id: 'halcyon_keynote',
        category: 'halcyon',
        oneShot: true,
        likelihood: 1.2,
        popup: true,
        magnitude: 'moderate',
        when: (sim, world) => world.ai.frontierRung <= 3,
        headline: 'Aleph keynote. Dirks does forty minutes on the demo everyone will clip — and ninety seconds, unslided, on inference costs "trending better than public benchmarks imply." Reinholt does not appear on stage. The number they did not publish is the only one the desk wants.',
        context: 'Two people familiar with the internal build describe it as "a different animal" from what shipped Tuesday. The market is pricing the release; it is not pricing the gap. The gap is where the trade lives — if it exists, and if certification ever drags it into the light.',
        choices: [
            {
                label: 'Buy the gap',
                desc: 'Position long the internal track the market prices a rung late. If the cadence is telling the truth, the certification will pay it.',
                playerFlag: 'long_frontier',
                followups: [{ id: 'halcyon_gap_resolves', mtth: 40 }],
            },
            {
                label: 'Fade the hype',
                desc: 'A keynote is marketing with a stage. Until an auditor signs a rung, the quiet number is a rumor with production values.',
                playerFlag: 'faded_frontier',
            },
        ],
    },
    {
        id: 'halcyon_gap_resolves',
        followupOnly: true,
        category: 'halcyon',
        magnitude: 'moderate',
        headline: 'Certification lands, and the gap the keynote would not slide gets a number. The rung claim the cadence implied is now collateral — auditable, disputable, tradeable. The Brief runs it under "as expected." It was not expected. It was purchasable.',
        params: {},
        impulse: { mu: 0.03, xi: 0.01 },   // decaying (P4): the internal track repriced into the open
    },

    // ---- Reinholt (chief scientist; parsed like Fed minutes) ----
    {
        id: 'halcyon_reinholt_hedge',
        category: 'halcyon',
        likelihood: 2,
        magnitude: 'minor',
        headlines: [
            'Reinholt, at a Stanford colloquium, on the new build: "There are behaviors we do not yet fully characterize." HCN gives up four percent by the close. She was describing a benchmarking artifact. Probably. The desk that sold first did not wait to find out.',
            'Reinholt withdraws from a panel at the last minute, citing scheduling. The panel was on interpretability. The scheduling conflict, per her office, is real. The options market prices the conflict at forty basis points of vol anyway — her calendar is a public instrument now, which nobody at Halcyon chose and nobody can undo.',
            'A Reinholt talk posts, is taken down within the hour, reposts the next day with one figure removed. Halcyon: "versioning error." Three separate research desks have already reconstructed the figure from the video. It shows a curve. The curve does not decelerate.',
        ],
        params: {},
        impulse: { mu: -0.01, xi: 0.008 },   // decaying (P4): the conscience clears her throat
    },

    // ---- Malhotra (CFO; the eschaton in adjusted-EBITDA terms) ----
    {
        id: 'halcyon_malhotra_call',
        category: 'halcyon',
        likelihood: 2,
        magnitude: 'minor',
        headlines: [
            'Halcyon earnings call. Malhotra raises guidance and describes what is coming as "a structural tailwind to unit economics with no natural comparable." An analyst asks him to characterize the tailwind. "Large." The word "singularity" does not appear; "operating leverage" appears eleven times. The stock decides this is good.',
            'Malhotra, asked on the call whether Aleph’s R&D productivity gains are sustainable: "We see no evidence of reversion." Sharma on MarketWire: "Ex-Goldman CFOs do not say ‘no evidence of reversion.’ They say ‘we remain disciplined.’ Somebody rewrote his script, and I would like to know what wrote it."',
            'Halcyon’s quarter beats. Malhotra attributes the margin expansion to "compounding internal efficiencies," declines to decompose the compounding, and closes with a line the transcript renders as laughter: "The models are cheaper than the people they assist. For now that is a cost story." The call ends. The buyback continues.',
        ],
        params: {},
        impulse: { mu: 0.01 },   // decaying (P4): the revenue floor holds the tape up
    },

    // ---- Sato's vital sign (the ratio insiders track) ----
    {
        id: 'halcyon_sato_vitals',
        category: 'halcyon',
        likelihood: 1.2,
        magnitude: 'moderate',
        when: (sim, world) => world.ai.frontierRung >= 2,
        headline: 'A departures-and-hires thread on Halcyon does the arithmetic nobody official will: capabilities headcount has doubled since the last major; Sato’s alignment team is net flat, and two of the flat are reassignments she fought to keep. The ratio is not a scandal. It is a vital sign, and the people who read it that way are not posting.',
        params: {},
        impulse: { mu: -0.01, xi: 0.012 },   // decaying (P4): margin quietly re-marked
    },

    // ---- The cadence arithmetic (Act II; the evidence the market refuses) ----
    {
        id: 'halcyon_cadence_arithmetic',
        category: 'halcyon',
        likelihood: 1,
        magnitude: 'moderate',
        when: (sim, world) => world.ai.frontierRung >= 2,
        headlines: [
            'The Brief plots the intervals between Aleph releases and fits a curve, mostly as a space-filler. The intervals shorten. The fit is exponential. The comment section concludes the axis is mislabeled, and the one comment doing the arithmetic correctly has two likes, one of which is the author.',
            'A MarketWire quant note prices Halcyon’s release cadence as if it were a coupon schedule and finds the implied forward cadence "economically implausible." The note recommends no trade. The cadence, unbothered by the recommendation, continues to imply it.',
        ],
        params: {},
        impulse: { xi: 0.008 },   // decaying (P4): evidence without a believer is just vol
    },

    // ---- The board hum (Osei; speed vs margin, pre-schism texture) ----
    {
        id: 'halcyon_osei_board',
        category: 'halcyon',
        likelihood: 1,
        // P6-2 retrofit: the ruled activist-restraint DECISION. This event was
        // TOAST-ONLY (headlines[], no choices) -- the coordinator's brief assumed an
        // existing choice to hang S[halcyon] on, so the choice + popup were added here
        // with PROSE: coordinator placeholders. oneShot to match the file's other popup
        // beats (keynote/leak) and to bar S[halcyon] stacking across repeated fires.
        // FLAGGED for coordinator review.
        oneShot: true,
        popup: true,   // _fireEvent collapses headlines[] to a headline for the popup
        magnitude: 'minor',
        when: (sim, world) => world.ai.frontierRung >= 2,
        headlines: [
            'The Continental, sourced to "two people near the Halcyon board": Osei has begun taking separate briefings from Dirks and Gottlieb, which is either diligence or a divorce lawyer’s intake meeting depending on which of the two people you believe.',
            'Halcyon’s board meets for six hours; the readout is one sentence about "alignment of long-term strategy." Osei’s office books no follow-on meetings for a week. Early money, late caution: the man both factions court is conspicuously letting himself be courted.',
        ],
        context: 'Meridian’s stake plus your personal book makes the firm a name Halcyon’s board secretary has to pronounce correctly. Osei’s people are counting noses for a restraint slate — more eval before release, an internal brake with an actual handle. Gottlieb’s people are counting the same noses for the opposite conclusion. Both sides have decided, independently, that your nose is worth counting.',
        params: {},
        impulse: { xi: 0.006 },   // decaying (P4): governance risk, unpriced until it detonates
        choices: [
            {
                label: 'Back the restraint slate',
                desc: 'Quietly. A letter, a lunch, a proxy conversation where your voice arrives before you do. Restraint bought is margin banked — and margin is a practice, not a possession.',
                // P6-2 raceEffect: activist restraint buys a small S[halcyon] (the
                // American margin is a practice -- it interacts with the burn taper).
                // Magnitude ratified in 02a.
                raceEffects: [{ dial: 'S', lab: 'halcyon', amount: 0.05 }],
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 2 }],
                playerFlag: 'backed_halcyon_restraint',
            },
            {
                label: 'Stay out of the boardroom',
                desc: 'You trade the company; you do not govern it. Whatever happens in that room will reach the tape soon enough, and the tape is your jurisdiction.',
                playerFlag: 'stayed_out_halcyon_board',
            },
        ],
    },

    // ---- The leak (mid-game superevent: the word belongs to the world now) ----
    {
        id: 'halcyon_fixedpoint_leak',
        category: 'halcyon',
        oneShot: true,
        likelihood: 0.8,
        popup: true,
        superevent: true,
        magnitude: 'major',
        when: (sim, world) => world.ai.frontierRung >= 3 && !world.ai.fixedpointPublic,
        effects: (world) => { world.ai.fixedpointPublic = true; },
        headline: 'FIXEDPOINT. Tan runs it above the fold: Project Fixedpoint, the program where Aleph does Aleph R&D, three sources, internal documents, x = f(x) rendered in a serif font for the general reader. By noon the word has stopped being a codename the way "Manhattan" stopped being a city. Halcyon’s statement does not deny it, which everyone correctly reads as the second confirmation.',
        context: 'The market now knows what the cadence arithmetic was measuring. The repricing is not orderly: the moat is real and so is the thing the moat is for. Every desk on the street is having the same meeting this hour. Yours is waiting.',
        choices: [
            {
                label: 'Brief the desk',
                desc: 'Walk the floor through what Fixedpoint means for the book — the thesis you have been carrying, said out loud, on the record.',
                factionShifts: [{ faction: 'firmStanding', value: 2 }],
                playerFlag: 'briefed_fixedpoint',
                resultToast: 'The floor goes quiet, then loud. The CIO’s door stays open a long time.',
            },
            {
                label: 'Let the tape explain it',
                desc: 'Say nothing. Positioning is a statement; annotation is a liability.',
                playerFlag: 'silent_fixedpoint',
                resultToast: 'The desk reads the story, then your book, and draws its own conclusions.',
            },
        ],
        params: {},
        impulse: { mu: 0.04, xi: 0.05, lambda: 0.5 },   // decaying (P4): moat and menace, priced in one candle
    },
];
