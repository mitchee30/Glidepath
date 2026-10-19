// Units: everything is stored in kg / cm. Display can be kg, 斤 (0.5 kg) or lb.

export const UNIT_SYSTEMS = ['metric', 'jin', 'imperial'];
const LB = 0.45359237;

export function weightUnit(units) {
  return units === 'imperial' ? 'lb' : units === 'jin' ? 'jin' : 'kg';
}

export function kgToDisplay(kg, units, digits = 1) {
  if (kg === null || kg === undefined || Number.isNaN(kg)) return null;
  const v = units === 'imperial' ? kg / LB : units === 'jin' ? kg * 2 : kg;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function displayToKg(v, units) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return units === 'imperial' ? n * LB : units === 'jin' ? n / 2 : n;
}

export function cmToFtIn(cm) {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, inch };
}

export function ftInToCm(ft, inch) {
  return (Number(ft) * 12 + Number(inch || 0)) * 2.54;
}

export function lengthUnit(units) {
  return units === 'imperial' ? 'in' : 'cm';
}

export function cmToDisplay(cm, units) {
  if (cm === null || cm === undefined) return null;
  return units === 'imperial' ? Math.round((cm / 2.54) * 10) / 10 : Math.round(cm * 10) / 10;
}

export function displayToCm(v, units) {
  const n = Number(v);
  return units === 'imperial' ? n * 2.54 : n;
}
