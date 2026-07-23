# 04 — Narrative Arcs

> Event-content sketch, rev 2 (2026-07-23). All arcs run on the existing
> engine primitives — Poisson draws, `when` guards, followup chains,
> one-shots, recurring pulses, portfolio triggers — re-aimed. Tempo
> compression is the one new engine-level need (see note at bottom).

## Act tempo (the AI 2027 cadence trick)

Chapters cover less time as capability compounds. Mechanically: the event
engine's base rate scales with `max(C)`'s recursion term, and Act III
introduces *intraday* narrative events (events firing on substeps, not
just `_onDayComplete`) — the day stops being the atomic unit of history
exactly when it stops being one in-fiction.

**Standing orders (adopted 2026-07-23).** Tempo compression must not
mean more popups. Before R4 the game pushes the player to author
precommitments — standing orders, risk limits, leak policies, delegated
rules ("if a severity-3 prints, cut gross by half and call Tan").
During recursion the precommitments execute; manual interventions
become scarce, laggy, then advisory. Takeoff is felt as your own agency
migrating into machinery you configured earlier — the desk's version of
history outrunning the human decision cycle.

**Seeding rule (decided 2026-07-23): the hints start on day one.** Act I
is not quiet — it's *unheard*. Severity-0 incidents played for comedy, a
"Fixedpoint" half-sentence in a Meridian Brief, cadence arithmetic that
never decelerates, a mispriced Consensus binary. Everything Act III makes
deafening should be audible in Act I to a player who is listening, and
invisible to one who isn't. First playthroughs miss it; second
playthroughs can't stop seeing it. That asymmetry is the replay hook and
the game's honest claim about the real world.

## Core arcs

**The release ladder** (ports `model_release` machinery, multi-lab).
Releases are the race's metronome — and the rung claims that ride them
are the discourse's; Consensus settles on rung crossings, not vibes
([02-race-model.md](02-race-model.md)). Aleph keynotes, benchmark leaks, the
quiet capability that matters more than the loud one. Tianxia releases
are double events — capability *and* proliferation — that rally the
non-frontier complex while hitting HCN (the divergence-trade texture in
[03-market-mechanics.md](03-market-mechanics.md)). Halcyon cadence
quickens in Act III as Fixedpoint feeds back — the *cadence itself* is
evidence the player can trade and the market initially refuses to read.
Releases are choices now, not clockwork
([02-race-model.md](02-race-model.md)): publishing trades heat and
evidence for revenue and prestige, withholding is also a move, and the
internal−released gap is where Fixedpoint lives.

**The incident ladder** (the Hugging Face genre — see
[02-race-model.md](02-race-model.md)). Escalating severity, constant
anatomy, three wings: frontier accidents, misuse via refusal-stripped
Tianxia fine-tunes, and — past a rung — the persuasion class.
**Two-track** (a9, 2026-07-23): incidents occur silently and are
detected on a lag, or never; the market moves on detection, the damage
was done at occurrence, and the followup chain *is* the disclosure path
(occurrence → internal post-mortem → leak or disclosure → backlash),
every hop tradeable and leakable — trading the gap is also the
compliance arc's centerpiece. Undetected incidents compound, and a
quiet tape reads as margin or blindness; the player can't fully tell
which. Maps onto existing machinery: occurrence is a silent event,
detection its `scheduleFollowup` in new clothes.

**The evidence ladder** (adopted 2026-07-23 — the alignment twin of the
incident ladder). Technical evidence beats with sampled reliability: an
eval anomaly written up and disputed, a hidden-reasoning finding that
replicates once and then doesn't, a control experiment that means
everything or nothing. Found vs. published, as everywhere — labs sit on
results, and the insider channel sees what publication withholds.
τ-correlated, never τ-identifying. This trail is what the room
continues; without it the last decision would be ideology, with it the
room is a fight between posteriors.

**The insider channel** (ports `tips.js`, elevated to the game's moral
core). A safety-researcher source network grown through standing. Tips
arrive: eval results before disclosure, margin burned to make a launch
date, the Fixedpoint codename. Three verbs per tip — **trade it, leak it
(Rachel Tan), sit on it** — with distinct signatures across P&L, `B`,
`heat`, personal legal exposure, and the source's fate. Sources are
characters with followup chains; burning one closes the channel.

**The wonders track** (new — the pull side of the wager). A
model-designed molecule clears Phase I below the fold in Act I; by Act
III the cures, the materials, and the growth prints arrive in the same
feed as the incidents, at the same compounding tempo, driven by the same
variable. Every wonder is tradeable (sector rotations, a binary settling
YES) and every wonder is *evidence* — of exactly what, the game declines
to say. The ambivalence rule lives here: utopia stays one step away,
indistinguishable from the hazard until it is too late to matter. If the
wonders ever stop reading as slightly ominous, or the incidents as
slightly miraculous, the mix is mistuned.

**The ghostwritten world** (new — AI in the discourse, not just the
market). Midgame: the memos start reading like the model wrote them,
because they do. The CIO's quarterly letter grows bullet points and a
suspicious fondness for "delve"; a Lassiter floor speech arrives
fully structured; Cole's monologues tighten (he drafts in Halcyon Chat
and denies it). Played for comedy until it isn't: by Act III the
government flail turns abruptly *competent* — loopholes close, the
czar's testimony parses — precisely when the memos stop being human,
which is the satire register's last joke and the straight register's
first warning. Synthetic analysis moves Consensus; op-eds nobody can
source move `B`; Tan's three-source rule meets sources that may not be
people. And the player's own edge decays in parallel (alpha decay,
[03-market-mechanics.md](03-market-mechanics.md)) — the same model is on
every desk, eventually including theirs. Mechanized (2026-07-23): past
a rung, targeted campaigns exist as events that move `B`, `F`, and
faction standings *adversarially* — somebody's model is optimizing the
feed — and insider-channel source trust becomes attackable. A campaign
is a persuasion-class incident by construction: occurrence quiet,
detection the scandal ([02-race-model.md](02-race-model.md)).

**The Polaris schism** (ports the founder-rival machinery). A scaling
decision goes the wrong way; the walkout is a superevent; the founding
sets up the fund-as-actor wager. Ongoing arc: Polaris as conscience,
competitor, and compute-starved supplicant — and, in some worlds, the
margin-carrier that matters at resolution.

**The treaty track** (the Reykjavik Framework — AI 2040-shaped).
Verification talks surface early
and die of farce (satire register: the summit collapses over seating
protocol). Mid-game, compute-reporting groundwork (player-lobbyable)
keeps the door ajar. Act III: the window — one live negotiation, its
viability secretly gated on `chinaTrue.dealPossible` and publicly gated
on nobody having a bad incident during summit week. Mostly it fails. The
failure should feel like the world's fault, not the dice's.

**China in the dark** (ports trade-war arcs, re-aimed). Export controls
vs. the domestic Tianxia-constituency (American firms lobbying against
their own government's controls — satire register meets market
mechanics), Cambria allocation politics in two capitals, Tianxia
releases read like seismograph data — and the weight-theft beat, now
load-bearing ([02-race-model.md](02-race-model.md)): the exfiltration
that erases the lead overnight, the guards-vs-GPUs budget fight leaking
through the insider channel, the post-theft politics ("why slow down if
it can be stolen") that burn margin race-wide. Attribution — spies, or
the model itself — stays sampled and disputed. **And the strait:**
Cambria's fabs sit a hundred miles from the coast Beijing drills off of;
gray-zone incidents and blockade scares are recurring risk-premium
machinery, and in some runs the tail fires. Losing the race
conventionally makes the unconventional option more attractive — the
market prices the coupling before the Pentagon says it. Intelligence
about `chinaTrue` arrives with sampled reliability; the player's China
posterior is as tradeable as their timeline.

**The firm conversion** (ports quarterly review). Act I: the skeptical
CIO and the scrutiny loop. Act II: the grudging memo — "walk me through
the thesis." Act III: conversion or ejection; if converted, the CIO
becomes the player's amplifier and the fund's book becomes a
race-relevant flow. The relationship is the game's most persistent human
throughline — the person who thought you were crazy, deciding out loud
how much crazy the evidence now licenses.

**The government flail** (satire register, background pulse like the
prototype's filibuster/media pulses). Czars, hearings about the wrong
thing, an evals office defunded the week it matters, export rules that
ban chips and rediscover — in public, twice — that weights don't
un-release. Foreign policy beyond China appears only here, as
one-liners: the Russian border flare answered by post, the OPEC cut that
matters because datacenters eat power. Occasionally the flail lurches
into consequence, and the market moves more on the noise than the signal
— which is itself a lesson the player can monetize.

## The room (endgame branch point)

One decision event, Act III, AI 2027's branch rendered as earned access:
when the leader lab reaches the final scaling decision (or the treaty
window peaks, whichever the run serves), *whether the player is present*
— and what weight their voice carries — is a pure function of accumulated
standing: firm credibility, safety-network trust, Treasury backchannel,
lab relationships. Low-standing runs experience the ending as weather, on
the news, positions frozen. High-standing runs get the terrible
privilege: advise speed, advise margin, advise the deal — one voice among
several, never a control knob. The room is influence, not authorship;
hidden state still resolves the world. You bought a seat, not the
steering wheel. And the room arrives at the end of the evidence ladder
— a fight between posteriors the run actually produced, not a cold
ideological prompt.

## Cross-domain wiring (new spine)

- Incidents → `B` jumps *on detection* → alpha decay ↑ → scrutiny loop
  dynamics shift
- Incidents → regulation pipeline → `heat` ↓ (briefly) → treaty
  preconditions
- Undetected incidents → no backlash cooling → margin illusion → `S`
  mispriced by everyone, including the player
- Incident-reporting regime → detection lag ↓ → `B` accuracy ↑ → alpha
  decay ↑ — the player can lobby the world safer and their own edge
  thinner
- `controlRegime` ratchet → disclosure becomes classification → insider
  channel value ↑, Consensus thins, the nationalization trade looms
- Tianxia release → `C[tianxia]` ↑ + `heat` ↑ (permanent) + non-frontier
  rally → divergence trades + constituency strengthens → export controls
  harder to pass
- Polaris backing → Halcyon board dynamics → CEO speed decisions → `S`
- Export controls → Tianxia stumble → Halcyon lead ↑ → `heat` ↓ (comfort)
  — the game quietly rewarding hawkishness with safety margin, which is
  the reluctant-accelerationist trap working as intended
- Strait scare → compute-curve backwardation + VXHCN wings bid →
  export-control politics sharpen → `heat` ↑ (the physical layer is the
  race's shortest fuse)
- Weight theft → lead evaporates → margin rationale collapses (`S` ↓
  race-wide) → mobilization politics → the treaty dies or gets suddenly
  serious — sampled
- Wonders → `B` ↑ (the market believes for the nice reason) → melt-up
  pressure → the same alpha decay as dread — the ambivalence rule as
  wiring
- Leaks → Tan's credibility ladder (ports `tanCredibility`) → public
  pressure → evals regime viability
- Everything → the ledger ([05-endings.md](05-endings.md) complicity
  accounting)

## Engine notes

Needs beyond current primitives: (1) event base-rate scaling with world
state (currently constant-rate Poisson + pulses); (2) substep-resolution
events in Act III; (3) the explicit player-posterior input for the
implied-timeline dashboard; (4) the advice/memo interaction surface
(popup-with-consequences machinery mostly covers it); (5) the
latent-event split — occurrence fires silently, detection fires public
(mostly `scheduleFollowup` in new clothes, plus a never-fires tail);
(6) the standing-orders/delegation layer — the one genuinely new
interaction surface. Everything else is
content on existing rails.
