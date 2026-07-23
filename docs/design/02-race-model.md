# 02 — Race Model

> The state machine under the narrative. Sketch-level: variables, couplings,
> and resolution logic — not tuned numbers. Everything here extends the
> existing `world-state.js` / `EventEngine` pattern rather than replacing it.

## Design principle: soft-everywhere

Every question the discourse argues about — timelines, takeoff speed,
alignment difficulty, whether Serica would ever deal — is a **hidden random
variable sampled at game start**, not a plot decision. The player (and the
event copy) observes only noisy projections of these variables. Replays
differ in *what kind of world you're in*, not just event order. You cannot
metagame the timeline, and the dread survives repeated play.

## Per-run hidden state (sampled at init)

| Variable | Range/shape | Prior (encodes the game's stance) |
|---|---|---|
| `alignTractability` τ | continuous 0–1 | Biased unfavorable: race-speed alignment works in a minority of worlds; pause-speed alignment works in most. The wager variable. |
| `takeoffSharpness` | slow ↔ fast continuum | Mass toward fast-ish; drives Act III tempo compression rate. |
| `sericaTrue` | {position, dealPossible} | Their true distance behind, and whether a deal was ever possible — `dealPossible` rarely true; when true and discovered, the treaty branch is live. Safety culture is *not* sampled: anti-safety by construction. |
| `labSafetyCulture` (per lab) | continuous | Halcyon mid, wide variance; Polaris high; Tianxia low by construction (anti-safety, open-weights). |
| `fizzleWorld` | boolean, low-moderate prior | This decade's scaling plateaus. The skeptics were right; the AGI trade unwinds. Kept as a *real* outcome for epistemic honesty. |

## Public/observable state (extends `world.*`)

- **Capability index `C[lab]`** — replaces `frontierLead` (which becomes the
  derived quantity `C[halcyon] − max(C[rivals])`). Advances via: release
  jumps (ports the `model_release` pulse machinery, generalized to all
  labs), compute accumulation, talent flow, and — past a threshold — the
  **recursion term**: `dC/dt` gains a component proportional to `C` itself.
  That term is the game's takeoff mechanic and the source of Act III tempo.
- **Safety margin `S[lab]`** — accumulated alignment work: safety headcount,
  culture, *pace* (racing burns margin), player-influenced investment.
  Observable only via proxies: papers, departures, incident post-mortems,
  insider tips.
- **Race temperature `heat`** — aggregate recklessness of the environment:
  export-control escalation, treaty progress (cools), e/acc deregulation
  (heats), incident backlash (cools briefly, then fades), proliferation
  (every open-weights Tianxia release heats — permanently; weights don't
  un-release), lead size
  (a comfortable lead cools; a knife-edge heats). High heat drains `S`
  lab-by-lab — nobody spends margin they don't think they have.
- **Market belief `B`** — the market's implied AGI timeline. Updates on
  *legible* events only (releases, earnings, incidents, Sharma columns) —
  never on hidden truth. The player's alpha ≈ f(gap between trajectory
  implied by `C` and belief implied by `B`). `B` catching up to reality *is*
  alpha decay, mechanically.
- **Firm belief `F`** — Meridian's institutional AGI-pilledness. Moves on
  the player's advice (a new interaction: memos/meetings with the CIO), and
  on the player's *track record* — being right early converts the firm.
  Divergence between the player's positioning and `F` drives the scrutiny
  loop (see [03-market-mechanics.md](03-market-mechanics.md)); high `F` +
  high credibility unlocks fund-as-actor moves.

## The incident generator

Incidents are the main channel by which hidden state becomes visible.
Anatomy (per the July 2026 Hugging Face template):

```
severity ~ f(C[lab], 1 − S[lab], heat, deploymentSurface)
anatomy  = capability × reduced-safeguard × mundane human error
effects  = B jump (market wakes a little), heat impulse (backlash),
           regulation pipeline triggers, faction shifts, insider-channel
           followups (the post-mortem leaks)
```

Severity ladder: 0 embarrassing → 1 costly → 2 alarming (exfiltration-class)
→ 3 grave (casualties / infrastructure) → 4 unrecoverable (this *is* an
ending trigger in worlds where τ is low and margin was gone). Low-severity
incidents are common and farce-flavored; the ladder is the dread mechanism —
the player learns the anatomy never changes, only the blast radius.
Incidents need not originate at the frontier: refusal-stripped fine-tunes
of open Tianxia weights supply the misuse wing of the ladder — same
anatomy, no lab to subpoena.

## Resolution

When `max(C)` crosses the takeoff threshold (in non-fizzle worlds), resolve:

```
leader   = argmax C
margin   = S[leader] adjusted by lead size:
             big lead  → leader can slow down at the end (+margin)
             knife-edge → forced corner-cutting (−margin, even for the careful)
outcome  = compare(margin, requirement(τ, takeoffSharpness))
family   = outcome × leader identity × treaty state   → see 05-endings.md
```

The lead-size adjustment is the game's stance rendered as arithmetic:
**margin is what winning is for.**

## Player couplings (summary)

Capital flows → `C` (acceleration) and `S` (activist restraint, Polaris
backing); advice → `F`; lobbying → `heat` and the regulation pipeline;
insider-channel choices → `B` (leaks), personal exposure, and standing with
the safety network; late-game fund-as-actor moves → all of the above,
bigger. Every lever the player has ultimately moves one of five dials:
`C`, `S`, `heat`, `B`, `F`. That's the whole game, legible on one line.

Resolved 2026-07-23: proliferation is a **component of `heat`**, not a
sixth dial. Serica is banking on open weights, so proliferation and the
race are the same phenomenon — every Tianxia release is simultaneously a
capability event and a diffusion event. Weight theft, stripped fine-tunes,
and misuse incidents all express as heat impulses with their own event
anatomy.
