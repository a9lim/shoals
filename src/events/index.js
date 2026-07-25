/* index.js -- Event pool registry. Merges all domain event arrays,
   provides by-id lookup, and validates followup chain integrity. */

export { PARAM_RANGES } from './param-ranges.js';

import { FED_EVENTS } from './fed.js';
import { MACRO_EVENTS } from './macro.js';
import { CONGRESS_EVENTS } from './congress.js';
import { INVESTIGATION_EVENTS } from './investigation.js';
import { MEDIA_EVENTS } from './media.js';
import { MARKET_EVENTS } from './market.js';
import { FIRM_EVENTS } from './firm.js';
import { TIP_EVENTS } from './tips.js';
import { INTERJECTION_EVENTS } from './interjections.js';
import { TRAIT_EVENTS } from './traits.js';
import { RACE_EVENTS } from './race-events.js';
// Overhaul phase-5a domain skeletons + machinery shells. The machinery shells
// (china strait, policy regime/dispute/reporting) fire via the race bridge /
// main.js hooks; the arc seeds are DORMANT (Poisson-excluded categories) until
// the content rounds. Merged here so getEventById + followup-chain validation
// see them all.
import { HALCYON_EVENTS } from './halcyon.js';
import { CHINA_EVENTS } from './china.js';
import { POLARIS_EVENTS } from './polaris.js';
import { WONDER_EVENTS } from './wonders.js';
import { POLICY_EVENTS } from './policy.js';
import { TREATY_EVENTS } from './treaty.js';
import { INSIDER_EVENTS } from './insider.js';
// P7-3: the room (the endgame branch point). Category 'room' is Poisson-excluded
// and latch-fired by main.js's _checkRoom -- merged here for getEventById.
import { ROOM_EVENTS } from './room.js';

export const ALL_EVENTS = [
    ...FED_EVENTS,
    ...MACRO_EVENTS,
    ...CONGRESS_EVENTS,
    ...INVESTIGATION_EVENTS,
    ...MEDIA_EVENTS,
    ...MARKET_EVENTS,
    ...FIRM_EVENTS,
    ...TIP_EVENTS,
    ...INTERJECTION_EVENTS,
    ...TRAIT_EVENTS,
    ...RACE_EVENTS,
    ...HALCYON_EVENTS,
    ...CHINA_EVENTS,
    ...POLARIS_EVENTS,
    ...WONDER_EVENTS,
    ...POLICY_EVENTS,
    ...TREATY_EVENTS,
    ...INSIDER_EVENTS,
    ...ROOM_EVENTS,
];

// -- Event-by-id lookup --
let _eventById = null;

export function getEventById(id) {
    if (!_eventById) {
        _eventById = new Map();
        for (const ev of ALL_EVENTS) _eventById.set(ev.id, ev);
    }
    return _eventById.get(id) || null;
}

// -- Startup validation: followup chain integrity --
// Collect referenced followup ids from BOTH top-level `ev.followups` (scheduled in
// _fireEvent) AND choice-level `choice.followups` (scheduled via scheduleFollowup
// when the player picks that choice) -- both are real references, so a target
// reached only through a choice must not be flagged "never referenced".
const _referencedFollowupIds = new Set();
for (const ev of ALL_EVENTS) {
    if (ev.followups) {
        for (const fu of ev.followups) _referencedFollowupIds.add(fu.id);
    }
    if (Array.isArray(ev.choices)) {
        for (const c of ev.choices) {
            if (c && Array.isArray(c.followups)) {
                for (const fu of c.followups) _referencedFollowupIds.add(fu.id);
            }
        }
    }
}
for (const id of _referencedFollowupIds) {
    const ev = getEventById(id);
    if (!ev) console.warn(`[events] followup references unknown event: '${id}'`);
    else if (!ev.followupOnly && typeof ev.likelihood !== 'function') console.warn(`[events] followup target '${id}' missing followupOnly flag`);
}
for (const ev of ALL_EVENTS) {
    if (ev.followupOnly && !_referencedFollowupIds.has(ev.id)) {
        console.warn(`[events] '${ev.id}' has followupOnly but is never referenced as a followup`);
    }
}
