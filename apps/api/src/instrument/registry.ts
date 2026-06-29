import type { InstrumentConfig } from '../shared.js';
import { batConfig } from './configs/bat.js';

const registry = new Map<string, InstrumentConfig>([['BAT', batConfig]]);

export function getInstrumentConfig(code: string): InstrumentConfig {
  const config = registry.get(code.toUpperCase());
  if (!config) throw new Error(`Unknown instrument: ${code}`);
  return config;
}

export function getInstrumentConfigById(instrumentId: string): InstrumentConfig {
  for (const config of registry.values()) {
    if (config.instrumentId === instrumentId) return config;
  }
  throw new Error(`No instrument config found for id: ${instrumentId}`);
}

export function listInstrumentCodes(): string[] {
  return [...registry.keys()];
}
