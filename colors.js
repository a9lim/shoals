/* ===================================================
   colors.js -- Shoals project-specific design tokens.
   Maps financial concepts to the shared inks and
   injects themed CSS custom properties.
   =================================================== */

// --- Financial Color Aliases ---
// Per theme, since the inks are theme-paired; read through _themePalette().
for (const T of [_PALETTE.light, _PALETTE.dark]) {
  const k = T.inks;
  T.up    = k.viridian;
  T.down  = k.madder;
  T.call  = k.viridian;
  T.put   = k.madder;
  T.stock = k.ochre;
  T.bond  = k.prussian;
  T.delta = k.ochre;
  T.gamma = k.viridian;
  T.theta = k.madder;
  T.vega  = k.violet;
  T.rho   = k.prussian;
  T.vxhcn = k.violet;
}

_freezeTokens();

// --- CSS Variable Injection ---
(function() {
  const P = _PALETTE, L = P.light, D = P.dark;
  const fin = ['up', 'down', 'call', 'put', 'stock', 'bond', 'delta', 'gamma', 'theta', 'vega', 'rho', 'vxhcn'];
  const genFin = (T) => fin.map(k => `  --${k}: ${T[k]};`).join('\n');
  _injectProjectVars(
    genFin(L) + `
  --chart-grid: ${_r(L.text, 0.06)};
  --chart-crosshair: ${_r(L.text, 0.25)};
  --chart-axis: ${L.textSecondary};
  --chain-hover: ${_r(L.text, 0.04)};
  --dialog-bg: ${L.panelSolid};`,
    genFin(D) + `
  --chart-grid: ${_r(D.text, 0.06)};
  --chart-crosshair: ${_r(D.text, 0.25)};
  --chart-axis: ${D.textSecondary};
  --chain-hover: ${_r(D.text, 0.06)};
  --dialog-bg: ${D.panelSolid};`
  );
})();
