export type Quantity = {
  value: number;
} & (
  | { dimension: 'distance'; unit: 'angstrom' | 'nm' }
  | { dimension: 'time'; unit: 'fs' | 'ps' }
  | { dimension: 'temperature'; unit: 'K' }
  | { dimension: 'pressure'; unit: 'bar' }
  | { dimension: 'charge'; unit: 'e' }
  | { dimension: 'mass'; unit: 'u' | 'kg' }
  | {
      dimension: 'energy';
      unit: 'kJ/mol' | 'eV';
      basis: 'mole-of-systems' | 'whole-system';
    }
);

export type QuantityDimension = Quantity['dimension'];

// Exact 2019 SI definitions
const AVOGADRO_CONSTANT = 6.02214076e23; // mol^-1
const ELEMENTARY_CHARGE_J = 1.602176634e-19; // J per eV
const EV_TO_KJ_PER_MOL = (ELEMENTARY_CHARGE_J * AVOGADRO_CONSTANT) / 1000; // 96.48533212331002
const ATOMIC_MASS_UNIT_KG = 1.66053906892e-27; // CODATA 2022

export class UnitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitValidationError';
  }
}

export function assertValidQuantity(quantity: Quantity): void {
  if (typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
    throw new UnitValidationError(
      `Quantity value for dimension "${quantity.dimension}" must be a finite number.`,
    );
  }

  if (quantity.dimension === 'temperature' && quantity.value < 0) {
    throw new UnitValidationError('Absolute temperature in kelvin cannot be negative.');
  }

  if (quantity.dimension === 'mass' && quantity.value < 0) {
    throw new UnitValidationError('Mass cannot be negative.');
  }

  if (quantity.dimension === 'energy') {
    if (quantity.unit === 'kJ/mol' && quantity.basis !== 'mole-of-systems') {
      throw new UnitValidationError(
        'Energy in kJ/mol must declare basis "mole-of-systems".',
      );
    }
    if (quantity.unit === 'eV' && quantity.basis !== 'whole-system') {
      throw new UnitValidationError(
        'Energy in eV must declare basis "whole-system" (explicitly distinct from per-atom averages).',
      );
    }
  }
}

export function convertDistance(
  quantity: Extract<Quantity, { dimension: 'distance' }>,
  targetUnit: 'angstrom' | 'nm',
): Extract<Quantity, { dimension: 'distance' }> {
  assertValidQuantity(quantity);
  if (quantity.unit === targetUnit) {
    return { ...quantity };
  }
  const value =
    quantity.unit === 'angstrom' ? quantity.value * 0.1 : quantity.value * 10;
  return { dimension: 'distance', unit: targetUnit, value };
}

export function convertTime(
  quantity: Extract<Quantity, { dimension: 'time' }>,
  targetUnit: 'fs' | 'ps',
): Extract<Quantity, { dimension: 'time' }> {
  assertValidQuantity(quantity);
  if (quantity.unit === targetUnit) {
    return { ...quantity };
  }
  const value =
    quantity.unit === 'fs' ? quantity.value * 0.001 : quantity.value * 1000;
  return { dimension: 'time', unit: targetUnit, value };
}

export function convertMass(
  quantity: Extract<Quantity, { dimension: 'mass' }>,
  targetUnit: 'u' | 'kg',
): Extract<Quantity, { dimension: 'mass' }> {
  assertValidQuantity(quantity);
  if (quantity.unit === targetUnit) {
    return { ...quantity };
  }
  const value =
    quantity.unit === 'u'
      ? quantity.value * ATOMIC_MASS_UNIT_KG
      : quantity.value / ATOMIC_MASS_UNIT_KG;
  return { dimension: 'mass', unit: targetUnit, value };
}

export function convertWholeSystemEnergy(
  quantity: Extract<Quantity, { dimension: 'energy' }>,
  targetUnit: 'kJ/mol' | 'eV',
): Extract<Quantity, { dimension: 'energy' }> {
  assertValidQuantity(quantity);
  if (quantity.unit === targetUnit) {
    return { ...quantity };
  }
  if (quantity.unit === 'eV' && targetUnit === 'kJ/mol') {
    return {
      dimension: 'energy',
      unit: 'kJ/mol',
      basis: 'mole-of-systems',
      value: quantity.value * EV_TO_KJ_PER_MOL,
    };
  }
  return {
    dimension: 'energy',
    unit: 'eV',
    basis: 'whole-system',
    value: quantity.value / EV_TO_KJ_PER_MOL,
  };
}

export function convertQuantity(quantity: Quantity, targetUnit: string): Quantity {
  assertValidQuantity(quantity);

  switch (quantity.dimension) {
    case 'distance':
      if (targetUnit === 'angstrom' || targetUnit === 'nm') {
        return convertDistance(quantity, targetUnit);
      }
      break;
    case 'time':
      if (targetUnit === 'fs' || targetUnit === 'ps') {
        return convertTime(quantity, targetUnit);
      }
      break;
    case 'mass':
      if (targetUnit === 'u' || targetUnit === 'kg') {
        return convertMass(quantity, targetUnit);
      }
      break;
    case 'energy':
      if (targetUnit === 'kJ/mol' || targetUnit === 'eV') {
        return convertWholeSystemEnergy(quantity, targetUnit);
      }
      break;
    case 'temperature':
      if (targetUnit === 'K') {
        return { ...quantity };
      }
      break;
    case 'pressure':
      if (targetUnit === 'bar') {
        return { ...quantity };
      }
      break;
    case 'charge':
      if (targetUnit === 'e') {
        return { ...quantity };
      }
      break;
  }

  throw new UnitValidationError(
    `Incompatible unit "${targetUnit}" for dimension "${quantity.dimension}".`,
  );
}
