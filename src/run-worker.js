/* ===================================================
   src/run-worker.js -- The live-equivalence check's
   module worker (02a "Gates": live equivalence). It has
   its own module instances, so it replays the page's
   journal on a run of its own and returns the digest
   trail for main.js's shoalsReplayCheck() to compare
   with the live run's.
   =================================================== */

import { run, newRun } from './run.js';
import { replayTo, keepDigests } from './run-replay.js';

self.onmessage = (e) => {
    const { header, journal, endpoint } = e.data;
    try {
        keepDigests(true);
        newRun({ preset: header.preset, seed: header.seed, hand: header.hand });
        replayTo(journal, endpoint);
        self.postMessage({ ok: true, digests: run.digests });
    } catch (err) {
        self.postMessage({ ok: false, error: String((err && err.stack) || err), digests: run.digests });
    }
};
