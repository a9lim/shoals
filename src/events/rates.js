/* ===================================================
   src/events/rates.js -- The capex channel (reality-beats
   round, 02a "Rates: the capex channel").

   03's Act-II sentence -- "AI capex distorts the long end"
   -- given its mechanism: each RISE of the public released-
   frontier rung fires ONE `rates_capex_wave` (R1->R2 ...
   R4->R5, <= 4 per run) carrying a PERMANENT additive delta to
   the Vasicek long-run rate `b` (+0.005) and rate vol `sigmaR`
   (+0.001). Issuance is a stock; the premium persists. `r`
   mean-reverts toward the new `b` at speed `a` over the
   following weeks -- the front-run is legible on the chassis.

   Rates move WITH the race for a reason that is NOT the race:
   duration supply, not discount rate. The implied-timeline
   dashboard never reads rates (03), so this moves `r` without
   moving `B` -- a rate rise that is mundane, legible, and
   mistakable for the market waking up.

   VOLUME RULE: this is a LOW-volume pool (<= 4 fires/run), so
   the prototype's additive-delta convention applies. The 03
   incident-coupling rule (impulse-only) binds the HIGH-volume
   race stream and does NOT bind this shell -- recorded in 02a
   so nobody "fixes" it into an impulse. It is not a race shell.

   Category 'rates' is Poisson-EXCLUDED (events.js) -- fired
   from the race bridge on the released-rung rise edge only
   (rise-edge, never hold, never same-day replay). Classic mode:
   no race, no bridge, never fires -- Act I (R1) is bit-identical
   because nothing has risen yet.

   PROSE: final (coordinator-written, 2026-09-08). Token-free.
   The bridge rotates the pool deterministically per fire, so
   the four variants land on the four rung steps IN ORDER --
   they are written as an ascending sequence, not alternates.
   =================================================== */

export const RATES_EVENTS = [
    {
        id: 'rates_capex_wave',
        category: 'rates',
        magnitude: 'moderate',
        headlines: [
            // R1 -> R2: the first wave; Sharma answers her own question.
            'The long end sells off for a reason that is not the race and is entirely the race: Halcyon prices a convertible, two hyperscalers print thirty-year paper the same week, and the datacenter pipeline for the new cadence is now a line item in Treasury supply. Sharma answers her own question from a year ago in one column: "Rates are not normal. They are pricing the buildings. Do not mistake the buildings for the thing inside them." The desk marks the curve. The curve is telling the truth about concrete.',
            // R2 -> R3: term premium, the word for a rate that rose without a decision.
            'Issuance wave. Every name with a GPU order books a deal; the long bond gives up ground on supply the way it used to give up ground on inflation, and the Fed says nothing, because none of this is the Fed. Term premium, the strategists call it, which is the word for a rate that rose without anyone deciding anything. The market has begun to price the race. It is pricing the wrong half.',
            // R3 -> R4: "risk-free" gets its air-quotes.
            '"Risk-free" gets air-quotes on the desk for the first time. The rate you discount the future at is now, arithmetically, a function of how many buildings the future needs, and the buildings need more every quarter. Sharma: "If you think rates are finally saying what the timeline says, look at who is borrowing. It is not the future. It is the landlord."',
            // R4 -> R5: the last step; the edge is almost gone.
            'The last step. The curve has repriced four times on four release ladders, each time for the same mundane reason — somebody had to finance the compute — and each time a strategist wrote that the market was "finally taking AI seriously." It was taking duration supply seriously. The distinction is the desk\'s whole edge and it is, this morning, almost gone: the long end is where the race is being paid for, and nowhere on it is the race being priced.',
        ],
        // PERMANENT additive delta -- ratified 02a "Rates: the capex channel". Clamped
        // to PARAM_RANGES by the standard params path like every Fed step. No
        // `impulse`: the permanent step IS the market effect; an impulse on top
        // would double-count it.
        params: { b: 0.005, sigmaR: 0.001 },
    },
];
