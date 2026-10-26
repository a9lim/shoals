/* ===================================================
   colors.js -- Shoals' data hues on the shared inks.
   Red is the accent, spent on losses and down moves;
   gains take viridian. Each instrument has its ink
   (the tape's entry marks and held strikes), and each
   Greek its own (the book's and the ticket's Greeks).
   Inks are theme-paired, so canvas code reads these
   through _themePalette() on every draw.
   =================================================== */

for (const T of [_PALETTE.light, _PALETTE.dark]) {
  const k = T.inks;
  T.up    = k.viridian;      // gains
  T.down  = T.accent;        // losses and down moves: the one red
  T.stock = k.ochre;         // HCN
  T.bond  = k.prussian;
  T.call  = k.verdigris;
  T.put   = k.sienna;
  T.vxhcn = k.violet;
  T.vxhcnfuture = k.violet;
  T.binary = k.indigo;       // Consensus
  T.computefuture = k.umber; // Cambria
  T.privatestake = k.sap;    // Polaris rounds
  T.delta = k.prussian;
  T.gamma = k.sienna;
  T.theta = k.verdigris;
  T.vega  = k.violet;
  T.rho   = T.textMuted;
}

_freezeTokens();

// --- CSS Variable Injection ---
(function() {
  const P = _PALETTE, L = P.light, D = P.dark;
  const fin = ['up', 'down', 'call', 'put', 'stock', 'bond', 'delta', 'gamma', 'theta', 'vega', 'rho', 'vxhcn', 'binary', 'computefuture', 'privatestake'];
  const gen = (T) => fin.map(k => `  --${k}: ${T[k]};`).join('\n');
  _injectProjectVars(gen(L), gen(D));
})();
