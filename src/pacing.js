/* ===================================================
   src/pacing.js -- To the next edition worth reading
   (02a "The evening", "Pacing"): the skip's stop
   classifier. main.js runs the skip itself (the clock
   at SKIP_DAYS_PER_SEC, the dispatch that stops it at
   once, the latch fed by the development sites); what
   a close carries is summarized and judged here.

   A summary of one close:
     extra        an extra edition was marked (markExtra)
     majorWire    a major wire item was logged since the
                  last close (majorSince)
     development  a position change the player did not
                  make by hand: a resting order filling, a
                  standing order trading, the player's own
                  deferred order completing, exercise or
                  assignment, a held contract settling, a
                  forced sale, a margin liquidation
     notice       an obligation's notice
     quarterLine  a quarter's close line
     equityPrev   equity net of obligations at the
                  previous close
     equity       ... at this one
     day          the chassis day the close opens
     optionExpiries  the chassis expiry day of every held
                  option

   DOM-free, so the harness can judge synthetic closes.
   =================================================== */

import { BOOK_MOVE_STOP } from './config.js';

/** Every cause a skip records (`countPause('skip:' + cause)`), the dispatch first,
 *  then the close's stops in 02a's order. */
export const SKIP_CAUSES = ['dispatch', 'extra', 'wire', 'development', 'notice', 'quarter', 'book', 'expiry'];

/** Equity net of obligations moved by BOOK_MOVE_STOP of the previous close's
 *  equity, or more. */
export function bookMoved(equityPrev, equity) {
    return Math.abs(equity - equityPrev) >= BOOK_MOVE_STOP * Math.abs(equityPrev);
}

/**
 * The close opens a held option's last trading day: an option expiring on chassis
 * day E is processed at the close that turns E - 1 into E, so the edition E - 1 is
 * the last that can trade it.
 * INTERPRETATION: 02a's "the close of the last trading day before a held option
 * expires" is read as the close after which the edition on screen is that last
 * trading day. Its literal close is the expiry itself, which the development stop
 * already takes; the stop exists so a skip never carries the desk past its last
 * chance to act on the option.
 */
export function lastTradingDayOpens(day, optionExpiries) {
    for (const e of optionExpiries) if (e === day + 1) return true;
    return false;
}

/** A major wire item logged after `mark`, the newest entry when the skip began or
 *  last closed (null: the whole log). The predecessor's archived reports are not
 *  news. */
export function majorSince(log, mark) {
    for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e === mark) break;
        if (e.magnitude === 'major' && !e.archive) return true;
    }
    return false;
}

/** The close's stop, or null: the first of 02a's stops the summary carries. */
export function closeStop(s) {
    if (s.extra) return 'extra';
    if (s.majorWire) return 'wire';
    if (s.development) return 'development';
    if (s.notice) return 'notice';
    if (s.quarterLine) return 'quarter';
    if (s.equityPrev != null && bookMoved(s.equityPrev, s.equity)) return 'book';
    if (lastTradingDayOpens(s.day, s.optionExpiries || [])) return 'expiry';
    return null;
}
