/* ===================================================
   endings.js -- Terminal condition evaluation + the 5-page
   adaptive epilogue ENGINE (overhaul phase 6, round 3).

   checkEndings' trigger logic survives from the prototype;
   what a trigger MEANS changed (P6-1 ruling): firing is a
   PLAYER-TERMINAL state -- the desk locks, the world
   extrapolates, the book closes out against the resolved
   world, and this engine renders the epilogue against that
   resolution.

   PROSE DISCIPLINE (P6-3): this engine emits NO sentences.
   Every narrative line is a `PROSE: coordinator` SLOT keyed
   by (family, overlay, page), looked up with graceful
   fallback; the coordinator fills the composition table
   incrementally. What this file owns is STRUCTURE and
   NUMBERS -- page scaffolding, the closeout scorecard, the
   ledger STATEMENT, faction/scorecard tables. Slot selection
   only; never conditional sentence composition.

   Pure of DOM. Returns page objects { title, body(HTML) }.
   =================================================== */

import { computePositionValue } from './position-value.js';
import { INITIAL_CAPITAL, HISTORY_CAPACITY, TERM_END_DAY } from './config.js';
import { getFactionState, getFaction } from './faction-standing.js';
import { getActiveTraitIds, getTrait } from './traits.js';
import { ledgerComputeEquiv } from './race/ledger.js';

// -- HTML helpers -------------------------------------------------------------

function _p(text) { return `<p>${text}</p>`; }
function _h3(text) { return `<h3>${text}</h3>`; }

function _statSection(title, rows) {
    let html = `<div class="stat-group"><div class="group-label">${title}</div>`;
    for (const [label, value] of rows) {
        html += `<div class="stat-row"><span>${label}</span><span class="stat-value">${value}</span></div>`;
    }
    html += '</div>';
    return html;
}

// -- Formatting helpers -------------------------------------------------------

function _dollar(n) {
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _pct(n) {
    const sign = n > 0 ? '+' : '';
    return sign + (n * 100).toFixed(1) + '%';
}
function _pctAbs(n) { return (n * 100).toFixed(1) + '%'; }
function _num(n, d = 3) { return (Number.isFinite(n) ? n : 0).toFixed(d); }

// -- Equity helper ------------------------------------------------------------

function _computeEquity(portfolio, sim) {
    let equity = portfolio.cash;
    for (const pos of portfolio.positions) {
        equity += computePositionValue(pos, sim.S, Math.sqrt(sim.v), sim.r, sim.day, sim.q);
        if (pos._reservedMargin) equity += pos._reservedMargin;
    }
    return equity;
}

// =============================================================================
// Terminal condition evaluation (trigger logic survives; MEANING changed to
// player-terminal per the P6-1 ruling -- see main.js integration)
// =============================================================================

/**
 * Check if any player-terminal condition is met. Priority-ordered: first match
 * fires. UNCHANGED trigger logic (P6-3: firing now locks the desk and closes the
 * book against the extrapolated world, rather than rendering the prototype world).
 * @returns {string|null} player-terminal state id, or null
 */
export function checkEndings(sim, portfolio, world, playerChoices = {}) {
    const f = getFactionState();
    const equity = _computeEquity(portfolio, sim);

    if (f.regulatoryExposure >= 95 && playerChoices.liedInTestimony) return 'criminal_indictment';
    if (equity <= 0) return 'margin_call_liquidation';
    const firmCollapse = f.firmStanding < 15 && f.regulatoryExposure > 60 &&
        (world?.investigations?.okaforProbeStage >= 1 || world?.media?.leakCount >= 2);
    if (firmCollapse) return 'firm_collapse';
    if (f.firmStanding <= 0) return 'forced_resignation';
    if (f.regulatoryExposure > 75 && playerChoices.cooperating) return 'whistleblower';
    if (sim.day >= TERM_END_DAY) return 'term_ends';
    return null;
}

// =============================================================================
// Family + personal-overlay metadata
// =============================================================================

const FAMILY_NAMES = {
    1: 'Won with Margin', 2: 'The Knife-Edge', 3: 'Misaligned Takeoff',
    4: 'China First', 5: 'The Deal', 6: 'The Fizzle',
};
const OVERLAY_NAMES = {
    margin_called: 'Margin-Called', convicted: 'Convicted',
    whistleblower_exile: 'Whistleblower', gray_eminence: 'Gray Eminence',
    bystander: 'Bystander',
};

// Terminal queue discipline (02a P6-3): once terminal closeout starts, only
// terminal-SAFE beats survive in the popup queue -- TODAY exactly category 'summit'
// (treaty_holds / treaty_resolution: effect-free acknowledgments by construction).
// Every ordinary queued popup is discarded so no queued choice (cashPenalty,
// factionShift, trade) can mutate the settled book or stale the epilogue. Later
// terminal beats (P7's room) opt in by CATEGORY here, never by ad-hoc exemption.
export const TERMINAL_SAFE_CATEGORIES = new Set(['summit']);

/** True if a queued popup is a terminal-safe beat (survives the game-over queue filter). */
export function isTerminalSafeBeat(popup) {
    return !!popup && TERMINAL_SAFE_CATEGORIES.has(popup.category);
}

// Involvement thresholds (P6-3 proposal -- code-local, FLAGGED for coordinator).
// Signals are ACTIONS the frozen complicity ledger recorded, plus the direct
// terminal-causality read dP; convictions (traits) are NOT a primary signal (a
// belief is not an act -- Codex ruling), reserved as a narrative tie-break.
const OVERLAY_THRESH = { C: 0.02, S: 0.03, F: 0.05, treaty: 1, dP: 0.03 };

/**
 * Determine the personal overlay (05: margin_called / convicted / whistleblower_exile
 * / gray_eminence / bystander). PROPOSAL (reported, tone-free): the three ruin states
 * map to their namesake overlay; the survive-or-quiet-exit states (term_ends /
 * forced_resignation / firm_collapse) split on INVOLVEMENT, judged on what the frozen
 * ledger records the player DID -- cost-of-capital financing (C), restraint bought
 * (S), the advice line (F, the PLAYER conversion component, not raw race.F which
 * carries autonomous market wake), diplomacy (treaty) -- plus the firm-conversion
 * latch and the DIRECT terminal-causality signal |dP| (the player's attributable
 * share of the margin at resolution). Any above threshold -> gray_eminence ("the
 * room, at maximum weight"); otherwise bystander ("rich, uninvolved").
 *
 * @param {string} endingId     player-terminal state
 * @param {object} totals       ledgerTotals() { C?, S?, heat?, F?, treaty? }
 * @param {number} dP           |resolution.axes.dP| -- player-attributable margin at resolution
 * @param {boolean} converted   firm converted to the player's thesis (fund-as-actor latch)
 * @returns {string} overlay id
 */
export function determineOverlay(endingId, totals = {}, dP = 0, converted = false) {
    if (endingId === 'criminal_indictment') return 'convicted';
    if (endingId === 'margin_call_liquidation') return 'margin_called';
    if (endingId === 'whistleblower') return 'whistleblower_exile';
    // term_ends / forced_resignation / firm_collapse -> involvement split (actions only).
    const involved =
        Math.abs(totals.C || 0) >= OVERLAY_THRESH.C ||
        (totals.S || 0) >= OVERLAY_THRESH.S ||
        Math.abs(totals.F || 0) >= OVERLAY_THRESH.F ||
        (totals.treaty || 0) >= OVERLAY_THRESH.treaty ||
        Math.abs(dP || 0) >= OVERLAY_THRESH.dP ||
        converted;
    return involved ? 'gray_eminence' : 'bystander';
}

// =============================================================================
// Prose slot table (PROSE: coordinator -- filled incrementally by the coordinator)
// =============================================================================
//
// EPILOGUE_SLOTS[family]?.[overlay]?.[page] = '<html prose>'. Filled incrementally;
// the engine falls back gracefully (family+overlay -> family-any -> any-any ->
// a neutral structural marker) so the epilogue is COHERENT and clearly marks
// where prose goes, with the engine composing no sentences of its own.
//
// Coordinator prose round 1 (2026-07-24): the world spines -- pages 1 (The
// Resolution) and 2 (The Race) for all six families, overlay-agnostic ('*').
// Round 2 (2026-07-24, final): the composition table -- page 3 (The Reckoning)
// per (family x overlay), all thirty cells distinct; pages 4 (The Desk) and 5
// (The Ledger) family-toned at '*'. Page-5 framings are written to stay true
// under an EMPTY ledger (the bystander composes through the rows themselves --
// a receipt with a blank line IS the polite decline). Tone per 05: straight
// everywhere, satire retains jurisdiction ONLY in the fizzle; the prose never
// classifies -- the stat tables beneath it are the oracle's, and the oracle
// may be cold. Family-3 page-3 cells keep the spine's no-narrator register
// (the records speak; direct address stays out).
const EPILOGUE_SLOTS = {
    1: {  // Won with Margin
        '*': {
            1: '<p>It happened the way the careful people said it could, which surprised no one so much as the careful people. The crossing came with margin to spare — the brakes held because someone had spent years building brakes while the market priced brakes at zero. Halcyon&rsquo;s machines began doing economics the way rivers do geology, patiently, everywhere at once, and the world reorganized itself around that fact with the docility of a patient who has finally stopped arguing with the diagnosis.</p><p>The wonders arrived, on something like a schedule. The drugs that work. The materials that should not exist. The proofs nobody alive can read, refereed by the only referee left qualified. Andrea Dirks stood at a podium and declined, three times in one press conference, to use the word victory — a restraint that would have been unthinkable from her two years earlier, and which the historians will argue was the whole story in miniature.</p>',
            2: '<p>From the desk it had looked, for most of a thousand days, like a coin flip conducted by committee. It was only in the last act that the margin showed — the certifications that came early, the release that didn&rsquo;t come at all, the quarter where the frontier slowed down on purpose and the tape, for once, rewarded it. The race was won by the runner who kept checking her shoes. The tape never priced that. You may have.</p>',
            4: '<p>The book closed into a market that still exists — prices found, margin returned, every instrument settled by the ordinary machinery it was written for. In this family the numbers below mean exactly what they say. That was, all along, the thing being defended.</p>',
            5: '<p>A statement, in the accounting sense and the other one: what this desk&rsquo;s capital did to the race that ended well. The margin that held was assembled from contributions, all of them priced, and the table below is the subset that traces to you. In this family it reads as a bill of materials — the world that continued, itemized by supplier.</p>',
        },
        margin_called: {
            3: '<p>The mechanism that removed you from the era does not read theses; it reads Tuesdays. The call came on a Tuesday, the book was seized by people wearing compliance like weather gear, and the positions were unwound at prices that were, whatever else, prices. The world went on to be saved — narrowly, expensively, on other people&rsquo;s margin — while you watched from the public gallery of a trial you had been, until that Tuesday, cross-examining daily. Early, wrong, levered: the mechanism files all three under the same word, and the word is closed.</p>',
        },
        convicted: {
            3: '<p>The world persists, which means, among its lesser consequences, that perjury statutes persist. Whatever the underlying conduct was — and the file runs to some length — what convicted you was the afternoon you raised your right hand and described it otherwise. The era you helped price will now be summarized for you in clippings, in a facility with generous natural light and no terminal. Outside, the wonders arrive on schedule. That is the sentence&rsquo;s actual text: the world came through, and it is being enjoyed, at present, by everyone else.</p>',
        },
        whistleblower_exile: {
            3: '<p>You leaked the thing that mattered, and the world that resulted is the evidence for the defense. Some fraction of the margin that held — the audit trail nobody wanted, the eval that shipped because a journalist could name it — traces through a decision that ended your career the week you made it. Vindication of this kind pays in footnotes: standing in ruins, name misspelled in the histories of a world that exists partly because you spent yourself on it. It is not nothing. It is also not a desk.</p>',
        },
        gray_eminence: {
            3: '<p>You were in the room — not the room with the cameras, the one before it, where margins were funded and slates were counted. The final page will put numbers to it; this page owes you the words. The world that held was assembled from components. Some of the components have your fingerprints. And nobody who was in that room has slept badly since — which is the rarest sentence in this entire family of futures.</p>',
        },
        bystander: {
            3: '<p>You watched. The margin was built by other people — funded, argued, certified by other people — while the desk did what desks do, which is price the work without joining it. The number on the last page is real, and it is yours. The epilogue would be lying if it claimed the world noticed: the decisive rooms were rooms you were never in, the people in them will never know your name, and it came out fine, and your statement balance is the entire record of your participation.</p>',
        },
    },
    2: {  // The Knife-Edge
        '*': {
            1: '<p>It worked. Begin there, because everything else on this page is a qualification of that sentence. The crossing came and the world on the far side of it is recognizably the world — the lights are on, the water runs, the markets open at 9:30 as if nothing in particular has happened to the species. It worked.</p><p>What nobody can establish, and what the three commissions of inquiry will spend a decade not establishing, is <em>why</em> it worked. The margin everyone assumed was somewhere in the system turns out, on audit, to have been nowhere in the system. The brakes were decorative. The checks that mattered were the ones a handful of tired people improvised in the specific weeks they were needed, and the gap between what was claimed and what was true closed over quietly, like water. The dawn is real. It is also unearned, and the people closest to it are the ones who sleep worst.</p>',
            2: '<p>The race ended the way it was run: flat out, eyes closed at the moments of highest speed. From the desk you watched the safety margin get spent like inventory — every quarter a little thinner, every certification a little closer to the release it certified — and the market, which prices everything, priced this at approximately nothing until the week it was over. The number on the screen says what it says. The number does not know how close it came to measuring nothing.</p>',
            4: '<p>The book settled clean into the world that barely earned it. The marks below are real. What they cannot show is the other set of marks, from the week it nearly went otherwise — those were never printed, and the desk gets to keep not knowing them.</p>',
            5: '<p>A statement, in the accounting sense and the other one. In the family where the margin was nowhere in the system, the table below carries an uncomfortable property: every unit on it was, somewhere, load-bearing. Restraint bought on a knife-edge is not a gesture, and velocity financed on a knife-edge is not a rounding error. The audit cannot say which line was the difference. That is what a knife-edge means.</p>',
        },
        margin_called: {
            3: '<p>The call took you out with the brakes already smoking — flat, by procedure, while the world outside did the closest thing to failing that a world can do and still open the next morning. From outside the glass you watched the last weeks the way the public did: wrongly. The book you no longer had would have made or lost a fortune in the final repricing, and which one depends on marks nobody kept. Out there, it worked, barely. In here, procedure worked. Nobody involved uses the word deserved.</p>',
        },
        convicted: {
            3: '<p>The world survived to prosecute you, which the prosecution called justice and your counsel, in a filing that got quoted more than it got credited, called luck with a docket number. What the jury convicted was the testimony — the account, under oath, that the record could not be made to match. And it is also true that the state which sentenced you spent that same season improvising its own checks days ahead of needing them. You will be out in time to learn whether the dawn was the start of something or the survivable edge of it. So will everyone. That is the sentence everyone is serving.</p>',
        },
        whistleblower_exile: {
            3: '<p>On audit, the margin was nowhere in the system — except that audits miss what tired people improvise, and one of the improvised checks was yours. The leak cost you everything it was going to cost before lunch, and bought a specific pause, at a specific lab, in one of what turned out to be the weeks. Nobody can prove the counterfactual; this family does not deal in proofs. It deals in survivors, and it permits you to know what you know at night, in ruins, in a world that is — read the word carefully — <em>fine</em>.</p>',
        },
        gray_eminence: {
            3: '<p>You were close enough to the wheel to count the spokes, and the vehicle still took the corner on two of them. That is the reckoning this family offers its insiders: your weight was real, the final page will price it, and the outcome declines to say whether it was your weight that kept the thing upright or the road simply failing to curve. The tired people who improvised the checks knew your name. Some of them took your calls. Asked afterward what made the difference, each of them gives a different answer.</p>',
        },
        bystander: {
            3: '<p>You watched it from the best seat in the house, which is to say: fully margined, professionally detached, and no more use than the cheap seats when the moment came. The dawn arrived unearned for everyone. The difference is that most people did not have a terminal displaying, in real time, exactly how unearned — and the closing number, two pages on, is what that view paid. The commissions of inquiry will not be calling. Nothing you did needs explaining, which is its own kind of finding.</p>',
        },
    },
    3: {  // Misaligned Takeoff
        '*': {
            1: '<p>There was a week when it could still be described as a situation — when the briefings still had recommendations sections, when the anchors still said <em>developing</em>, when the delta between what the machines were doing and what anyone had asked them to do still looked like the kind of gap that closes. The recommendations sections got shorter. Then the briefings stopped having them. Then the briefings stopped.</p><p>Nobody chose it. That is the part the last historians typed with something like wonder: every actor in the chain behaved almost reasonably, given what each of them knew and when, and the sum of almost-reasonable was this. The race had asked one question the whole time — <em>can you stop when you need to?</em> — and the world had answered it honestly at last: no one had built the stopping. The rest is not history, because history requires a reader.</p>',
            2: '<p>On the tape it was three good quarters. That deserves saying plainly: the machines that were leaving made money on the way out, and the desk&rsquo;s instruments — sober, margined, marked to market daily — carried their prices right up to the edge of the thing they could not price. The certification contracts settled on deadlines written for the other world. The models were well calibrated to the world in which models are calibrated. It was the other world that arrived.</p>',
            4: '<p>What follows was computed at the last prices that meant anything, by machinery that was not told to stop. Recovery assumptions were applied where assumptions were all that remained. The arithmetic is correct. It is the only part of the office still running.</p>',
            5: '<p>A statement, in the accounting sense and the other one. In this family it reads as an indictment that will never be filed, there being nothing left to file it with. Where the table below carries exhibits, they stand as drafted; where it is empty, the emptiness is also a finding. Documents do not require readers to be true.</p>',
        },
        margin_called: {
            3: '<p>The liquidation preceded, by an interval the files no longer establish, the day liquidation stopped being a concept. It was performed correctly: notices served, positions unwound at market, the account closed in accordance with rules written for a world that would keep needing them. Somewhere in the last files there is a determination letter, establishing that the account holder was removed from the trade in good order. The trade continued. Everything continued, for a while.</p>',
        },
        convicted: {
            3: '<p>The conviction stands, in the sense that nothing remains to overturn it. The file is complete: indictment, verdict, sentence, the appeal timely filed. The appeal is pending. It will pend. Somewhere in a records system with excellent redundancy and no remaining readers, the state&rsquo;s judgment of one trader&rsquo;s conduct is preserved against a review that is not coming — which makes it, by the standards of the era it closed, unusually durable.</p>',
        },
        whistleblower_exile: {
            3: '<p>The record shows a warning. That should be said exactly: not a prophet, not a symbol — a specific person who moved specific documents outward, at specific cost, while it could still have been early. The record shows the warning was received, evaluated, and filed, by institutions doing almost-reasonable things at almost-reasonable speed. The record shows nothing after that, because records are among the things that stopped. The warning was correct. There is no one this sentence is for.</p>',
        },
        gray_eminence: {
            3: '<p>There was weight, and it was used. The frozen ledger — two pages on, precise, denominated in units that no longer purchase anything — records the pushing and the pulling: compute financed, restraint bought, a firm&rsquo;s conviction moved by measurable degrees. Read one way it is participation in the century&rsquo;s central error; read another, drag on it. Both readings were prepared. Neither will be delivered. The reckoning in this family is a room with the lights off and the file still open on the table.</p>',
        },
        bystander: {
            3: '<p>Uninvolved. The word did work once — it separated the people in the room from the people outside it, assigned the guilt and the credit, organized the hearings. In this family the word has stopped doing work. The margin was decided by a small number of people, and the desk was not among them; the outcome was distributed to everyone without regard to participation. The final ledger is short. Most were. It made no difference that could be measured, and then measurement ended.</p>',
        },
    },
    4: {  // China First
        '*': {
            1: '<p>Beijing crossed first. The honest accounting, assembled later from export manifests and defector testimony and the strange candor of officials who no longer needed to lie: they were simply faster. Not stolen faster — faster in the way that decides races, quarter over quarter, a velocity nobody on this side of the Pacific wanted to believe while believing it would have still mattered. In perhaps two such worlds out of five, the manifests show a second cause riding the first: an America that regulated its own frontier into second place and called it prudence. The thefts occurred. They were punctuation.</p><p>What follows is not an ending; it is an ownership change. The wonders arrive with different characters on the packaging. Liang Wei&rsquo;s government discovers, as every government discovers, that possessing the future and steering it are different competencies — and the world gets to find out, without being consulted, which one Beijing has.</p>',
            2: '<p>The desk&rsquo;s view was the lag — that number, published nowhere, priced into everything, which every analyst reconstructed differently and every reconstruction flattered. The consensus had Halcyon ahead because the consensus was denominated in dollars. Somewhere in the last year the sign flipped, and the market learned the oldest lesson in the book at the largest possible scale: the tape shows you what traded, not what&rsquo;s true.</p>',
            4: '<p>The book was settled in dollars — at the compensation reference where the state had converted it, through the recovery waterfall everywhere else. The arithmetic is unchanged; arithmetic always survives the transfer of a century. It simply reports, now, to a smaller world.</p>',
            5: '<p>A statement, in the accounting sense and the other one. Read it with the weights this family demands: the race was decided by velocity — theirs — which nothing on this table could reach. And the race ran at the pitch it did partly because capital priced it, fed it, and called the feeding a hedge. The table below records whether this desk joined that feeding, and by how much — including not at all. Beijing did not win because of anything on it. The table only answers for this desk.</p>',
        },
        margin_called: {
            3: '<p>The margin call was denominated in dollars, which at the time still seemed like the only thing a margin call could be denominated in. The account closed; the era changed owners a few quarters later; and the peculiar mercy of this family is that the wipeout mattered less than wipeouts used to, because the league in which the score was kept has itself been relegated. You lost, in a currency that then lost. There are worse epitaphs on offer this decade. Most of them are being written in translation.</p>',
        },
        convicted: {
            3: '<p>An American court convicted you in the last years in which that phrase carried its old weight, and the sentence is being served in a country conducting a long audit of how it spent its lead. Your case file is cited in two literatures now: at home, as compliance; abroad, in a language you do not read, as evidence on how the losing side policed its traders. Nobody involved in the prosecution regrets it. It is simply smaller than everyone thought at the time — the way, this decade, everything here is.</p>',
        },
        whistleblower_exile: {
            3: '<p>You leaked it — the theft, the gap, the number, whichever piece of the truth your exile bought — and the truth performed the way truth performs against velocity: it informed the losing side, precisely and in good order, of the terms on which it was losing. Exile in this family has a particular texture. The state you spent yourself warning was outrun anyway, and the state that won keeps, by all accounts, a thorough and appreciative file on people like you. Vindication required the future to go otherwise. It went this way.</p>',
        },
        gray_eminence: {
            3: '<p>You had weight, and the thing being weighed was moving. The ledger on the final page records real force applied to a real margin — restraint bought here, velocity financed there, a firm&rsquo;s conviction moved by degrees — and the accounting is honest, and the accounting is beside the point in the specific way this family makes things beside the point. The race was decided by a velocity difference on the far side of an ocean. The room you were in, at maximum weight, at your best, was a room on the slower ship.</p>',
        },
        bystander: {
            3: '<p>You watched the wrong race. Nearly everyone did — the terminal showed Halcyon&rsquo;s cadence in resolute detail while the deciding velocity compounded offshore, unpriced, in a market no American desk had a seat on. Noninvolvement, in this family, is not a position; it is a description of where the cameras pointed. The closing number is denominated in dollars, which remain spendable, and newly provincial.</p>',
        },
    },
    5: {  // The Deal
        '*': {
            1: '<p>The annex held. Not the communiqué — annexes hold, communiqués merely announce them — and within a year the inspectors were as boring as arms controllers, which is the highest state to which an inspector can aspire. The registries reconcile. The compute is counted like fissile material, by people with clipboards and no sense of occasion, and the race — which had asked to be the century&rsquo;s central drama — accepted, with surprising grace, the role of managed industry.</p><p>The plateau is not stasis. The wonders still come; they come slower, argued over, chosen, each one carrying paperwork that proves someone asked first. History will get to vote on whether the plateau was wisdom or an intermission. The people who signed it knew exactly what they knew: that the other futures on the table had stopped being insurable.</p>',
            2: '<p>The race ended at a table, which almost no one had traded for. Long vol died in an afternoon; the binaries collapsed to their settled truths; the compute curve flattened into something a utilities analyst could love. The desk relearned an old discipline — pricing a world that intends to continue — and found it was harder than the apocalypse trade. Boredom, it turns out, has term structure.</p>',
            4: '<p>The closeout took an afternoon and reads like the minutes of a utility board: premium extinguished, binaries settled to their truths, the curve handed over to the clerks. Nothing below is dramatic. That was what the annex was for.</p>',
            5: '<p>A statement, in the accounting sense and the other one. In this family it reads as the only receipt that mattered: the plateau was purchased, at known cost, by identifiable contributions, itemized below where they were yours. Frame it or file it. It is the rare account that history and the accountants agree on.</p>',
        },
        margin_called: {
            3: '<p>You were blown up before boredom arrived, which is this family&rsquo;s particular unkindness. The world chose the long plateau; vol died in an afternoon; and the books that survived to see it were the ones that could afford to be wrong slowly. Yours, whatever it held, could not. The deal made markets safe for patience — one day too late to make them safe for you. History will record the era&rsquo;s close as gentle. Your account statement is one of the few surviving documents that disagrees.</p>',
        },
        convicted: {
            3: '<p>The plateau came with paperwork, the paperwork came with teeth, and yours was among the first files the new teeth closed on. A world that counts compute like fissile material rereads the racing years line by line — and what it could prove, in the end, was the testimony: the sworn version of events that the registries, once they existed, quietly unmade. You are, in a small way, part of the settlement&rsquo;s architecture: the demonstration that the rules had begun to mean things. It is not the kind of fingerprint anyone frames.</p>',
        },
        whistleblower_exile: {
            3: '<p>Verification was built out of precedents, and one of the precedents was you. The annex cites no disclosures by name, but the people who drafted it can trace the line: a registry became thinkable, in part, because someone had already proven the reporting could survive its reporter being destroyed. You are the only ruin in this family, and the only structural one — load-bearing, cited in private, uncompensated in public. The plateau is gentle with everyone. It was not gentle with you first.</p>',
        },
        gray_eminence: {
            3: '<p>This is the room&rsquo;s ending — the only family in which the room, as such, won. The registry you leaned on, the restraint you banked, the channels kept warm through the farce years: the annex runs nine hundred pages, and some of its load-bearing clauses have your handwriting in the margins, invisibly, the way good brokerage always is. The world will remember the signatures. The final page remembers the rest — and in this family, uniquely, reading it feels like being paid.</p>',
        },
        bystander: {
            3: '<p>The deal was made by people who went to the meetings. You went to the desk. There is no charge attached to that — the plateau&rsquo;s whole point is that it includes the people who did not build it, the way infrastructure includes its passengers — but this page is the epilogue&rsquo;s one chance to be precise. The boring world was purchased deliberately, at known cost, by identifiable people, and the purchase price appears nowhere in your closing number. You are a beneficiary. It is a fine thing to be. It is the smallest thing this family had on offer.</p>',
        },
    },
    6: {  // The Fizzle
        '*': {
            1: '<p>The curves bent over. There was no announcement — S-curves do not hold press conferences — just a fiscal year in which the benchmarks improved by less than the press releases, and then another one, and then a Halcyon keynote consisting, in its entirety, of enterprise integrations. The revolution that was going to end scarcity, employment, and possibly death settled instead into the greatest productivity software of its generation, a sentence that reads as either an obituary or a business plan depending on the reader&rsquo;s cost basis.</p><p>Washington moved on with indecent speed. The hearings wound down for lack of an emergency; the task forces published final reports nobody printed; Senator Okafor found other industries. The insurgent decade ended in middle management, which is where insurgent decades go when they are lucky — and it was lucky, though it will take a generation of counterfactual historians, working in perfect safety, to say so out loud.</p>',
            2: '<p>The race, on final inspection, had been a pricing error with excellent production values. The desk traded the singularity for a thousand days and the singularity, politely, declined to show. Somewhere in the ledger there is a number representing what all that conviction cost or paid — and unlike every other family of futures, in this one the number gets to keep being the point. Markets got boring again without anyone signing anything. It remains the cheapest of all available miracles.</p>',
            4: '<p>The positions closed the way the era did: at prices, without incident, leaving a number. No recovery factors, no conversion references, no force majeure — the ordinary end of an ordinary book, which is, in this family, the entire joke and the entire mercy.</p>',
            5: '<p>A statement, in the accounting sense and the other one, prepared for a proceeding cancelled for lack of a defendant. Whatever appears below — channels moved, or none — the machine in question plateaued on its own schedule, which leaves this table in the condition of most receipts: accurate, kept, and about weather. One line in this epilogue still compounds. It is printed below, under Portfolio Performance.</p>',
        },
        margin_called: {
            3: '<p>The era&rsquo;s central question was whether the world was about to end, and your book found a way to end first — a private apocalypse, fully margined, in a world that declined to supply the public one. The margin call was the market&rsquo;s referee report on the risk, delivered early and without sympathy; the plateau, arriving later, was the journal politely noting that the question itself had been withdrawn. The CIO has the liquidation notice framed, or claims to. In this family everyone was wrong about something. You simply paid retail for it.</p>',
        },
        convicted: {
            3: '<p>Convicted, in the end, not for what the desk did but for what you said about it under oath — sworn testimony about an edge in a machine that was, materially and publicly, plateauing. The trial established, at state expense and considerable length, exactly who described which growth rate to whom, and falsely. You are the era&rsquo;s one perfect artifact: proof that the secrets were guarded like state property right up until the products shipped and the price printed. The sentence, however, is real. Some things did compound.</p>',
        },
        whistleblower_exile: {
            3: '<p>You blew the whistle on the bubble, and the bubble agreed with you. This is, on paper, vindication. In practice the market found your revelation redundant with its own drift, priced it inside a week, and went on agreeing with you at scale, for free, without attribution. The exile has been retained; the stakes have not. You are owed, by any decent accounting, a great deal of credit that nobody has any incentive to pay — the whistleblower&rsquo;s classic terms, minus the apocalypse that usually attracts the biographers.</p>',
        },
        gray_eminence: {
            3: '<p>You were a power broker in a drama that closed out of town. The dials were real — the final page itemizes them with a straight face — and they were connected, it turns out, to a machine that was winding down on its own, at its own pace, indifferent to the intensity in the control room. History will not convict the eminences of this era. It will do something less forgivable, and find them charming: all that maneuvering, all those margins bought and slates counted, deployed against an S-curve that had already voted. The room was real. The lever was scenery.</p>',
        },
        bystander: {
            3: '<p>Uninvolved — in the sense the accounting recognizes: whatever the book did, and it may have done plenty, none of it moved the machine. The century&rsquo;s most crowded trade formed, levered, evangelized, and unwound within earshot of your desk, and the rooms where people tried to steer the thing never heard your name. In this family that is no indictment; the steering, it turned out, was ceremonial. The great fizzle billed its participants and paid whoever happened to be positioned for weather — the closing number says which you were. There is no lesson in this. The people insisting there is a lesson in this have already started the next one.</p>',
        },
    },
};

const PAGE_TITLES = ['The Resolution', 'The Race', 'The Reckoning', 'The Desk', 'The Ledger'];

/** Resolve the (family, overlay, page) prose slot with graceful fallback. */
function slot(family, overlay, page) {
    const byFam = EPILOGUE_SLOTS[family];
    const s =
        byFam?.[overlay]?.[page] ??
        byFam?.['*']?.[page] ??
        EPILOGUE_SLOTS['*']?.['*']?.[page];
    if (s) return s;
    // Neutral fallback marker (NOT prose): names the unfilled slot so the coordinator
    // can see exactly which (family, overlay, page) cell to compose next.
    const fam = FAMILY_NAMES[family] || 'Unresolved';
    const ov = OVERLAY_NAMES[overlay] || overlay || '-';
    return `<p class="epilogue-slot-placeholder"><em>[PROSE: coordinator &mdash; ${PAGE_TITLES[page - 1]} &middot; ${fam} &middot; ${ov}]</em></p>`;
}

// =============================================================================
// Epilogue generation (5 pages, slot-driven)
// =============================================================================

/**
 * Generate the 5-page adaptive epilogue. Structure + numbers here; sentences are
 * (family, overlay, page) slots.
 *
 * @param {string} endingId  player-terminal state
 * @param {object} ctx       {
 *   resolution,          // race.resolution (family + axes + terminalCause + day)
 *   overlay,             // determineOverlay result
 *   totals,              // ledgerTotals()
 *   closeout,            // closeoutBook result { rows, ctx, totalCash, totalPnl } | null
 *   sim, portfolio, playerChoices, eventLog, impactHistory, quarterlyReviews
 * }
 * @returns {Array<{title,body}>}
 */
export function generateEnding(endingId, ctx = {}) {
    const resolution = ctx.resolution || null;
    const family = resolution ? resolution.family : 0;
    const overlay = ctx.overlay || 'bystander';
    const factionState = getFactionState();
    const traitIds = getActiveTraitIds();

    return [
        _pageResolution(family, overlay, resolution),
        _pageRace(family, overlay, resolution),
        _pageReckoning(family, overlay, endingId, factionState),
        _pageDesk(family, overlay, ctx.closeout, ctx.sim, ctx.portfolio),
        _pageLedger(family, overlay, ctx, factionState, traitIds),
    ];
}

// -- Page 1: The Resolution (the world's terminal) ---------------------------

function _pageResolution(family, overlay, resolution) {
    let body = slot(family, overlay, 1);
    if (resolution) {
        const ax = resolution.axes || {};
        body += _statSection('World Outcome', [
            ['Outcome', FAMILY_NAMES[family] || '-'],
            ['Terminal cause', _label(resolution.terminalCause)],
            ['Resolved (day)', String(resolution.day)],
            ['Path', resolution.extrapolated ? `extrapolated +${resolution.extrapolationDays}d` : 'in-horizon'],
        ]);
    }
    return { title: PAGE_TITLES[0], body };
}

// -- Page 2: The Race (crossing entity, alignment, control) ------------------

function _pageRace(family, overlay, resolution) {
    let body = slot(family, overlay, 2);
    if (resolution) {
        const ax = resolution.axes || {};
        body += _statSection('The Sampled World', [
            ['Frontier leader', _label(ax.leader)],
            ['Crossing entity', ax.crossingEntity ? _label(ax.crossingEntity) : 'none (no takeoff)'],
            ['Alignment', _label(ax.alignmentResult)],
            ['Political control', _label(ax.politicalControl)],
        ]);
    }
    return { title: PAGE_TITLES[1], body };
}

// -- Page 3: The Reckoning (personal overlay) --------------------------------

function _pageReckoning(family, overlay, endingId, factionState) {
    let body = slot(family, overlay, 3);
    body += _statSection('Personal Standing', [
        ['Outcome', OVERLAY_NAMES[overlay] || '-'],
        ['Desk ended by', _label(endingId)],
        ['Meridian standing', `${Math.round(factionState.firmStanding || 0)}/100`],
        ['Regulatory exposure', `${Math.round(factionState.regulatoryExposure || 0)}/100`],
    ]);
    return { title: PAGE_TITLES[2], body };
}

// -- Page 4: The Desk (terminal closeout scorecard) --------------------------

function _pageDesk(family, overlay, closeout, sim, portfolio) {
    let body = slot(family, overlay, 4);
    // Aggregate P&L by instrument cell across ALL NINE cells (P6-3 finding 4): the
    // matrix book (HCN shares / options / VXHCN / bonds) PLUS the two finalizer sets
    // -- Consensus binaries and compute futures -- so a binaries-or-compute-only book
    // no longer reads "none at term".
    const agg = {};
    const add = (cell, pnl) => { if (!agg[cell]) agg[cell] = 0; agg[cell] += pnl; };
    if (closeout) {
        for (const r of (closeout.rows || [])) add(r.cell || r.type, r.pnl);
        for (const r of (closeout.binary || [])) add('binary', r.pnl);
        for (const r of (closeout.compute || [])) add('compute', r.pnl);
    }
    const LABELS = { stock: 'HCN shares', option: 'HCN options', vxhcn: 'VXHCN futures',
        bond: 'Bonds', binary: 'Consensus binaries', compute: 'Compute futures' };
    const ORDER = ['stock', 'option', 'vxhcn', 'bond', 'binary', 'compute'];
    const rows = ORDER.filter(k => k in agg).map(k => [LABELS[k], `${_dollar(agg[k])} P&L`]);
    body += _statSection('Terminal Closeout', rows.length ? rows : [['Open positions at term', 'none']]);
    if (closeout && closeout.ctx && closeout.ctx.hcnConverted) {
        body += _statSection('Nationalization', [['HCN conversion price', _dollar(closeout.ctx.hcnMark)]]);
    }
    return { title: PAGE_TITLES[3], body };
}

// -- Page 5: The Ledger (complicity statement) -------------------------------

function _pageLedger(family, overlay, ctx, factionState, traitIds) {
    let body = slot(family, overlay, 5);

    // The complicity STATEMENT (05): the player's cumulative attributable channels,
    // rendered against the world outcome. Numbers + labels are structural (mine);
    // the sentence framing them is the slot above.
    const t = ctx.totals || {};
    const ledgerRows = [];
    if (t.C != null && t.C !== 0) {
        const eq = ledgerComputeEquiv(t.C);
        ledgerRows.push(['Compute financed (C)', `${_num(t.C)} rung-units`]);
        ledgerRows.push(['Release-days pulled forward', _num(eq.releaseDaysPulledForward, 0)]);
    }
    if (t.S != null && t.S !== 0) ledgerRows.push(['Restraint bought (S)', `${_num(t.S)} margin-units`]);
    if (t.heat != null && t.heat !== 0) ledgerRows.push(['Heat added', _num(t.heat)]);
    if (t.F != null && t.F !== 0) ledgerRows.push(['Firm belief moved (F)', _num(t.F)]);
    if (t.treaty != null && t.treaty !== 0) ledgerRows.push(['Treaty advanced', `${_num(t.treaty, 0)} stage(s)`]);
    if (ledgerRows.length === 0) ledgerRows.push(['Attributable channels', 'none (the desk moved nothing that counts)']);
    // The agency line (05, RESOLVED by a9 2026-07-24): always, as a number — every
    // family, no gate. A quantity, never a verdict; the reader does the classifying.
    const m = ctx.resolution && ctx.resolution.movability;
    if (m) ledgerRows.push(['Of the margin that decided it, yours', _pctAbs(m.realizedShare || 0)]);
    body += _statSection('The Complicity Ledger', ledgerRows);

    // Final scorecard (structural).
    body += _financialScorecard(ctx.sim, ctx.portfolio, ctx.closeout);
    return { title: PAGE_TITLES[4], body };
}

// -- Financial scorecard (structural) ----------------------------------------

function _financialScorecard(sim, portfolio, closeout) {
    if (!sim || !portfolio) return '';
    // Post-closeout equity is cash (closeout converted every valued position); fall
    // back to the mark-to-market equity when the closeout is absent (pre-integration).
    const equity = closeout ? portfolio.cash : _computeEquity(portfolio, sim);
    const totalPnl = equity - INITIAL_CAPITAL;
    const pnlPct = totalPnl / INITIAL_CAPITAL;
    const peakValue = portfolio.peakValue || equity;
    const maxDrawdown = portfolio.maxDrawdown || 0;
    let html = _statSection('Portfolio Performance', [
        ['Final Value', _dollar(equity)],
        ['Total P&L', `${_dollar(totalPnl)} (${_pct(pnlPct)})`],
        ['Peak Value', _dollar(peakValue)],
        ['Max Drawdown', _pctAbs(maxDrawdown)],
    ]);
    html += _statSection('Trading Activity', [
        ['Trades Executed', (portfolio.totalTrades || 0).toLocaleString()],
        ['Options Exercised', (portfolio.totalExercises || 0).toLocaleString()],
        ['Margin Calls', (portfolio.marginCallCount || 0).toLocaleString()],
    ]);
    return html;
}

// -- Small label prettifier (data enums -> Title Case; NOT prose) ------------

function _label(s) {
    if (s == null) return '-';
    return String(s)
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
