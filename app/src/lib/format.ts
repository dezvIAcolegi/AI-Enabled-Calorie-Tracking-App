// Rounding happens only for display (see contracts/ts/macros.ts).
export const fmtKcal = (n: number) => `${Math.round(n)}`;
export const fmtGrams = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${r}` : r.toFixed(1);
};
export const fmtMacro = (n: number) => fmtGrams(n);
