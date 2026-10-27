/* ===================================================
   src/counters.js -- The interruption counters (02a "The
   evening", "Interruption counters"): development-only
   tallies a9 reads from the console in play-tests
   (`shoalsCounts()`, installed by main.js) and nothing
   ever shows.

   - dispatches by category, split into shown, queued and
     intercepted by a standing order;
   - choices repeated from earlier in the run (same event,
     same choice);
   - pauses by cause (a notice, a skip stop);
   - actionable developments by kind (fills, settlements,
     notices, forced sales), and how many fall between
     consecutive shown dispatches.

   DOM-free; a module-level singleton reset once per run.
   =================================================== */

const _c = {
    dispatches: {},      // category -> { shown, queued, intercepted }
    repeats: 0,          // player choices repeated from earlier in the run
    pauses: {},          // cause -> count
    developments: {},    // kind -> count
    gaps: [],            // developments between consecutive shown dispatches
    since: 0,            // developments since the last shown dispatch
    shownAny: false,
    choices: new Set(),  // `${event}|${choice}` answered so far
};

/** A fresh run: every tally to zero. */
export function resetCounts() {
    _c.dispatches = {};
    _c.repeats = 0;
    _c.pauses = {};
    _c.developments = {};
    _c.gaps = [];
    _c.since = 0;
    _c.shownAny = false;
    _c.choices = new Set();
}

/** A dispatch, by category: 'queued' when it joins the popup queue,
 *  'intercepted' when a standing order answers it at insertion, 'shown' when
 *  it reaches the screen. A shown dispatch closes the current gap. */
export function countDispatch(category, how) {
    const k = category || 'other';
    const row = _c.dispatches[k] || (_c.dispatches[k] = { shown: 0, queued: 0, intercepted: 0 });
    if (!(how in row)) return;
    row[how]++;
    if (how !== 'shown') return;
    if (_c.shownAny) _c.gaps.push(_c.since);
    _c.shownAny = true;
    _c.since = 0;
}

/** A choice the player made on a shown dispatch; counted when the same event
 *  has had the same answer earlier in the run. */
export function countChoice(eventKey, choiceKey) {
    const k = `${eventKey}|${choiceKey}`;
    if (_c.choices.has(k)) _c.repeats++;
    else _c.choices.add(k);
}

/** A pause the desk took on its own, by cause ('notice', 'skip'). */
export function countPause(cause) {
    _c.pauses[cause] = (_c.pauses[cause] || 0) + 1;
}

/** An actionable development the player did not make by hand that moment, by
 *  kind ('fill', 'settlement', 'expiry', 'notice', 'forced_sale'). */
export function countDevelopment(kind) {
    _c.developments[kind] = (_c.developments[kind] || 0) + 1;
    _c.since++;
}

/** A snapshot of every tally (a copy; mutating it changes nothing). */
export function counts() {
    const dispatches = {};
    for (const [k, v] of Object.entries(_c.dispatches)) dispatches[k] = { ...v };
    return {
        dispatches,
        repeatedChoices: _c.repeats,
        pauses: { ..._c.pauses },
        developments: { ..._c.developments },
        betweenDispatches: _c.gaps.slice(),
        sinceLastDispatch: _c.since,
    };
}
