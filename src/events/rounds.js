/* ===================================================
   src/events/rounds.js -- Primary-market dispatches
   (02a "Private rounds and primary offerings").

   Authored copy from the ratified rounds prose sheet.
   Called at show time, when the allocation cap is known;
   tokens are filled from public round records only.
   Choices declare intent; main.js applies their effects
   through the single popup-choice chokepoint.

   Pure / DOM-free; no pricing or portfolio mutations.
   =================================================== */

import { fmtDollar } from '../format-helpers.js';

const POLARIS_CHOICES = [
    {
        label: 'Take the full allocation',
        desc: 'Units at the round price, marked at the last round and illiquid until the race ends. The money reaches Boulder.',
        resultToast: 'Wired. Boulder’s place in the compute queue moves up a slot.',
    },
    {
        label: 'Take half',
        desc: 'A position, not a statement.',
        resultToast: 'Wired, half.',
    },
    {
        label: 'Pass',
        bystander: true,
        desc: 'The round fills without you. It always does.',
        resultToast: 'The round closes oversubscribed.',
    },
];

const HALCYON_CHOICES = [
    {
        label: 'Take the full allocation',
        desc: 'New shares at the offering price. They trade like any other HCN; the cash pays for Halcyon’s next training run.',
        resultToast: 'Allocated in full. The prospectus says “general corporate purposes,” which this quarter means wafers.',
    },
    {
        label: 'Take half',
        desc: 'Some of the discount, some of the money.',
        resultToast: 'Allocated, half.',
    },
    {
        label: 'Pass',
        bystander: true,
        desc: 'Someone else funds the run.',
        resultToast: 'The book covers three times over without you.',
    },
];

/** Compose a dispatch from its public round and the show-time allocation cap. */
export function roundDispatch(round, offered) {
    const amount = fmtDollar(offered);
    const price = '$' + round.price.toFixed(2);
    let headline, context, choices;
    if (round.kind === 'halcyon') {
        headline = 'Halcyon sells new stock';
        context = `Somebody has to pay for the compute. Halcyon is selling new shares at ${price}, three percent under the screen, and HCN has already given back two percent on the dilution. Meridian is offered up to ${amount}. Unlike a trade on the screen, this money reaches the lab.`;
        choices = HALCYON_CHOICES;
    } else if (round.kind === 'polaris') {
        choices = POLARIS_CHOICES;
        if (round.founding) {
            headline = 'Polaris opens its first round';
            context = `Boulder has a term sheet. The founding round prices a unit at one dollar, which is the venture way of saying nobody knows, and Meridian is offered up to ${amount}. The money buys wafers for the people who walked out over a scaling decision. It cannot be sold before the race ends, and it will be marked at whatever the next round says it is worth.`;
        } else if (round.ratio >= 1.05) {
            const mult = round.ratio.toFixed(1) + '×';
            const reason = round.rungGain > 0
                ? `a Holt release claiming R${round.claimedRung}` : 'the frontier’s momentum';
            headline = `Polaris raises its Series ${round.letter}, higher`;
            context = `The round prices a unit at ${price}, ${mult} the last, on the strength of ${reason}. Meridian is offered up to ${amount}. Every round is the same bet made at a new price: that the careful lab is still in the race when the race is decided.`;
        } else if (round.ratio >= 0.95) {
            headline = `Polaris raises its Series ${round.letter}, flat`;
            context = `The round prices a unit at ${price}, where the last one did. Six months of careful work and nothing to announce, in a market that prices announcements. Meridian is offered up to ${amount}.`;
        } else {
            const pct = Math.round((1 - round.ratio) * 100);
            headline = `Polaris raises its Series ${round.letter}, lower`;
            context = `The round prices a unit at ${price}, ${pct}% under the last: a quiet half-year, and wafers are not getting cheaper. Down rounds are how the careful lose without ever being wrong. Meridian is offered up to ${amount}.`;
        }
    } else {
        throw new Error('Unknown primary round kind: ' + round.kind);
    }
    return {
        id: round.id,
        popup: true,
        category: 'rounds',
        magnitude: 'moderate',
        headline,
        context,
        // Pass subscribes nothing, so it carries no `round` (02a "The run,
        // headless": a bystander choice carries no subscription).
        choices: choices.map((choice, i) => choice.bystander ? { ...choice } : {
            ...choice,
            round: { kind: round.kind, id: round.id, take: [1, 0.5][i] },
        }),
    };
}
