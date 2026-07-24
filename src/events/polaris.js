/* ===================================================
   src/events/polaris.js -- The Polaris schism arc
   (overhaul phase 5; prose landed content round 3).

   A scaling decision goes the wrong way; the walkout is a
   superevent; the founding sets up the fund-as-actor wager
   (04). Polaris as conscience, competitor, and compute-
   starved supplicant -- and, in some worlds, the margin-
   carrier that matters at resolution.

   WIRING: the walkout fires from the RACE BRIDGE on the
   sampler's Polaris spawn (~day 400, its own draw) -- never
   a Poisson draw, or the story and the model would disagree
   about whether the lab is racing. Category 'polaris' stays
   Poisson-EXCLUDED; everything downstream chains off the
   walkout as followups. Holt releases themselves flow
   through the bridge's release shells like every lab's.

   Prose is token-free (bridge finalize + followup path).
   =================================================== */

export const POLARIS_EVENTS = [
    {
        id: 'polaris_walkout',
        category: 'polaris',
        popup: true,
        superevent: true,
        magnitude: 'major',
        headline: 'THE WALKOUT. The scaling decision goes to a vote, the vote goes to Dirks, and by Friday Gottlieb’s resignation letter is the most-forwarded document in the industry — one page, no adjectives, the sentence "we were told the margin would be spent later" doing all the work. Eleven senior researchers follow him out. By Monday there is a name, a Boulder address, and a thesis: do it right, slower. The wager has a second actor now, and the field has a conscience with a payroll.',
        context: 'The street’s first read is governance risk — HCN wobbles, vol bids, two analysts use the word "decapitation" and one retracts it. The second read is slower and worse: the people who left are the people who wrote the safety case. The desk notes the new variable. The new variable is hiring.',
        params: {},
        impulse: { xi: 0.02, mu: -0.01 },   // decaying (P4): the field fractures, vol up
        choices: [
            {
                label: 'Note the new variable',
                desc: 'The board fight is not yours. The book now has two frontier trajectories to price, and one of them is deliberately slower.',
            },
            {
                label: 'Reach out to Boulder',
                desc: 'Early, informal, no term sheet — just a desk that takes the careful ones seriously while everyone else is pricing the divorce.',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 2 }],
                playerFlag: 'polaris_early_contact',
                resultToast: 'A reply from a polaris.ai address, three days later: "Noted. We remember who called first."',
            },
        ],
        followups: [
            { id: 'polaris_gottlieb_speaks', mtth: 25 },
            { id: 'polaris_supplicant', mtth: 60 },
        ],
    },
    {
        id: 'polaris_gottlieb_speaks',
        followupOnly: true,
        category: 'polaris',
        magnitude: 'moderate',
        headline: 'Gottlieb gives his first interview since the walkout — to Tan, naturally. He declines to criticize Dirks by name, which sharpens every sentence that follows. On why Holt will ship half as often: "A model line is an argument about what is enough. We are making a different argument." On whether slower can win: a pause the transcript marks at four seconds. "Ask me what winning is." The clip does not trend. The people it was for did not need it to.',
        params: {},
        impulse: { xi: 0.006 },   // decaying (P4): the argument now has two sides with logos
    },
    {
        id: 'polaris_supplicant',
        followupOnly: true,
        category: 'polaris',
        popup: true,
        magnitude: 'moderate',
        headline: 'Polaris comes to the desk. Not a roadshow — a working session: their head of strategy, one laptop, a compute budget that runs out four months before their next milestone, and an eval suite Halcyon quietly licenses because it is better than their own. They are oversubscribed on talent and starved on wafers, and they know exactly which of those problems money solves.',
        context: 'This is the wager at its purest. Backing the careful racer might be the margin that matters at resolution — or the split that fatally divides the West’s lead while Tianxia closes. The game will not tell you which, because nobody in the room knows either. What they are asking for today is smaller: a desk that keeps the door open, and remembers them when the fund’s book becomes an instrument.',
        choices: [
            {
                label: 'Hear them out',
                desc: 'Take the meeting seriously; keep the channel warm. When fund-as-actor is on the table, Polaris is on it too.',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 2 }],
                playerFlag: 'backed_polaris_interest',
                resultToast: 'The follow-up deck arrives that night. The last slide is just their eval curve against the frontier’s, unlabeled.',
                // Ordinary popups schedule followups at CHOICE level only (the
                // engine's popup path returns before top-level scheduling) --
                // content-gate finding; both branches continue the arc.
                followups: [{ id: 'polaris_starved', mtth: 90 }],
            },
            {
                label: 'Not our mandate',
                desc: 'The desk trades the race; it does not run it. Sympathy is not a position.',
                playerFlag: 'declined_polaris',
                resultToast: 'They take it well, which is somehow worse.',
                followups: [{ id: 'polaris_starved', mtth: 90 }],
            },
        ],
    },
    {
        id: 'polaris_starved',
        followupOnly: true,
        category: 'polaris',
        magnitude: 'minor',
        headline: 'The Brief’s industry roundup, third item: Polaris has slipped a Holt milestone "to prioritize evaluation depth," which is the sound a lab makes when the Cambria queue prices it out of a training run. Same item, next sentence, no comment drawn between them: frontier hiring of Polaris-trained researchers is up forty percent. The careful argument is losing on wafers and winning on alumni, and only one of those compounds in time.',
        params: {},
        impulse: { xi: 0.004 },   // decaying (P4): the margin-carrier thins
    },
];
