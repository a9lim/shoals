/* ===================================================
   src/events/china.js -- "China in the dark" arc
   (overhaul phase 5; prose landed content round 2).

   Two kinds of content live here:

   1. STRAIT MACHINERY SHELLS (bridge-fired on
      race.lastTransitions.strait): gray-zone scares, the
      blockade superevent, the lift, the after-action.
      strait.js generates the beats; bridgeStrait fires
      these shells; the bridge finalize rotates variants.
      Token-free prose throughout.

   2. CHINA-ARC EVENTS (live in the Poisson pool): the
      export-control ratchet and its Beijing answer (the
      coupling that feeds straitTension), the domestic
      Cangjie constituency, Cambria allocation politics,
      and the guards-vs-GPUs budget fight.

   3. chinaTrue INTEL BEATS (P7-3): `intel: true` shells
      whose headline pool is selected by a sampled-
      reliability read of the hidden Tianxia velocity
      (src/race/intel.js). Narrative-only; the velocity
      itself is never rendered.

   STILL DEFERRED: the post-theft "why slow down if it can
   be stolen" margin burn. Its prose lands with its
   machinery -- a dangling followupOnly would trip the
   index validator today.

   MARKET COUPLING (03/P4): shells and arc events carry
   `impulse` (a DECAYING overlay), never permanent `params`
   deltas on the race stream. The one PERMANENT mutation
   here is world-state: the backlash followup ratchets
   tradeWarStage/chinaRelations -- which is exactly the
   public tension straitTension() reads. The politics load
   the gun; strait.js decides, run by run, whether it fires.
   =================================================== */

export const CHINA_EVENTS = [
    // ---- Strait machinery shells (bridge-fired on strait.js beats) --------
    {
        id: 'strait_grayzone',
        category: 'strait',
        magnitude: 'minor',
        headlines: [
            'A Cambria-flagged tender takes a coast-guard ram near the median line. Nobody shoots; nobody apologizes; the water is contested enough that both are policy. By the close there is a risk premium in the far compute curve that was not there at the open, and no press release to pin it on.',
            'Twelve aircraft cross the median line during a "routine" drill, which is four more than routine. The pattern is the message: this can be done on any Tuesday. Cambria paper prints the message a half-day before the wires carry it.',
            'A subsea cable east of the island drops, and the repair ship is denied transit for thirty hours over a paperwork technicality that has never previously existed. The cable carries no fab traffic. The denial carries the point.',
        ],
        params: {},                    // no permanent delta (03 incident-coupling rule)
        impulse: { xi: 0.006 },        // decaying (P4): a hair of tail premium, no direction
    },
    {
        id: 'strait_blockade',
        category: 'strait',
        popup: true,
        superevent: true,
        magnitude: 'major',
        headline: 'BLOCKADE. Beijing announces a "customs enforcement zone" enclosing the water off Hsinchu, effective on publication. No shots, no invasion, no timetable — just hulls where the shipping lanes were, and every accelerator on Earth’s forward supply on the wrong side of them. The Pentagon calls it "a development we are monitoring." The compute curve had finished monitoring it by 9:40.',
        context: 'Force majeure is no longer a clause at the back of the compute contracts; it is the front page. The fabs are intact, humming, and unreachable — the distinction between destroyed capacity and stranded capacity is worth exactly the term structure. The desk marks, and waits, and learns what everyone else holding the far curve learns: there is no hedge for geography.',
        params: {},                    // no permanent delta (03 incident-coupling rule)
        impulse: { mu: -0.05, xi: 0.05, lambda: 0.8 },   // decaying (P4): compute crunch hits HCN, vol/jump up
        choices: [
            {
                label: 'Mark the book',
                desc: 'The compute positions reprice to the force-majeure schedule. Nothing to decide today; everything to decide about what you believed yesterday.',
            },
        ],
        followups: [{ id: 'strait_postmortem', mtth: 20 }],
    },
    {
        id: 'strait_blockade_lifted',
        category: 'strait',
        magnitude: 'moderate',
        headline: 'The enforcement zone is rescinded as quietly as it was declared — a notice to mariners, no speech. Ships move within hours; the near curve exhales; insurance does not. The far tail keeps a standing premium it did not carry before, because the market has now seen the thing it used to merely price, and they are not the same input.',
        params: {},                    // no permanent delta (03 incident-coupling rule)
        impulse: { mu: 0.02, xi: -0.02 },   // decaying (P4): relief rally, tail bleeds
    },
    {
        id: 'strait_postmortem',
        followupOnly: true,
        category: 'strait',
        magnitude: 'moderate',
        headline: 'The after-action on the blockade week circulates: which desks were short the far curve and why, which force-majeure clauses held and which are now litigation, and one MarketWire chart that will outlive the episode — the strait premium, before and after, with the "after" never returning to the "before." The Brief’s caption: "The market has updated its map."',
        params: {},
        impulse: { xi: 0.004 },
    },

    // ---- The export-control ratchet (the politics that load the gun) ------
    {
        id: 'china_export_controls',
        category: 'china',
        likelihood: 1.2,
        popup: true,
        magnitude: 'moderate',
        when: (sim, world) => world.ai.exportControlStage < 3,
        headline: 'The administration circulates a draft rule tightening accelerator exports — and the loudest lobbying against it is American. Half the country’s enterprise software runs on free Cangjie weights; the constituency for the other side’s model line votes, donates, and testifies. Lassiter wants the rule broader. The Chamber wants it dead. Commerce wants the comment period extended until after the midterms.',
        context: 'The rule binds silicon, not weights — nothing already released un-releases, a point the hearing will rediscover in public, twice. Meridian’s clients sit on both sides of it, and a fund with a view can lean on the comment period. The controls are aimed at Tianxia’s compute and priced by everyone as if aim were effect; free flow keeps your software cheap and the strait calm. Pick which future you’re short.',
        choices: [
            {
                // Desc is INTENT language by ruling (content gate): the
                // exportControlStage -> Tianxia-velocity race coupling is the
                // evidence-machinery round's to build (02a will ratify the
                // dampener); until then the rule's bite is political, and the
                // prose promises exactly that much.
                label: 'Back the controls',
                desc: 'Weigh in for the tighter rule — aimed squarely at Tianxia’s compute, and read in Beijing as anything but economics.',
                effects: [{ path: 'ai.exportControlStage', op: 'add', value: 1 }],
                // P6-2 raceEffect: visible containment RAISES heat (the race reads it
                // as escalation). The exportControlStage -> Tianxia-VELOCITY dampener
                // stays DEFERRED to the evidence round -- heat only here. Magnitude
                // proposed; swept/ratified in 02a.
                raceEffects: [{ dial: 'heat', amount: 0.04 }],
                factionShifts: [
                    { faction: 'federalistSupport', value: 2 },
                    { faction: 'labRelations', value: 1 },
                ],
                playerFlag: 'lobbied_export_controls',
                followups: [{ id: 'china_controls_backlash', mtth: 30 }],
                resultToast: 'Meridian’s comment letter supports the rule. Lassiter’s office calls it "constructive."',
            },
            {
                label: 'Fight the controls',
                desc: 'Side with the constituency. The chips keep flowing, the software stays cheap, and the race stays somebody else’s problem for another quarter.',
                factionShifts: [{ faction: 'firmStanding', value: 1 }],
                playerFlag: 'lobbied_deregulation',
                resultToast: 'The comment letter opposes the rule. Three clients call to say thank you; one calls to say nothing, memorably.',
            },
        ],
    },
    {
        id: 'china_controls_backlash',
        followupOnly: true,
        category: 'china',
        magnitude: 'moderate',
        headline: 'Beijing answers the export rule with a "reciprocal adjustment": licensing delays on rare-earth processing, a customs inspection regime discovering sudden enthusiasm, and a Liang Wei speech about "technological containment" that names no one and means everyone. The trade war ratchets one click. So, invisibly, does the arithmetic in the strait.',
        effects: (world) => {
            world.geopolitical.tradeWarStage = Math.min(4, world.geopolitical.tradeWarStage + 1);
            world.geopolitical.chinaRelations = Math.max(-3, world.geopolitical.chinaRelations - 1);
        },
        params: { mu: -0.01, sigma: 0.01 },
        impulse: { xi: 0.01 },   // decaying (P4): the tail thickens a hair
    },

    // ---- The domestic constituency (proliferation with a lobby) -----------
    {
        id: 'china_constituency',
        category: 'china',
        likelihood: 1.5,
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 1 || world.ai.exportControlStage >= 1,
        headlines: [
            'A Fortune 500 CIO, testifying against the export rules, is asked why an American company runs its logistics on Cangjie weights. "Because they are free, Senator." Asked if that concerns him: "The invoice does not arrive with a flag on it." The clip does numbers in Shenzhen.',
            'The Cangjie Developers Conference — the American one, in Austin — draws eleven thousand attendees and two protesters. The keynote is a supply-chain demo running on weights Beijing gave away and silicon Washington is trying to embargo. Nobody on stage sees the sentence as strange, which is the story.',
            'MarketWire runs the divergence chart again: the non-frontier software complex, up on cheap Cangjie inference, against HCN, flat — the market pricing proliferation as a margin story for everyone except the company it is aimed at. Sharma: "Free is a price. Somebody is paying it. The ticker just isn’t listed here."',
        ],
        params: {},
        impulse: { mu: -0.008, xi: 0.004 },   // decaying (P4): the moat quietly shoaling
    },

    // ---- Cambria allocation (politics in two capitals) --------------------
    {
        id: 'china_cambria_allocation',
        category: 'china',
        likelihood: 1.5,
        magnitude: 'minor',
        headlines: [
            'Cambria posts allocation guidance. Karras takes four questions in nine minutes: capacity is "committed through the horizon," priority is "contractual," the Austin fab is "progressing" — and, on invasion risk, the answer that has become a genre: "We publish our capacity numbers." The call ends. The oracle bones are read for a week.',
            'The Austin fab breaks ground, again — the third groundbreaking in as many years, each with a larger flag and the same two-years-out completion date. The subsidy is real, the tools are ordered, and the geography it is meant to solve remains, for now, exactly where it was.',
            'A leak from the allocation committee: next quarter’s marginal wafer went to the frontier, again, over a hyperscaler bid that offered more money. Cambria does not comment on allocation. The hyperscaler does not comment on losing. The lesson — that the queue is priced in something other than dollars — is not lost on either capital.',
        ],
        params: {},
        impulse: { xi: 0.008 },   // decaying (P4): the chokepoint reminds everyone it chooses
    },

    // ---- chinaTrue INTEL beats (P7-3; PROSE: coordinator) -----------------
    // 04's "China posterior as tradeable as the timeline". Each of these shells
    // declares `intel: true`: at fire time the canonical `_fireEvent` path resolves
    // ONE read from src/race/intel.js -- the hidden Tianxia velocity bucketed
    // behind / matched / faster, reported truthfully with p = 0.7 and otherwise
    // ONE bucket off (never inverted) -- and selects the matching `headlinesByRead`
    // pool. The reliability draw comes from intel.js's own module stream, OUTSIDE
    // race.streams, so these beats cannot perturb the race.
    //
    // NARRATIVE-ONLY by rule (02a): no `impulse`, no `params`, no raceEffects, no
    // factionShifts -- the read is information, and what the player does with it is
    // the trade. The velocity number itself is NEVER rendered; only the bucket, and
    // only through these pools. An assessment is not a fact: two beats in one run
    // can disagree, and that is the mechanic, not a bug.
    //
    // Category 'china' is Poisson-LIVE (left the exclusion at content round 2), so
    // these draw normally under the existing frontierRung guards.
    {
        id: 'china_intel_estimate',
        category: 'china',
        likelihood: 1.2,
        magnitude: 'moderate',
        intel: true,
        when: (sim, world) => world.ai.frontierRung >= 2,
        headlinesByRead: {
            behind: ['PROSE: coordinator — the interagency estimate reads Beijing as genuinely behind (bucket: behind). The estimate is an estimate.'],
            matched: ['PROSE: coordinator — the interagency estimate reads the two programs as effectively level (bucket: matched).'],
            faster: ['PROSE: coordinator — the interagency estimate reads Beijing as quietly faster than the public line (bucket: faster).'],
        },
        params: {},
    },
    {
        id: 'china_intel_human_source',
        category: 'china',
        likelihood: 1,
        magnitude: 'moderate',
        intel: true,
        when: (sim, world) => world.ai.frontierRung >= 2,
        headlinesByRead: {
            behind: ['PROSE: coordinator — a human-source read out of the Zhaowei program: slower than advertised (bucket: behind). Sourcing thin, conviction high, which is the usual arrangement.'],
            matched: ['PROSE: coordinator — a human-source read: the two programs are closer than either capital says (bucket: matched).'],
            faster: ['PROSE: coordinator — a human-source read: the program is ahead of its own announcements (bucket: faster).'],
        },
        params: {},
    },
    {
        id: 'china_intel_buildout',
        category: 'china',
        likelihood: 1,
        magnitude: 'minor',
        intel: true,
        when: (sim, world) => world.ai.frontierRung >= 3,
        headlinesByRead: {
            behind: ['PROSE: coordinator — commercial imagery of the compute build-out, read as a program running below its own plan (bucket: behind).'],
            matched: ['PROSE: coordinator — commercial imagery of the compute build-out, read as tracking the frontier (bucket: matched).'],
            faster: ['PROSE: coordinator — commercial imagery of the compute build-out, read as outpacing every published estimate (bucket: faster).'],
        },
        params: {},
    },

    // ---- Guards vs GPUs (the budget fight before the theft) ---------------
    {
        id: 'china_guards_vs_gpus',
        category: 'china',
        likelihood: 1,
        magnitude: 'moderate',
        when: (sim, world) => world.ai.frontierRung >= 2,
        headline: 'A line item surfaces from Halcyon’s planning cycle, secondhand and denied: the security budget and the training budget went to the same committee, and one of them left with the money. Weight custody, insider vetting, the compartmentalization program — funded, per the leak, at "roughly a datacenter’s worth of priority." The people who track such things note that the entity most interested in that ratio does not read the Brief. It has other channels.',
        params: {},
        impulse: { xi: 0.01 },   // decaying (P4): the tail risk nobody can name yet
    },
];
