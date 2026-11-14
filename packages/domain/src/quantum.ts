import type { SimulationJobStatus } from './simulation.js';

export interface QuantumModelPreset {
  id: string;
  version: string;
  name: string;
  category: 'quantum-chemistry';
  engine: 'PySCF';
  engineVersion: string | null;
  method: string;
  basisSet: string;
  maxAtoms: number;
  maxScfCycles: number;
  assumptions: string[];
  limitations: string[];
}

export interface QuantumJobConfig {
  modelPresetId: string;
  modelPresetVersion: string;
  initialStructureRevisionId: string;
  computeFields: boolean;
}

export interface QuantumJobInfo {
  jobId: string;
  status: SimulationJobStatus;
  modelPresetId: string;
  modelPresetVersion: string;
  initialStructureRevisionId: string;
  scfCyclesCompleted: number;
  maxScfCycles: number;
  converged: boolean | null;
  createdAtIso: string;
  updatedAtIso: string;
  errorCode: string | null;
  errorMessage: string | null;
  statusUrl: string;
  resultsUrl: string;
}

export interface QuantumScalarSample {
  positionAngstrom: [number, number, number];
  value: number;
}

export interface QuantumOrbitalAmplitudeField {
  fieldKind: 'orbital-amplitude-and-phase';
  orbitalLabel: string;
  orbitalIndex: number;
  isovalue: number;
  unit: 'bohr^-3/2';
  samples: QuantumScalarSample[];
}

export interface QuantumElectronDensityField {
  fieldKind: 'total-electron-density';
  isovalue: number;
  unit: 'e/bohr^3';
  samples: QuantumScalarSample[];
}

export interface QuantumOrbitalEnergy {
  index: number;
  label: string;
  occupancy: number;
  energyHartree: number;
  energyEv: number;
}

export interface QuantumResults {
  jobId: string;
  status: SimulationJobStatus;
  engine: 'PySCF';
  engineVersion: string;
  method: string;
  basisSet: string;
  chargeE: number;
  spinMultiplicity: number;
  converged: boolean;
  scfCycles: number;
  totalEnergyHartree: number | null;
  totalEnergyKjMol: number | null;
  energyBasis: 'mole-of-systems';
  homoEnergyHartree: number | null;
  lumoEnergyHartree: number | null;
  homoLumoGapEv: number | null;
  dipoleMomentDebye: [number, number, number] | null;
  dipoleMagnitudeDebye: number | null;
  orbitals: QuantumOrbitalEnergy[];
  homoOrbitalField: QuantumOrbitalAmplitudeField | null;
  electronDensityField: QuantumElectronDensityField | null;
  inputStructureRevisionId: string;
  inputStructureHashSha256: string;
  assumptions: string[];
  limitations: string[];
  warnings: string[];
}
