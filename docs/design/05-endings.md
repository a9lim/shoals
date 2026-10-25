# 05 — Endings

Resolution logic and epilogue philosophy. The epilogue is the Brief's
last edition, five pages — The resolution, The race, The reckoning, The
desk, The ledger — composed from a prose slot table keyed by family ×
overlay × page (`src/endings.js`); the engine composes no sentences of
its own. After it closes, the Race page reveals the internal tracks the
market never saw.

## Resolution inputs

From [02-race-model.md](02-race-model.md): leader identity × lead size ×
safety margin `S[leader]` × hidden tractability τ × takeoff sharpness ×
treaty state. Personal outcomes overlay world outcomes — they are
orthogonal axes, and the interesting epilogues live in the off-diagonal
cells (rich in a dying world; ruined in a saved one).

## World-outcome families

Families are presentation, not state. Resolution settles orthogonal axes
first — terminal cause, crossing entity, technical alignment result,
political control, treaty/fizzle state — then maps to a family by the
precedence ladder in [02-race-model.md](02-race-model.md). The
off-diagonal compositions stay expressible; the family is the cover
story.

1. **Won with margin.** Halcyon (or Polaris, in the runs where backing
   them worked) crosses first with a lead big enough to slow down at the
   end, and τ was kind enough that the margin sufficed. The wager
   vindicated. The epilogue's job is to make vindication feel *narrow*:
   relief, not triumph — but pay the prize honestly. The wonders arrive
   for real (the cures land, the growth prints, the boring miracle of a
   world that persists *and* compounds), and the epilogue lets the
   player feel what the margin bought before showing them how nearly it
   wasn't enough.

2. **Won on the knife-edge.** First across, corners cut — even by people
   who knew better, because the lead never opened up. Outcome degrades
   with `margin − requirement(τ)`: from "ambiguous dawn" (it works, and
   something in it is not quite what was intended — play the wrongness
   quiet and small: a negotiation that concluded oddly, a question the
   system declines, a melt-up no audit can fault) down toward family 3.
   The reluctant-accelerationist nightmare: being right about everything
   and it not being enough.

3. **Misaligned takeoff.** τ was bad, or margin was gone, whoever won —
   or a severity-4 incident ended the run in place. The epilogue is
   written in past tense by no identifiable narrator. The ledger appears
   once more — the final page prices the player's book in a currency
   that has stopped existing. This family should be *common enough to
   teach the priors* (the stance says: crapshoot, not in our favor).

4. **China first.** Resolved on two independent axes — does alignment
   hold, and who ends up in control — rather than presorted to doom: a
   misaligned Tianxia crossing is family 3 with subtitles, and an
   aligned one is aligned-to-Beijing (the world persists, ordered,
   airless — the epilogue tracks what happens to an American markets
   trader in a world whose optimizer answers to the Politburo). The
   outcome the wager existed to prevent; the epilogue should not let the
   player forget the wager also helped cause the race that produced it.

5. **The Deal.** Rare, live only when `chinaTrue.dealPossible` and the
   treaty arc survived its farce gauntlet. AI 2040's shape: verification,
   mutually assured compute destruction, the long plateau, alignment
   done slowly by people no longer racing. The player's fingerprints —
   the compute-reporting groundwork, the advice in the room — surface on
   the ledger page. Markets become boring again; the wonders still
   arrive — slower, argued over, *chosen* — and the epilogue lets boring
   feel like grace. The hardest ending to reach, and the only one where
   the *pre-takeoff market order* survives intact — family 1 keeps the
   world, but not the desk's ontology.

6. **The fizzle.** Low-`scalingElasticity` runs: the recursion term
   never ignites; scaling stalls, recovers, stalls again, and finally
   plateaus into a fact; the AGI trade unwinds. The player's great
   insight decays into a crowded, wrong consensus — being early is
   indistinguishable from being wrong, and the game says so with a
   straight face. Epistemic-honesty ending: the game's own thesis held at
   probability, not doctrine. Also quietly the funniest ending, because
   Washington gets to take credit for the plateau.

**Timeout:** a run still racing at day 1008 gets no seventh family — the
world's remainder is sampled forward from standing state and resolves
into one of the six, and the epilogue marks the path as extrapolated.
The desk's story ends when the term does; the world's doesn't.

## Personal overlays (orthogonal)

Margin-called out of history's biggest trade; convicted on the insider
channel; whistleblower exile (leaked the thing that mattered, standing in
ruins, vindicated by the family that resolves); the gray eminence
(involved: the player's actions moved the machine); the bystander (rich
or not, uninvolved, and the epilogue politely declines to pretend it
mattered). Each composes with any world family — the composition table
(page 3, one cell per family × overlay) is where the epilogue engine
earns its keep. The convicted, margin-called, and whistleblower overlays
come from how the desk's run ended; every other end splits gray eminence
vs. bystander on *involvement* — actions on the frozen ledger, never
beliefs ([02a](02a-tuning.md)).

## The ledger (complicity accounting)

Running through the whole game, surfaced fully only at the end: what
your capital did. The channels are those of
[02-race-model.md](02-race-model.md): capability financed (`C`, in rung
units and release days pulled forward), restraint bought and Polaris
runway (`S`), heat, the firm converted (`F`), and treaty stages
advanced. The final page is this accounting against the world outcome —
not a score, a *statement*, in the accounting sense and the other one.
In family 3 it reads as an indictment nobody is left to file; in family
5, as the only receipt that mattered.

The agency line appears **always, as a number** — one cold ledger line
in every family, a quantity, never a verdict. The machinery stores
`resolution.movability = {dP, dW, realizedShare}`; the ledger page prints
the realized share and lets the reader do the classifying, per the tone
discipline below. Soft-everywhere applied to the Landian question: the
number is the soft answer; "a low-agency world" would be the hard one.
No family gate — flinching in the dooms would read as the game
protecting you.

## Tone discipline

No family gets a lecture. The satire register is barred from the
resolution sequence entirely — the government can be funny right up
until the last act break, and then the game plays everything straight
to the end. One carve-out: the fizzle, the only family whose world
remains the satire's jurisdiction — nothing sacred happened, so the
register never has to yield. The epilogue's prose never says
"alignment," "x-risk," or "p(doom)"; it says what happened to named
characters, to the firm, to the number on the screen, and lets the
player do the classifying. Hard categories are the reader's job; the
game only ever shows the distribution collapsing.
