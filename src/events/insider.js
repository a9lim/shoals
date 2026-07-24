/* ===================================================
   src/events/insider.js -- The insider channel
   (overhaul phase 5; prose landed content round 7) --
   tips.js successor, elevated to the game's moral core (04).

   A safety-researcher source network grown through standing
   (factions.safetyNetworkTrust). The FEED is live: the race
   bridge's bridgeTips surfaces incident occurrences the
   generator flagged (insiderTip), gated on trust and
   throttled to scarcity -- the channel is a person, not a
   feed. The tip tells you a thing HAPPENED before the world
   learns it; the detection beat the machinery fires later is
   where the tape finds out. THREE VERBS, three signatures:
     - TRADE IT : position ahead of detection. P&L +
                  personal legal exposure. The print is
                  subpoenable.
     - LEAK IT  : to Rachel Tan -> public pressure, source
                  at risk. MECHANICAL since the evidence
                  machinery round: `raceLeak: true` forces the
                  leaked incident detectable on a 4d clock and
                  folds `B` early under the detection's own id
                  (timing, never extra belief mass).
     - SIT ON IT: nothing moves; the source's trust grows;
                  the channel deepens.

   Category 'insider' stays Poisson-EXCLUDED by design --
   bridge/followup-fired only, like 'polaris'. The tip
   headline is bridge-finalized (tokens live); followup
   prose is token-free.
   =================================================== */

export const INSIDER_EVENTS = [
    {
        id: 'insider_tip',
        category: 'insider',
        popup: true,
        magnitude: 'moderate',
        headline: 'A call you did not schedule, from a number that is not saved. Someone on the safety side of {lab} — you know the voice, which is the point — talking fast and low: something happened. Not public, not filed, possibly never filed. The internal review is already being described, internally, in the past tense. That is the whole tip. It is enough.',
        context: 'The world does not know. The market has a whisper of it — belief drifted a hair when it happened, the way it always does when enough badges saw something — but a whisper is not a fact, and you are now one of the only people holding the fact. Early, unprovable, radioactive. There are exactly three things a person can do with a thing like this, and all three compound. The source is still on the line, waiting to learn what kind of desk they just called.',
        choices: [
            {
                label: 'Trade it',
                desc: 'You know what the tape does not — position the book yourself, ahead of a disclosure that may or may not ever come. The purest edge on the desk, and the one a subpoena reads best.',
                playerFlag: 'traded_insider_tip',
                factionShifts: [{ faction: 'regulatoryExposure', value: 12 }],
                // P4 coupling: B already took the occurrence whisper (stepBelief folds
                // flagged occurrences into alignment sentiment -- ratified); the player's
                // edge is the FACT and its specificity, not exclusivity. The positioning
                // itself is the player's job on the chassis -- choosing the verb buys
                // the knowledge and the exposure, never an automatic fill.
                followups: [{ id: 'insider_trade_outcome', mtth: 14 }],
                resultToast: 'The line goes dead. The book is yours to lean — and the window has a timestamp on it.',
            },
            {
                label: 'Leak it to Tan',
                desc: 'Three sources is her rule; you volunteer to be one. The world learns faster, the pressure builds — and the voice on the phone becomes findable.',
                playerFlag: 'leaked_to_tan',
                factionShifts: [
                    { faction: 'mediaTrust', value: 10 },
                    { faction: 'safetyNetworkTrust', value: -8 },   // burning a source strains the network
                ],
                // LEAK COUPLING (evidence machinery round, 02a): the declarative field
                // main.js's raceEffects chokepoint reads, resolving the popup's
                // `_tipIncidentId`. Two effects, one route, one gate (the same
                // frozen/inactive gate as raceEffects -- inert post-latch and in
                // Classic): the leaked incident becomes detectable UNCONDITIONALLY on a
                // 4d clock, and `B` takes the detection-class fold NOW, under the
                // detection's own id -- so the total belief move is identical leaked or
                // unleaked. You buy timing and public pressure, never extra belief mass.
                raceLeak: true,
                followups: [{ id: 'insider_leak_outcome', mtth: 12 }],
                resultToast: 'Tan listens without typing, which is how you know she is typing somewhere else.',
            },
            {
                label: 'Sit on it',
                desc: 'No trade, no story, no print. Discretion is a deposit in the only bank that matters here.',
                playerFlag: 'sat_on_insider_tip',
                factionShifts: [{ faction: 'safetyNetworkTrust', value: 10 }],
                // P4 coupling reference: nothing moves -- the ambivalence rule on the insider track.
                followups: [{ id: 'insider_source_deepens', mtth: 60 }],
                resultToast: 'You thank them and hang up. The number stays unsaved. The channel stays open.',
            },
        ],
    },
    {
        id: 'insider_trade_outcome',
        followupOnly: true,
        category: 'insider',
        magnitude: 'moderate',
        // Detection-agnostic by ruling (content gate): the incident may print
        // later, or never -- the quiet-tape ambiguity is the design. What is
        // certain either way is the residue: the positioning window exists in
        // the records whether or not the news ever does. The TRADE verb gets NO
        // race coupling (ruled at the content gate and re-ratified in 02a's
        // evidence-machinery block: the edge is the fact and its timing on the
        // chassis) -- only the LEAK verb is mechanical. This beat is the part
        // that is true in every world.
        headline: 'Two weeks on, the thing you know is still not news — maybe it never files, maybe the candle comes next month and your book reads as prophecy. What exists either way is the window: a stretch of positioning, timestamped, that answers to nothing public. Compliance flags it without knowing what it is looking at and files the flag in the folder such flags accumulate in. Folders like that have a way of becoming exhibits, later, all at once.',
        params: {},
        impulse: { xi: 0.004 },   // decaying (P4): the residue stays, whatever the tape does
    },
    {
        id: 'insider_leak_outcome',
        followupOnly: true,
        category: 'insider',
        magnitude: 'moderate',
        headline: 'Tan runs it: an undisclosed safety incident, sourced to "people with direct knowledge," every hedge in the phrasing load-bearing. The lab’s non-denial confirms it for anyone fluent. Public pressure arrives ahead of the paperwork — and inside the building, so does the other thing: a review of who knew, who called, and whose badge logs line up with the timeline. The story is out. The source is in. Those were always the same sentence.',
        effects: [
            { path: 'media.tanCredibility', op: 'add', value: 1 },
            { path: 'media.leakCount', op: 'add', value: 1 },
        ],
        params: {},
        impulse: { xi: 0.008, mu: -0.008 },   // decaying (P4): pressure prices in ahead of the filing
    },
    {
        id: 'insider_source_deepens',
        followupOnly: true,
        category: 'insider',
        magnitude: 'minor',
        headline: 'The unsaved number calls again — not with a tip, with a correction to the last one, which is how you know what you have become: not a counterparty, a colleague. The detail is small and technical and would move nothing. They shared it anyway, because accuracy is how these people say thank you. The channel is no longer a channel. It is a relationship with a clearance problem.',
        params: {},
    },
];
