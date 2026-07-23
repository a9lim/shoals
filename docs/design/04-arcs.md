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
Releases are the race's metronome: Aleph keynotes, benchmark leaks, the
quiet capability that matters more than the loud one. Tianxia releases
are double events — capability *and* proliferation — that rally the
non-frontier complex while hitting HCN (the divergence-trade texture in
[03-market-mechanics.md](03-market-mechanics.md)). Halcyon cadence
quickens in Act III as Fixedpoint feeds back — the *cadence itself* is
evidence the player can trade and the market initially refuses to read.

**The incident ladder** (the Hugging Face genre — see
[02-race-model.md](02-race-model.md)). Escalating severity, constant
anatomy, two wings: frontier accidents and misuse via refusal-stripped
Tianxia fine-tunes. Each incident spawns a post-mortem followup chain
through the insider channel; the public version and the true version
diverge, and the gap is tradeable — and leakable.

**The insider channel** (ports `tips.js`, elevated to the game's moral
core). A safety-researcher source network grown through standing. Tips
arrive: eval results before disclosure, margin burned to make a launch
date, the Fixedpoint codename. Three verbs per tip — **trade it, leak it
(Rachel Tan), sit on it** — with distinct signatures across P&L, `B`,
`heat`, personal legal exposure, and the source's fate. Sources are
characters with followup chains; burning one closes the channel.

**The Polaris schism** (ports the founder-rival machinery). A scaling
decision goes the wrong way; the walkout is a superevent; the founding
sets up the fund-as-actor wager. Ongoing arc: Polaris as conscience,
competitor, and compute-starved supplicant — and, in some worlds, the
margin-carrier that matters at resolution.

**The treaty track** (AI 2040-shaped). Verification talks surface early
and die of farce (satire register: the summit collapses over seating
protocol). Mid-game, compute-reporting groundwork (player-lobbyable)
keeps the door ajar. Act III: the window — one live negotiation, its
viability secretly gated on `sericaTrue.dealPossible` and publicly gated
on nobody having a bad incident during summit week. Mostly it fails. The
failure should feel like the world's fault, not the dice's.

**Serica in the dark** (ports trade-war arcs, re-aimed). Export controls
vs. the domestic Tianxia-constituency (Columbian firms lobbying against
their own government's controls — satire register meets market
mechanics), Cambria allocation politics, Tianxia releases read like
seismograph data — and the weight-theft beat: an Aleph checkpoint
exfiltrated (by spies, or — in high-`C` worlds — by itself; the game
should let the ambiguity stand). Intelligence about `sericaTrue` arrives
with sampled reliability; the player's Serica posterior is as tradeable
as their timeline.

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
un-release. Foreign policy beyond Serica appears only here, as
one-liners: the border flare answered by tweet, the energy shock that
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
steering wheel.

## Cross-domain wiring (new spine)

- Incidents → `B` jumps → alpha decay ↑ → scrutiny loop dynamics shift
- Incidents → regulation pipeline → `heat` ↓ (briefly) → treaty
  preconditions
- Tianxia release → `C[tianxia]` ↑ + `heat` ↑ (permanent) + non-frontier
  rally → divergence trades + constituency strengthens → export controls
  harder to pass
- Polaris backing → Halcyon board dynamics → CEO speed decisions → `S`
- Export controls → Tianxia stumble → Halcyon lead ↑ → `heat` ↓ (comfort)
  — the game quietly rewarding hawkishness with safety margin, which is
  the reluctant-accelerationist trap working as intended
- Leaks → Tan's credibility ladder (ports `tanCredibility`) → public
  pressure → evals regime viability
- Everything → the ledger ([05-endings.md](05-endings.md) complicity
  accounting)

## Engine notes

Needs beyond current primitives: (1) event base-rate scaling with world
state (currently constant-rate Poisson + pulses); (2) substep-resolution
events in Act III; (3) the explicit player-posterior input for the
implied-timeline dashboard; (4) the advice/memo interaction surface
(popup-with-consequences machinery mostly covers it). Everything else is
content on existing rails.
