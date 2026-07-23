# 07 — Migration & Restructure

> Rev 2 (2026-07-23), scoped up per a9: not a file-by-file migration but a
> **narrative-layer rewrite on a preserved market chassis**. The engine
> mostly survives; the content layer is rebuilt new-for-new rather than
> edited in place. This file is the implementation-facing index — keep it
> honest as designs settle, then fold conclusions into a rewritten
> AGENTS.md when code work starts.

## The shape of the restructure

**Preserved chassis** (algorithmically preserved, structurally extended
— not untouched): `pricing.js`, `position-value.js`, the tree machinery, `chart.js`,
`portfolio.js`, the impact overlay, `strategy*.js`, the audio engine,
`ui.js` shell, the sim core (GBM+Merton+Heston, Vasicek), `simulation.js`.
This layer is good and hard-won; the overhaul barely touches its
algorithms — but binaries and compute futures are new instrument classes
that pass through portfolio/position-value/UI interfaces, and Act III's
drift needs an authoritative regime-switch or execution-price wrapper on
the sim core (cosmetic terminal degradation alone cannot make the
underlying actually drift). One
semantic change rides on it: the anonymous underlying becomes **HCN**
(Halcyon common), which costs nothing mechanically and makes every
existing mechanic thematic (see [03-market-mechanics.md](03-market-mechanics.md)).

**Rebuilt narrative layer** (new-for-new — do not edit the old files into
the new ones; write fresh against the design docs and delete the old):

- `src/events/*` → new domain set: `halcyon.js`, `china.js` (Tianxia +
  the strait + Beijing politics), `polaris.js`, `incidents.js`,
  `wonders.js`, `policy.js`, `treaty.js`, `firm.js`,
  `insider.js` (tips.js successor), `macro.js`, `media.js` (incl. the
  ghostwritten-discourse beats), `interjections.js`. The unified event schema, followup chains,
  one-shots, and pulse machinery carry over as *conventions*; the content
  does not.
- `world-state.js` → rebuilt around the five dials + auxiliary state
  (`controlRegime`, per-lab security levels, two-track `C`, the latent
  incident queue) + slim domain state;
  the pnth/aegis/companion/meridia domains die with their arcs.
- `faction-standing.js` → roster v2 (keep firmStanding,
  regulatoryExposure, mediaTrust, fedRelations, the party pair; add
  safety-network trust and lab relations; firm belief `F` lives here or
  beside).
- `traits.js` → conviction set v2 (agi-pilled, doomer, accelerationist,
  deal-believer, insider, whistleblower, …).
- `endings.js` → families × overlays per [05-endings.md](05-endings.md);
  the 5-page adaptive engine survives, the content is new, the ledger
  becomes the final page.
- `regulations.js` / `lobbying.js` → pipeline machinery survives; menus
  and bills are new ([03-market-mechanics.md](03-market-mechanics.md)).
- `lore.md` → full rewrite. `about.md`, `art-prompts.md` follow.

**New builds** (no prototype ancestor), proposed as a `src/race/` cluster:
`sampler.js` (hidden-state per-run config, incl. `scalingElasticity`),
`capability.js` (per-lab two-track `C_internal`/`C_released`,
the rung ladder, recursion term, release-as-decision coupling, the theft
discontinuity, security levels), `incidents.js` generator (two-track
occurrence/detection, persuasion class; evidence beats ride the same
latent-queue machinery), `belief.js`
(`B`, implied timeline, locked player posterior, credibility/Brier),
`ledger.js` (complicity accounting). Plus: milestone binaries + Consensus
settlement, compute futures, the dashboard UI, the advice/memo surface,
the standing-orders/delegation layer,
the room, Act III tempo compression and the diegetic terminal-degradation
layer.

## Process decisions

- **Naming is one atomic pass at code-phase start** — grep-driven,
  internals included. A prototype's worth of identifiers is not worth
  preserving against clarity: `vix` → `vxhcn` in ids and DOM where it
  appears, `pnth` dies entirely, and the geography pass runs the same
  day — `serica*` → `china*` (yes, reversing the prototype's
  `chinaRelations` → `sericaRelations` rename; the wheel turns) and
  Columbia → America in every string. Do it before any new content lands so
  nothing new is written against dead names.
- **Mode-gating instead of every-step-playable.** Classic (non-Dynamic)
  mode stays green throughout — it exercises the whole preserved chassis.
  The Dynamic narrative modes are allowed to go dark during the rebuild;
  they come back arc-cluster by arc-cluster. This is what frees the
  rewrite to be a rewrite.
- **AGENTS.md gotchas remain binding until the code they describe is
  deleted** — delete entries *with* their code, not before. The rewritten
  AGENTS.md is an end-of-migration artifact, not a beginning one.
- `llm.js` Dynamic (LLM) mode: keep. The in-fiction resonance (the game
  about the race narrated by a frontier model) is now a feature, not a
  coincidence — worth one knowing line in about.md, nothing more. Its
  tool schema rebuilds against the five dials, which should *shrink* the
  whitelist surface.

## Survives as background texture

Bowman offshore scandal, filibuster/media pulses, midterms, energy shocks
(datacenter-relevant now), Bolivian lithium (compute supply chain),
Russia (risk-premium one-liners; canonically the *second* buyer in the
weight-theft beat). All of it now competes for attention with the race —
losing that competition *is* the satire.

## Order of work (code phase, when it starts)

0. **Naming pass** (atomic, everything at once)
1. `src/race/` skeleton behind the existing world-state pattern — sampler
   + five dials wired but invisible; Classic mode untouched
2. Events spine: incident generator + generalized release machinery (the
   first new content flows)
3. Instruments: binaries first (they make `B` visible and testable), then
   compute futures, then the VXHCN/HCN re-skin
4. `belief.js` + `η` coupling + scrutiny loop rework (alpha decay live)
5. Content sweep: the new domain files, arc by arc, Dynamic mode
   returning cluster by cluster
6. Endings + ledger
7. Act III: regime break, tempo compression, terminal degradation
   (riskiest, most interlocked — last)

## Docs-phase queue (before any code)
1. ✓ Mechanics-tuning appendix — [02a-tuning.md](02a-tuning.md)
   (2026-07-23; first-pass numbers, target outcome distribution as the
   tuning contract)
2. ✓ Market-integrity spec — [09-market-integrity.md](09-market-integrity.md)
   (2026-07-23; four marks, lifecycle per instrument, regime overlay,
   post-1008 claims, fairness invariants)
3. ✓ AGENTS.md points at docs/design/ as the overhaul's source of
   truth ("Overhaul status" section, 2026-07-23). **The docs phase is
   complete; the code phase can open** — step 0 is the atomic naming
   pass above.
