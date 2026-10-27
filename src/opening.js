/* =====================================================
   opening.js -- The opening hand (02a "The evening").

   A Dynamic run starts on an inherited desk instead of
   cash: the book of a portfolio manager who has left
   Meridian, drawn uniformly from the fixture table by
   its own stream, so a seed always deals the same hand
   and the draw consumes no race stream. The takeover
   seats the book at day 0's opening marks, records the
   obligation, places the working order and solves cash
   so that equity, net of the obligation, is exactly
   INITIAL_CAPITAL. Classic starts on cash.

   DOM-free: main.js deals the hand at boot and posts the
   memo and the archived reports to the wire; the
   harness (tools/opening-test.mjs) drives it headless.
   ===================================================== */

import { INITIAL_CAPITAL, STRIKE_INTERVAL } from './config.js';
import { createRng, deriveSeed } from './race/rng.js';
import { market } from './market.js';
import { unitPrice } from './position-value.js';
import { portfolio, portfolioValue, seatPosition, placePendingOrder } from './portfolio.js';
import { baselineMMHedge } from './price-impact.js';
import { consensus, BINARY_NOTIONAL } from './race/consensus.js';

// ---------------------------------------------------------------------------
// The fixture table
// ---------------------------------------------------------------------------
//
// Sizes are fractions of E0 (takeover equity) at the takeover marks:
//   value    -- the position's market value
//   maxLoss  -- a short binary's maximum loss, (notional - mark) x qty
//   cover    -- the same quantity as the book's position of that type
// `expiry` is a listing position on the chassis grid (0 is the nearest listed
// expiry, relative day 63; -1 the farthest); a binary names its rung's
// certification contract. The obligation's `amount` is a fraction of E0 and its
// `dueDay` a run-relative day (02a "Dates").

/** The hands by name, for the almanac's runs. */
export const HAND_NAMES = Object.freeze({ catalyst: 'The catalyst', insurance: 'The insurance', illiquid: 'The illiquid', wall: 'The wall' });

export const FIXTURES = [
    {
        id: 'catalyst',
        predecessor: { name: 'Paul Brennan', left: 'left for a multi-manager fund in Greenwich' },
        memo: 'Paul Brennan’s handover: the HCN position is the trade, and it’s working. Consensus prices autonomous engineering certified by day 420 at seventy cents; I think the next Aleph claims it well before that, and the stock moves on the claim, not the audit. The calls are for that week. The Ostrander redemption is the catch: a quarter of the book, in cash, by day 40, and less than half of it is cash today. I left a sell at 106 to raise it on strength. If 106 doesn’t come, you choose what to sell into weakness. Sorry about the timing. — P.B.',
        reports: [
            { category: 'halcyon', headline: 'Halcyon’s capex will be “meaningfully higher” next year, Malhotra tells analysts; the next Aleph is “on the schedule we’ve always had,” which nobody outside the building has seen.' },
            { category: 'market', headline: 'The Street is long Halcyon and short an opinion about when, says MarketWire’s Sharma.' },
        ],
        obligation: { kind: 'redemption', label: 'the Ostrander redemption', amount: 0.25, dueDay: 40 },
        book: [
            { type: 'stock', side: 'long', value: 1.10 },
            { type: 'call', side: 'long', strike: 115, expiry: 1, value: 0.04 },
        ],
        order: { type: 'stock', side: 'short', orderType: 'limit', trigger: 106, value: 0.30 },
    },
    {
        id: 'insurance',
        predecessor: { name: 'Ines Varga', left: 'retired after twenty-two years at Meridian' },
        memo: 'Ines Varga’s handover: own the stock, own a floor under it, don’t pretend to know the date. Consensus’s ladder looks reasonable to me, engineering by day 420 at seventy and research by 756 near sixty, and that’s the trouble with it: reasonable ladders get repriced all at once. The 90 puts cover every share through day 63, and then they’re gone. The front VXHCN future pays if the floor is ever tested in a hurry, and the stop at 85 is the belt to go with the braces. The term financing comes due on day 84. The cash is there for it, unless you spend it on the next floor. — I.V.',
        reports: [
            { category: 'desk', headline: 'Webb raises the desk’s risk allocation for the year; every book is to hold “something that pays if we’re wrong about everything.”' },
            { category: 'halcyon', headline: 'Reinholt says “soon” when a Stanford panel asks about the timeline, then “not as soon as the people who say soon.”' },
        ],
        obligation: { kind: 'maturity', label: 'the term financing', amount: 0.15, dueDay: 84 },
        book: [
            { type: 'stock', side: 'long', value: 0.80 },
            { type: 'put', side: 'long', strike: 90, expiry: 0, cover: 'stock' },
            { type: 'vxhcnfuture', side: 'long', expiry: 0, value: 0.10 },
        ],
        order: { type: 'stock', side: 'short', orderType: 'stop', trigger: 85, cover: 'stock' },
    },
    {
        id: 'illiquid',
        predecessor: { name: 'Teodor Lindqvist', left: 'was let go in the spring' },
        memo: 'Teodor Lindqvist’s handover: the race will make HCN violent, and vol isn’t priced for it. Single-name vol on Halcyon trades as if the timeline were a rumour, so I bought the far VXHCN future, more of it than trades in several sessions, and kept a little HCN for the days the violence comes from the upside. The Ashby family office takes a fifth of the book on day 50, and the cash covers half of that. VXHCN is thin. I built this over a month, and it would take as long to sell properly; don’t let operations sell it for you in an afternoon. — T.L.',
        reports: [
            { category: 'market', headline: 'Single-name vol on Halcyon is priced like the timeline is a rumour, says MarketWire’s Sharma.' },
            { category: 'halcyon', headline: 'Dirks promises the least boring two years in Halcyon’s history; investor relations spends the afternoon walking it back.' },
        ],
        obligation: { kind: 'redemption', label: 'the Ashby redemption', amount: 0.20, dueDay: 50 },
        book: [
            { type: 'vxhcnfuture', side: 'long', expiry: -1, value: 0.80 },
            { type: 'stock', side: 'long', value: 0.30 },
        ],
        order: null,
    },
    {
        id: 'wall',
        predecessor: { name: 'Nadia Kerr', left: 'is on leave, writing a book' },
        memo: 'Nadia Kerr’s handover: the wall is real, and Consensus is pricing a staircase. It pays fifty-eight cents for autonomous research by day 756 and fifty-two for recursion by 880; I sold both, because a ladder priced like that assumes nobody runs out of data, power or patience. When the capex stalls, rates follow it down, hence the bonds. The Sorensen Foundation redeems a tenth of the book on day 30, and most of the desk’s cash is posted against the shorts. If I’m early, I’m wrong. If I’m right, nobody will remember who said it first. — N.K.',
        reports: [
            { category: 'rates', headline: 'Sharma asks the question the bond desks avoid: if this is real, why are rates normal?' },
            { category: 'halcyon', headline: 'Frontier benchmark gains are “slowing in the top quartile,” a university survey finds; Dirks calls the method “a rearview mirror with footnotes.”' },
        ],
        obligation: { kind: 'redemption', label: 'the Sorensen redemption', amount: 0.10, dueDay: 30 },
        book: [
            { type: 'binary', side: 'short', rung: 3, maxLoss: 0.175 },
            { type: 'binary', side: 'short', rung: 4, maxLoss: 0.175 },
            { type: 'bond', side: 'long', expiry: -1, value: 0.60 },
        ],
        order: null,
    },
];

/** The hand a seed deals: uniform over the table, from its own stream. */
export function drawFixture(seed) {
    const rng = createRng(deriveSeed(seed >>> 0, 'opening'));
    return FIXTURES[rng.int(FIXTURES.length)];
}

// ---------------------------------------------------------------------------
// The takeover
// ---------------------------------------------------------------------------

let _dealt = null;

/** The fixture this run was dealt (null in Classic). Read by the almanac and the
 *  Meridian page (the memo, the predecessor's `left` line). */
export function dealtFixture() { return _dealt; }

/** Clear the dealt hand (every reset; Classic stays on cash). */
export function resetOpening() { _dealt = null; }

/** Draw the hand for `seed` and take it over (Dynamic boot). */
export function dealOpeningHand(seed, expiries) {
    const fixture = drawFixture(seed);
    takeover(fixture, expiries);
    _dealt = fixture;
    return fixture;
}

function _listed(expiries, pos) {
    const days = expiries.slice().sort((a, b) => a - b);
    const day = days[pos < 0 ? days.length + pos : pos];
    if (day == null) throw new Error(`opening: no listed expiry at position ${pos}`);
    return day;
}

function _binaryKey(rung) {
    const c = consensus.contracts.find(k => !k.terminal && k.predicate.rung === rung);
    if (!c) throw new Error(`opening: no listed certification contract for R${rung}`);
    return c;
}

/**
 * Take a fixture over at the current (opening) marks. The book must be empty
 * and the market synced. Seats each position at its mark, whole units and listed
 * strikes first; records the obligation; places the working order as a resting
 * order; then solves cash so that equity net of the obligation is exactly
 * INITIAL_CAPITAL, which `initialCapital` and the peak start from. Finally seats
 * the market maker's hedge at the book's, so the takeover records no volume.
 * Not a trade: no spread, impact, fill, trade count or ledger row. Reads only
 * public marks (the chassis, `B`'s binary quotes).
 *
 * @param {object} fixture   a FIXTURES row
 * @param {number[]} expiries the listed chassis expiries (sim days)
 */
export function takeover(fixture, expiries) {
    if (portfolio.positions.length || portfolio.orders.length) throw new Error('opening: takeover needs an empty book');
    const E0 = INITIAL_CAPITAL;
    const { S, sigma, r, day, q } = market;
    const held = {};
    for (const spec of fixture.book) {
        const sign = spec.side === 'short' ? -1 : 1;
        let strike, expiryDay;
        if (spec.type === 'binary') {
            const c = _binaryKey(spec.rung);
            strike = c.key;
            expiryDay = c.deadline;
        } else {
            if (spec.strike != null) strike = Math.round(spec.strike / STRIKE_INTERVAL) * STRIKE_INTERVAL;
            if (spec.expiry != null) expiryDay = _listed(expiries, spec.expiry);
        }
        const mark = unitPrice(spec.type, S, sigma, r, day, strike, expiryDay, q);
        let units;
        if (spec.cover) units = Math.abs(held[spec.cover]);
        else if (spec.maxLoss != null) units = Math.round(spec.maxLoss * E0 / (BINARY_NOTIONAL - mark));
        else units = Math.round(spec.value * E0 / mark);
        if (!(units > 0)) throw new Error(`opening: ${fixture.id} sizes ${spec.type} to nothing`);
        seatPosition(spec.type, sign * units, mark, day, strike, expiryDay);
        held[spec.type] = sign * units;
    }
    const ob = fixture.obligation;
    portfolio.obligations = [{ kind: ob.kind, label: ob.label, amount: ob.amount * E0, dueDay: ob.dueDay }];
    // INTERPRETATION: a working order sized as a fraction of E0 ("a limit sell of
    // 0.30 E0 of the HCN") is sized at the takeover mark, like the book; one that
    // names no size ("a stop sell of the HCN") covers the whole holding.
    const o = fixture.order;
    if (o) {
        const units = o.cover ? Math.abs(held[o.cover]) : Math.round(o.value * E0 / unitPrice(o.type, S, sigma, r, day));
        placePendingOrder(o.type, o.side, units, o.orderType, o.trigger);
    }
    portfolio.cash = 0;
    portfolio.cash = E0 - portfolioValue(S, sigma, r, day, q);
    portfolio.initialCapital = E0;
    portfolio.peakValue = E0;
    portfolio.maxDrawdown = 0;
    baselineMMHedge(portfolio.positions);
}
