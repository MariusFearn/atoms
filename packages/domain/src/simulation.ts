import type { Quantity } from './units.js';

export type SimulationJobStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'interrupted';

export interface PresetParameterLimits {
  minWaterMolecules: number;
  maxWaterMolecules: number;
  minTemperatureK: number;
  maxTemperatureK: number;
  minTimestepFs: number;
  maxTimestepFs: number;
  minDurationPs: number;
  maxDurationPs: number;
}

export interface SimulationModelPreset {
  id: string;
  version: string;
  name: string;
  category: 'molecular-mechanics';
  engine: 'OpenMM';
  engineVersion: string | null;
  forceField: string;
  integrator: string;
  ensemble: 'NVT' | 'NVE';
  constraints: string;
  boundaryConditions: string;
  supportsThermostatTarget: boolean;
  defaultTemperatureK: number;
  defaultTimestepFs: number;
  defaultDurationPs: number;
  limits: PresetParameterLimits;
  assumptions: string[];
  limitations: string[];
}

export interface ExperimentConfig {
  modelPresetId: string;
  modelPresetVersion: string;
  initialStructureRevisionId: string;
  temperature: Extract<Quantity, { dimension: 'temperature' }>;
  timestep: Extract<Quantity, { dimension: 'time' }>;
  duration: Extract<Quantity, { dimension: 'time' }>;
  reportIntervalSteps: number;
  randomSeed: number;
  minimizeBeforeRun: boolean;
}

export interface TrajectoryFrame {
  frameIndex: number;
  step: number;
  simulationTimePs: number;
  kineticEnergyKjMol: number;
  potentialEnergyKjMol: number;
  totalEnergyKjMol: number;
  instantaneousTemperatureK: number;
  positionsAngstrom: Array<[number, number, number]>;
}

export interface ReproducibilityRecord {
  inputStructureRevisionId: string;
  inputStructureHashSha256: string;
  modelPresetId: string;
  modelPresetVersion: string;
  forceFieldSource: string;
  integrator: string;
  ensemble: 'NVT' | 'NVE';
  engine: string;
  engineVersion: string;
  platformName: string;
  numericalPrecision: string;
  randomSeed: number;
  degreesOfFreedom: number;
  constraintsSummary: string;
  resolvedSettings: {
    temperatureK: number;
    timestepFs: number;
    durationPs: number;
    totalSteps: number;
    reportIntervalSteps: number;
    minimizeBeforeRun: boolean;
  };
  terminationStatus: SimulationJobStatus;
  energyBasis: 'mole-of-systems';
  energyUnit: 'kJ/mol';
  distanceUnit: 'angstrom';
  timeUnit: 'ps';
  temperatureUnit: 'K';
}

export interface ExperimentJobInfo {
  jobId: string;
  status: SimulationJobStatus;
  modelPresetId: string;
  modelPresetVersion: string;
  initialStructureRevisionId: string;
  progressFraction: number;
  completedSteps: number;
  totalSteps: number;
  framesRecorded: number;
  createdAtIso: string;
  updatedAtIso: string;
  errorCode: string | null;
  errorMessage: string | null;
  statusUrl: string;
  resultsUrl: string;
}

export interface ExperimentResults {
  jobId: string;
  status: SimulationJobStatus;
  isPartial: boolean;
  atomIds: string[];
  frames: TrajectoryFrame[];
  reproducibility: ReproducibilityRecord;
  warnings: string[];
}
