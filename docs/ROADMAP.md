# Roadmap

The queue of work beyond the game as it stands. `docs/design/` describes
only what is built; everything designed but not built lives here. When an
item is taken, its rulings go into `02a-tuning.md` first, its description
moves into the design doc it belongs to, and it leaves this file.

How a round runs:

1. Ratify the design into 02a.
2. Implement. Implementers flag interpretation calls rather than
   improvise.
3. Run the six-plus-three harnesses at default N.
4. Get an independent Codex review of the round before committing.

Player-facing prose and the score are authored, and a9 ratifies them.

## 1. Next: domains, and the market's belief rebuilt

Approved by a9. These are one round because both reshape `B`.

### Domains: rungs observed through certification channels

Capability shows up in public jaggedly. It arrives first and loudest
wherever it is cheapest to verify. An internal model can produce research
mathematics at volume, machine-checked, long before anyone can certify
"autonomous researcher" in AI R&D, which is the domain that drives
recursion. AI 2027 tracked capability by domain. Shoals should too, as an
epistemic layer:

- **One hidden scalar per lab stays.** The kinematics, their calibration
  and the bit-identity harnesses are untouched. A domain is a way a rung
  becomes *visible*, not a separate capability.
- **Each domain certifies on its own clock**, drawn from a `domains`
  substream outside `race.streams`:

  | Domain | How it certifies | Speed |
  |---|---|---|
  | Mathematics | formal proof; the demonstration channel below | fast, loud |
  | Software | benchmarks and shipped work | medium |
  | AI research | contested, empirical, internal; drives recursion | slowest |
  | Cyber, bio | red-team reports and incidents; capability shows first as harm | by incident |
  | Persuasion | detected campaigns (the persuasion incident class) | by detection |

- **Consensus lists per-domain contracts** on the same rung. The current
  rung contracts become the AI-research contracts.
- **`B` carries a curve per listed domain**, and the player may hold a
  curve per domain.
- **The Race page grows a domain grid.**
- **The edge:** the loud domain leads the quiet one by a lag that is real
  but not fixed. A certified R3 in mathematics is evidence about AI
  research, not its settlement.
- **The demonstration channel** lives here: a lab publishes what its
  *unreleased* model did. It is a third disclosure mode beside release and
  leak. It certifies the fast domains, moves `B`'s next-rung curve,
  cannot settle the AI-research contracts, and carries a correlated
  withdrawal risk (one flawed lemma retracts its dependents). Labs facing
  a funding deadline demonstrate more. In lore, it arrives as the
  Fixedpoint catalogue: the codename's first public meaning is seven
  hundred papers.
- **Separate decision, later:** whether domain capability feeds hazards,
  for example cyber capability raising theft and incident rates. That
  touches kinematics.

### The market's belief rebuilt

Two known biases share a root: `B`'s per-rung law has two parameters,
which cannot hold both the median and the deadline probability of an
outcome with a long "not this term" tail.

- **A plateau mass per rung:** `F(t) = (1 − q)·σ((t − m)/w)`. With three
  parameters, day-0 quotes can equal the listing priors *and* the medians
  can match the measured certified medians. The player's curves gain the
  same `q`, and the scoring stays proper.
- **A calibrated public estimator for the valuation layer:**
  `V = E[m_f | survival, public state]`, fit from the race model's own
  outcome statistics over certified rungs (per domain), the claim lead and
  elapsed time. V is then a martingale under the model: a stall's decay
  is paid back by progress jumps, and no drift is free. The fit is a
  generated constants file with its own harness.
- **Gates:** no predictable drift in V by family (mean daily log change
  ≈ 0 across seeds); the terminal reveal ratio distribution reported and
  bounded; no static forecast preset with positive mean skill.
  Recalibrate `K_CRED` afterwards.

## 2. Event illustrations: a pilot, in its own session

A self-contained session, briefed as follows.

**Goal.** Find an illustration style for *The Meridian Brief* that
belongs to the design system (near-white paper, one oxblood accent,
hairlines, the inks, "depict, don't decorate", "pattern before hue"), and
prove it on a small set.

**Hypothesis to test first.** Stipple or engraving in the text ink (the
newspaper hedcut lineage), theme-paired for light and dark, with the one
red spent only on what the story points at. Try one or two alternatives
against it, such as halftone duotone or woodcut.

**Pilot set.** About eight superevents:

- the walkout
- the S4 catastrophe
- the Fixedpoint leak
- a Taiwan blockade
- the room
- the Deal
- the first model-designed drug
- a treaty summit

**Tooling.** Codex's built-in image generation, through `gaslamp codex`.

**Deliverable.** A contact sheet for a9 to choose from, plus a prompt
sheet in the chosen style. The sheet replaces the deleted Disco Elysium
oil-portrait sheet, which predated the Brief. Nothing is integrated until
a9 picks a style.

**After the pick.** These are integration questions for the main game:

- Where images live: the dispatch, the front-page lead, the epilogue.
- The size budget.
- Alt text.
- Whether characters get portraits.
- How the ghostwritten world and Act III degradation touch the images.

## 3. The Desk as the firm

The Desk page still has the politics-era layout, with Congress
hemicycles in the centre column. The firm, the game's most persistent
human throughline, is one line of text. Make the page Meridian:

- The CIO, Webb and the risk committee.
- The credibility record against the market's.
- `F` beside the player's curves.
- The insider source network as people with histories.
- The standing orders.
- The ledger's shadow: what the book financed this quarter, by channel.

Congress moves to the wire and a small panel.

## 4. A wider Consensus

- **Rolling rung listings.** A new "R3 by …" each year, as a real
  exchange would list.
- **Event contracts:**
  - next Aleph major by a date
  - treaty framework signed
  - a severity-2-or-worse incident this year
  - Fixedpoint confirmed
  - first model-designed drug approved

  Incident-flavoured contracts settle on the alignment-sentiment channel.
- **Same milestone, different settlement sources:** certified, claimed
  and *announced*. A trader can be right about capability and lose on
  institutional speech. The basis is tradeable.
- **Scope disputes as a dispute class:** "solved the wrong problem," a
  checker that proves a narrower statement than the claim. The dispute
  lifecycle exists and is harness-exercised, but no event opens one yet.
- **Certification throughput as state.** Output volume rises with the
  race and the certifiers saturate, so the certification lag *grows* in
  Act III. The gap between true and certified widens exactly when it
  matters.

## 5. The race's missing machinery

- **Security levels**, SL1–SL4 per lab, with costs, research friction and
  observable tells (badge policies, a paper drought, the air-gap
  complaint). Theft success keys off the victim's level. Today every lab
  sits at SL2.
- **Self-exfiltration.** The model as the thief, landing in `C[open]`.
  The commit path supports it; nothing rolls it.
- **World-side heat impulses:**
  - export-control and gray-zone escalation (heats)
  - treaty progress (cools)
  - deregulation (heats)
  - incident backlash (cools, then fades)
  - lead size (a comfortable lead cools, a knife-edge heats)
- **The post-theft margin burn.** A theft already freezes `S`
  accumulation race-wide for 90 days. The burn would go further: "why
  slow down if it can be stolen" as a lab decision that spends margin,
  with its beat on the wire (the header of `src/events/china.js` holds
  the slot).
- **Detection drivers.** Detection lag answers only to the reporting
  regime, the concealment term and the lobbyable `detectionQuality` dial.
  Lab transparency and media pressure (Tan's standing, a run of leaks)
  should shorten it too.
- **The open ecosystem's own dynamics.** `C[open]` trails Tianxia's
  released capability at a fixed lag and has no motion of its own. A
  proliferation path (fine-tunes compounding, self-exfiltration landing
  there) would make family 4's proliferation variant reachable.
- **Russia as a second buyer** for stolen weights, beside Beijing.
- **Occurrence-day physical effects of incidents:** costs, dead
  capability and `S` burned. These need recorded magnitudes first, so the
  calibrated `S` path isn't double-counted.
- **Pauses and withheld checkpoints as lab moves.** A pause is public,
  and the resume is disclosed late. A checkpoint withheld after failing
  alignment tests lets the market punish prudence.
- **Distillation** as a continuous theft channel. Tianxia's velocity
  gains a term proportional to the frontier's release surface; weight
  theft stays the discontinuity.
- **New incident classes:**
  - *monitor tampering*, an incident whose effect is to lower detection
    and silently fatten the never-detected tail;
  - *disclosure contagion*, where a major disclosure raises race-wide
    detection for a window and surfaces a batch of stale incidents.
- **Adversarial persuasion.** Campaigns that move `F` and faction
  standings against the player, and insider-channel source trust that can
  be attacked.

## 6. Markets and the desk

- **The full regime break, and the clearing machinery it needs:**
  - **A regime-switch wrapper** on the authoritative process, so that in
    Act III the process itself drifts away from the GBM+Heston its own
    tools assume.
  - **A regime-aware authoritative quote surface** for exchange option
    and futures quotes. It would price halt, conversion-band, decree and
    terminal hazards, and from mobilized onward the declared
    nationalization band. The CRR trees become display and scenario
    tooling only. Corrupting tree inputs would then change displayed
    analytics and nothing economic, which becomes a harness invariant.
  - **Halts.** HCN gets LULD-style halts of at most a day and a
    delisting halt of at most five days. Options suspend exercise and
    assignment during a halt, reject pending orders explicitly, and
    settle any expiry inside a halt against the published risk mark. A
    fairness invariant follows: outside declared halts, the player can
    always flatten.
  - **Carry through delisting.** Borrow fees and manufactured dividends
    accrue to the legal conversion timestamp and then stop, with a
    stated record-date rule for dividends.
  - **The exchange variance index.** It is computed from authoritative
    option quotes, with a published realized-variance fallback and
    observations stored with validity status. VXHCN futures settle to
    it, so terminal VXHCN stops marking last-valid.
  - **Global stressed-scenario risk limits.** Aggregate delta, gamma
    and vega, jump-to-conversion, decree, binary and doom scenarios
    across maturities and synthetic equivalents, instead of
    per-instrument counts.
  - **A regime margin add-on.** Margin becomes max(realized-vol,
    implied-jump, regime add-on).
- **Insider exposure read from fills.** A regulator reads the book.
  "Trade it" on a tip should cost exposure according to how the book
  moved in the window, not because the verb was clicked.
- **The scrutiny loop's teeth:** "explain this thesis" popups and forced
  trims on a divergent drawdown.
- **Fund-as-actor menu:**
  - anchor Cambria's Austin expansion (compute nationalism; the strait
    premium falls slowly);
  - refuse a government compute mobilization, or don't;
  - a PIPE with governance terms as the fund-scale version of board
    restraint.
- **The AI-policy lobbying menu.** It replaces the prototype party-PAC bar:
  - liability shield / deregulation (heat up, near-term returns up)
  - the frontier-lab nationalization push
  - compute reporting
  - mandatory evals

  The regime evaluator already accepts supervision, mobilization,
  nationalization and classification pushes; only the evals and
  reporting push is wired.
- **The sandbox under the player's curves.** "What is this book worth if
  I'm right" becomes a computation.
- **The financing race:**
  - compute obligations as funding deadlines;
  - demonstrations timed to raises (with the domains round);
  - Polaris tender offers, where a later round buys out early stakes.

## 7. Content the design names but the pool lacks

- **The evidence ladder's beats.** Evidence runs beneath the feed with
  sampled reliability and has no wire presence. Found-versus-published
  beats would give the alignment side of the wager a voice, and the
  market an alignment sentiment to price.
- **A Sato superevent**: the head of alignment's departure, or her
  team's headcount crossing a line, as the vital sign made loud.
- **Tip variety.** Tips are generic by lab and severity. Sources with
  their own voices and histories, and tips about evidence as well as
  incidents.
- **Wonders as tradeables.** The wonders move HCN by impulse only; a
  first-drug-approved contract is in section 4.
- **Cambria earnings** as a compute-curve print.
- **Standing orders:**
  - a nudge when the panel unlocks, since today it just appears;
  - a leak-policy rule beside sit-on-every-tip;
  - the designed `F` and scrutiny relief for sit-on-every-tip;
  - a soft-trim path between 80% and 100% of margin, which would make
    rule (c)'s 80% gate observable.
- **A player flatten control.** `liquidateAll` has no player entry
  point; a flatten button would take the latency ladder.
- **Counsel leverage on the summit gate.** Designed, not built: the
  player's standing could move whether the Reykjavik window opens.
- **A Deal term in V**, so the valuation layer prices the treaty track.
- **Fizzle interpolation.** The fizzle closeout is one seeded draw at the
  endpoint. If date-differentiated claims prove mispriced by it,
  interpolate maturity-linearly from the last valid mark to the draw.
- **Trait effects.** The six dynamic tags in `src/traits.js` carry no
  effects yet.
- **The political pool.** Decide whether to trim it now that the race
  carries the plot, or keep it as the distraction the satire needs.

## 8. The epilogue

- **Disclose the run's sampled variables.** τ, takeoff sharpness,
  `scalingElasticity`, `dealPossible` and China's position sit on
  `resolution.axes` unrendered. Show them, with the incidents detection
  never caught and the days they occurred.
- **The CIO's told-you-so and the czar's credit** in the fizzle.
- **The Deal's fingerprints in prose.** The slot prose is static per
  cell; only the ledger rows vary with what the player did.
- **The timeout narrated years later**, instead of a "Path:
  extrapolated" row.
- **Firm conversion as a mechanic.** The verdict sets `firm_converted`,
  and nothing reads it.

## 9. Continuity cleanup

Code-side seams the current-only docs no longer cover:

- `src/events/market.js:100` names a Zhaowei model "Qilin-4"; the line is
  Cangjie.
- `src/events/market.js:108` and `src/events/firm.js:89` call Liang Wei
  "Zhaowei CEO". He is the Premier everywhere else.
- `src/events/market.js` names real firms (TSMC, Goldman, Morgan Stanley,
  Gartner) against the lore rule. Cambria is the chipmaker; the banks and
  the analyst house need fictional names or none.
- `src/regulations.js:111` defines the Algorithmic Capability Disclosure
  Act, which no event activates or advances.
- The epilogue's stat block prints an "Alignment" row
  (`src/endings.js:398`) though its prose never says the word. Rename the
  row, or rule that the stat block is outside the tone rule.
- Stale code comments that cite retired names or deleted docs.

## 10. Satire and the state

These are content work, in the satire register. Calibration came from the
autumn of 2026 (real events are calibration, never content):

- **Supervision that arrives as certification infrastructure:** auditor
  frameworks, independent-verification statutes.
- **Liability as a second route into the control ratchet.**
- **Antitrust as a station on the treaty's farce gauntlet:** labs sued
  for coordinating to slow down.
- **An administration that renames the technology** in its communications
  and leaves the statute alone.
- **A lab-drafted federal bill** whose preemption clause is the point.
- **Beijing's Sputnik response to a demonstration:** a thousand
  scientists mobilized against the rival's last month of work.
- **The agent economy's first prints as absences.** Junior hiring in
  exposed occupations falls before anything else does.
- **The wonder that dispossesses.** A field's open problems are closed
  overnight, and the people best placed to understand it experience it
  as loss.

## 11. Feel, from a9's play-test

- The posterior: whether `K_CRED` 1.8 feels generous or stingy to a person
  (it is calibrated against synthetic players), and how the lock dispatch
  and editor feel at the fourth quarter rather than the first.
- The size of valuation gaps (a parity claim gaps HCN about 13%), and the
  rounds' cadence.
- The score.
- The reality-beats content and the capex rates channel.
- `ACT3_TUNING`'s magnitudes and latency ladder, and whether standing
  orders should lock at R5.

## 12. Small seams

- `tick()` in `main.js` is dead code.
- The `/` shortcut and `#step-btn` say "Step forward one day" but step
  one substep.
- Touch input on the curve editor is untested.
- The round dispatches have only been exercised headlessly. A live run
  past Polaris's spawn (around day 400) should see them.
