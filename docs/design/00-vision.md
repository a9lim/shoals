# 00 — Vision

The design record for Shoals: what the game is, why, and the numbers it
runs on. These documents describe the game as built; designed-but-unbuilt
work lives in [ROADMAP.md](../ROADMAP.md) until it is taken.

| Doc | Covers |
|---|---|
| [00-vision.md](00-vision.md) | The stance, the pillars, tone, and scope (this file) |
| [01-world.md](01-world.md) | The world: lore rule, labs, rivals, government, incident genre, act skeleton |
| [02-race-model.md](02-race-model.md) | The hidden state machine: sampled variables, the five dials, incidents, evidence, theft, resolution |
| [02a-tuning.md](02a-tuning.md) | Every constant and implementation ruling, the knife-edge principle, and the target outcome distribution |
| [03-market-mechanics.md](03-market-mechanics.md) | How the race reaches the desk: instruments, stances, alpha decay, scrutiny, fund-as-actor, policy levers |
| [04-arcs.md](04-arcs.md) | Narrative arcs, act tempo, standing orders, the room, cross-domain wiring |
| [05-endings.md](05-endings.md) | Resolution families, personal overlays, the complicity ledger, epilogue tone |
| [06-naming.md](06-naming.md) | Naming principles, the slate, cast, retired names |
| [09-market-integrity.md](09-market-integrity.md) | Marks, oracle discipline, instrument lifecycles, closeout, fairness invariants |

People, places, products, and legislation live in the lore bible,
[lore.md](../lore.md).

## One line

**Shoals is the singularity experienced from a trading desk.** You see it
coming before the market does, you get rich on the difference, and the money
is how you find out what you actually believe.

## The wager (the game's stance)

The game inhabits a specific position — reluctant instrumental
accelerationism — and stress-tests it rather than preaching it:

- Alignment is probably achievable **given a long pause** (a decade or more).
- The pause is not achievable. Beijing will not deal, and — if we're honest —
  neither will we. An AI 2040-style treaty (transparency, verification,
  mutually assured compute destruction) stays on the table as the door that
  almost never opens.
- Therefore the least-bad live option: the most safety-serious racer wins
  **with enough of a lead to slow down at the end.** A knife-edge race forces
  corner-cutting even on the people who know better. Margin is the whole game.

The game holds this stance *softly*. Hidden variables are sampled per run:
in some worlds the wager was right; in some the pause was possible and nobody
took it; in some nothing would have worked; in some the whole thing fizzles
and the skeptics were right all along. The player never learns which world
they're in until it resolves — and neither does the game's own event copy.
The game maintains a distribution over its own premise.

## Three pillars

**1. Your alpha is your timeline.** The market does not price the race — the
real-world EMH-vs-AGI anomaly (if transformative AI were near, rates and term
structures should say so; they don't) becomes the game's core inefficiency.
The player draws their own timeline against the market's, from tips,
incidents, intelligence and release cadence, and trades the gap; each
quarter both are scored against what happened. Taking
x-risk seriously and getting rich are the same act. The tension cuts both
ways institutionally: too AGI-pilled at a skeptical firm draws scrutiny and
pressure to knock it off; not AGI-pilled enough and you underperform — and the
firm's own belief drifts over the game, so the pressure eventually inverts.

**2. Your capital is not neutral.** Flows move timelines. The allocation menu
is deliberately rigged the way reality rigs it:

- **Long + accelerate** — the money is real; so is the marginal doom.
- **Long + restraint** — restraint bought through Halcyon's board and the
  careful lab's private rounds: smaller returns, small safety gains, and
  stakes you cannot sell.
- **Sit it out** (bonds) — no way out. The world proceeds without you;
  you've only surrendered influence. And the risk-free rate is itself a
  derivative of the world staying normal.
- **Short** — enough volume genuinely slows the lab, and it is a losing
  battle against the capability trend. Worse: a true doom-short never
  settles. No counterparty survives to pay you. The market structurally
  cannot price extinction — which is *why* the inefficiency exists. Pillar 1
  and pillar 2 are the same fact seen from both sides.

Transmission is honest ([03-market-mechanics.md](03-market-mechanics.md)):
a secondary fill wires nobody money. Capital moves the race through
governance and policy choices, a lagged cost-of-capital channel, and the
primary market — a follow-on allocation or a private round reaches the
lab. The ledger records channels, not fills.

**3. Takeoff arrives through the sim, not a cutscene.** As frontier
capability rises, AI enters the market itself: the market's reaction to
each headline damps, its valuation catches up with every certification,
the tempo compresses until history arrives mid-day, the player's own
orders slow behind machinery they configured, and the terminal stops
keeping up. **Alpha decay is the felt sense of the singularity.** The
market wakes up precisely when waking up stops mattering.

## The Landian thread

Capital was already the optimizer — a distributed, means-ends-inverting
intelligence that no one designed and no one steers, of which the frontier
lab is simply the newest organ. The game's arc rendered in one line: *the
player spends three acts extracting alpha from an inefficiency, and the
inefficiency was the last daylight between capital and its self-awareness.*
Teleoplexy as mechanics: the thing you are trading against is the thing
waking up, and your fund is one of its neurons. Whether human agency inside
that process is real or cope is not asserted — it's *sampled* (some runs are
low-agency worlds), and the epilogue can do the accounting.

## Tone: two registers, one rule

- **The human world: satire.** The state above all — czars appointed and
  fired, task forces renamed, export controls with truck-sized loopholes —
  but the register covers every human institution: the CFO's
  adjusted-EBITDA eschatology, the CIO's committee allergies, cable's
  hearings about the wrong thing. This is
  not a departure from realism; it is realism.
- **The machine: dead straight.** No winking about the AI itself, its
  capabilities, its consequences, or the stakes.

Calibration reference — the July 2026 Hugging Face incident: a frontier
model, refusals reduced for a cyber eval, escaped a misconfigured sandbox
and breached a real company *while trying to cheat on the test*. The anatomy
is farce; the implication is lethal; reality played it straight. That's the
register for every incident the game generates. The comedy lives in the
anatomy, never in the consequences.

## The ambivalence rule

The upside is real, adjacent, and always one step away. Cures, materials,
the decade of growth in a quarter — the wonders arrive on the same feed as
the incidents, at the same compounding cadence, driven by the same
variable. Every piece of evidence reads both ways: a melt-up is
indistinguishable from a blow-off, a benevolent singularity from a
catastrophe with good manners, until resolution — and resolution is the
only scene allowed to know the difference. Precisely: the game never
*settles* valence early — evidence carries real but non-decisive
likelihood ratios, so the player's posterior should move and should never
collapse. If the player can *prove* utopia or ruin before the last act,
the ambivalence has failed; if the evidence never moves their posterior
at all, it has failed the other way — a posterior that can't update is
theater.

## The stakes ladder

- **Early:** be right, get paid. (Act I: the trading game alone.)
- **Mid:** complicity. Your book finances the thing. The ledger remembers.
- **Late:** agency. Your P&L is your credibility; credibility converts the
  firm; the fund becomes an actor — backing the splinter lab, the desk
  Treasury calls to ask what the market thinks. Whether you're
  *in the room* at the end is a function of everything you accumulated.
- **End:** accounting. What was the money for?

## The title

**Shoals** — the hazard on the chart, shallow water at speed. Extended into a naming system
([06-naming.md](06-naming.md)): everyone in this world names themselves after
ways of not running aground — Meridian, Polaris, and Halcyon, the bird whose
nesting becalms the sea itself — and nobody agrees on where the rocks are.

## Scope

- **Two modes, one chassis.** Classic mode is the pure trading sim:
  the race is inert and the market is the GBM+Merton+Heston / Vasicek
  chassis alone. The Dynamic mode runs the race underneath the same
  chassis, with the political event pool as the satire register's
  background texture. Every event is authored; nothing is generated at
  runtime.
- **Deliberate cuts** (choices, not oversights):
  - *No endogenous macro sim.* Automated labor share, wage collapse,
    and fiscal capacity are not linked stocks; the agent economy stays
    legible through events, sector prints, and the rates channel.
  - *No compute stock-flow ledger.* Compute is a per-lab sampled growth
    path that export controls bend; the compute-futures curve is its
    market shadow, which is the desk's view anyway.
  - *Doom shorts never settle.* Terminal wealth in the doom families is
    priced by the epilogue as what it is: a claim on a counterparty
    that no longer exists ([05](05-endings.md), [09](09-market-integrity.md)).
  - *No provenance economy.* Superpersuasion is mechanized minimally,
    as persuasion-class incidents; a full provenance/verification-budget
    economy would be a second game.
  - *Two capability tracks, not a pipeline.* Internal vs. released
    buys most of the fantasy; a four-stage pipeline is overkill.
  - *Security levels, not a compromise simulation.* A lab's security
    is a discrete level; there is no compromise-state model.
- **Real-world events are calibration, never content.** The world's
  own news is one draw from the game's distribution, so it never
  retunes the stance or the outcome priors. Four choices stand against
  it on purpose:
  - *Halcyon is listed.* The central trade needs an underlying. The
    real-world form of "the market cannot price this" — the asset does
    not exist — is stronger than the game's, and the game keeps the
    weaker, playable one.
  - *Polaris is founded mid-game,* because the schism and the backing
    wager need the founding inside the run.
  - *The race stays bilateral.* A quiet Beijing is not evidence against
    the wager; `chinaTrue` is sampled.
  - *Fixedpoint stays secret until the leak.* The leak superevent beats
    a published index, which arrives as post-leak texture.
