import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPresetBenchmarkDefinitions } from '../cases/benchmarks.js';
import { BENCHMARK_TEST_CASES } from '../cases/index.js';
import type { BenchmarkDefinition } from '../cases/index.js';
import { DEFAULT_BENCHMARK_OUTPUT_DIR } from './results.js';

export const DEFAULT_BENCHMARK_DEFINITIONS_PATH = path.join(
  DEFAULT_BENCHMARK_OUTPUT_DIR,
  'definitions.json',
);

const presetDefinitions = () => createPresetBenchmarkDefinitions(BENCHMARK_TEST_CASES);

function validateTestIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('A benchmark must contain at least one test.');
  }
  if (value.some((id) => typeof id !== 'string')) {
    throw new Error('Benchmark test IDs must be strings.');
  }
  const testIds = value as string[];
  if (new Set(testIds).size !== testIds.length) {
    throw new Error('A benchmark cannot contain duplicate test IDs.');
  }
  const knownIds = new Set(BENCHMARK_TEST_CASES.map((testCase) => testCase.id));
  const unknownIds = testIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length) throw new Error(`Unknown benchmark test IDs: ${unknownIds.join(', ')}`);
  return [...testIds];
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Benchmark name is required.');
  return value.trim().slice(0, 100);
}

function normalizeDescription(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

async function readDeclarativeDefinitions(): Promise<BenchmarkDefinition[]> {
  const definitionsDir = path.resolve('benchmarks/definitions');
  try {
    const entries = await fs.readdir(definitionsDir);
    const definitions: BenchmarkDefinition[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const fullPath = path.join(definitionsDir, entry);
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item && typeof item === 'object' && item.id && Array.isArray(item.testIds)) {
            definitions.push({
              id: String(item.id),
              name: normalizeName(item.name || item.id),
              description: normalizeDescription(item.description),
              type: item.type || 'custom',
              version: Number(item.version) || 1,
              testIds: item.testIds,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            });
          }
        }
      } catch {
        // ignore invalid files
      }
    }
    return definitions;
  } catch {
    return [];
  }
}

async function readCustomDefinitions(filePath: string): Promise<BenchmarkDefinition[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BenchmarkDefinition => Boolean(
      item && typeof item === 'object' && (item as BenchmarkDefinition).type === 'custom',
    ));
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeCustomDefinitions(
  definitions: BenchmarkDefinition[],
  filePath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(definitions, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export async function listBenchmarkDefinitions(
  filePath = DEFAULT_BENCHMARK_DEFINITIONS_PATH,
): Promise<BenchmarkDefinition[]> {
  const custom = await readCustomDefinitions(filePath);
  const declarative = await readDeclarativeDefinitions();
  const seenIds = new Set<string>();
  const combined: BenchmarkDefinition[] = [];

  for (const def of [...presetDefinitions(), ...declarative, ...custom]) {
    if (!seenIds.has(def.id)) {
      seenIds.add(def.id);
      combined.push(def);
    }
  }
  return combined;
}

export async function createBenchmarkDefinition(
  input: { name?: unknown; description?: unknown; testIds?: unknown },
  filePath = DEFAULT_BENCHMARK_DEFINITIONS_PATH,
): Promise<BenchmarkDefinition> {
  const definitions = await readCustomDefinitions(filePath);
  const now = new Date().toISOString();
  const definition: BenchmarkDefinition = {
    id: `custom-${randomUUID()}`,
    name: normalizeName(input.name),
    description: normalizeDescription(input.description),
    type: 'custom',
    version: 1,
    testIds: validateTestIds(input.testIds),
    createdAt: now,
    updatedAt: now,
  };
  definitions.push(definition);
  await writeCustomDefinitions(definitions, filePath);
  return definition;
}

export async function updateBenchmarkDefinition(
  id: string,
  input: { name?: unknown; description?: unknown; testIds?: unknown },
  filePath = DEFAULT_BENCHMARK_DEFINITIONS_PATH,
): Promise<BenchmarkDefinition> {
  const definitions = await readCustomDefinitions(filePath);
  const index = definitions.findIndex((definition) => definition.id === id);
  if (index === -1) throw new Error(`Custom benchmark "${id}" not found.`);
  const current = definitions[index];
  const updated: BenchmarkDefinition = {
    ...current,
    name: normalizeName(input.name),
    description: normalizeDescription(input.description),
    testIds: validateTestIds(input.testIds),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
  definitions[index] = updated;
  await writeCustomDefinitions(definitions, filePath);
  return updated;
}

export async function deleteBenchmarkDefinition(
  id: string,
  filePath = DEFAULT_BENCHMARK_DEFINITIONS_PATH,
): Promise<void> {
  const definitions = await readCustomDefinitions(filePath);
  const remaining = definitions.filter((definition) => definition.id !== id);
  if (remaining.length === definitions.length) throw new Error(`Custom benchmark "${id}" not found.`);
  await writeCustomDefinitions(remaining, filePath);
}

export async function getBenchmarkDefinition(id: string): Promise<BenchmarkDefinition> {
  const definition = (await listBenchmarkDefinitions()).find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Benchmark "${id}" not found.`);
  return definition;
}

export function resolveBenchmarkTests(definition: BenchmarkDefinition) {
  const byId = new Map(BENCHMARK_TEST_CASES.map((testCase) => [testCase.id, testCase]));
  return validateTestIds(definition.testIds).map((id) => byId.get(id)!);
}
