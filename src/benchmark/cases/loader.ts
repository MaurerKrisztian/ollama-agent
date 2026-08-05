import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ResponseSpec } from '../types.js';
import type { BenchmarkTestCaseDefinition } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is 3 levels up from src/benchmark/cases/
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, 'benchmarks');

function collectJsonCaseFiles(dirPath: string): string[] {
  const jsonFiles: string[] = [];
  if (!fsSync.existsSync(dirPath)) return jsonFiles;

  const entries = fsSync.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (['definitions', 'fixtures', 'verifiers', 'node_modules', '.git'].includes(entry.name)) {
        continue;
      }
      jsonFiles.push(...collectJsonCaseFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      jsonFiles.push(fullPath);
    }
  }
  return jsonFiles;
}

/**
 * Loads declarative benchmark test cases from JSON files in the root `benchmarks/` directory (including `benchmarks/cases/`).
 */
export function loadDeclarativeBenchmarkCases(): BenchmarkTestCaseDefinition[] {
  const loadedCases: BenchmarkTestCaseDefinition[] = [];

  if (!fsSync.existsSync(BENCHMARKS_DIR)) {
    return loadedCases;
  }

  try {
    const jsonFiles = collectJsonCaseFiles(BENCHMARKS_DIR);

    for (const filePath of jsonFiles) {

      try {
        const rawContent = fsSync.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(rawContent);

        // Handle single test case definition, array of test cases, or full suite JSON with "tests" array
        const rawCases: any[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.tests)
          ? parsed.tests
          : parsed.id && (parsed.prompt || Array.isArray(parsed.prompts) || Array.isArray(parsed.multiStepPrompts))
          ? [parsed]
          : [];

        for (const item of rawCases) {
          const rawPrompts = Array.isArray(item.prompts) ? item.prompts : Array.isArray(item.multiStepPrompts) ? item.multiStepPrompts : null;
          const parseResponseSpec = (obj: any): ResponseSpec | undefined => {
            const raw = obj.expectedResponseSpec || obj.expectedResponse || obj.expectedAnswer || obj.expectedResponseSubstrings;
            if (!raw) return undefined;
            if (Array.isArray(raw)) return { containsSubstrings: raw.map(String) };
            if (typeof raw === 'string') return { containsSubstrings: [raw] };
            if (typeof raw === 'object') {
              const include = raw.include || raw.includes || raw.contains || raw.containsSubstrings;
              const exclude = raw.exclude || raw.excludes || raw.notInclude || raw.notIncludes || raw.excludesSubstrings;
              const regex = raw.regex || raw.matchesRegex || raw.pattern;
              const exact = raw.exact || raw.exactMatch;
              return {
                containsSubstrings: Array.isArray(include) ? include.map(String) : typeof include === 'string' ? [include] : undefined,
                excludesSubstrings: Array.isArray(exclude) ? exclude.map(String) : typeof exclude === 'string' ? [exclude] : undefined,
                regex: typeof regex === 'string' ? regex : undefined,
                exactMatch: typeof exact === 'string' ? exact : undefined,
              };
            }
            return undefined;
          };

          const multiStepPrompts = rawPrompts
            ? rawPrompts.map((p: any, idx: number) => {
                const stepObj = typeof p === 'string' ? { stepId: `step_${idx + 1}`, prompt: p } : p;
                const respSpec = parseResponseSpec(stepObj) || parseResponseSpec(item);
                return {
                  stepId: stepObj.stepId || `step_${idx + 1}`,
                  prompt: String(stepObj.prompt || ''),
                  expectedFileState: stepObj.expectedFileState || item.expectedFileState,
                  expectedFileJson: stepObj.expectedFileJson || item.expectedFileJson,
                  expectedDirectoryEntries: stepObj.expectedDirectoryEntries || item.expectedDirectoryEntries,
                  expectedToolResults: stepObj.expectedToolResults || item.expectedToolResults,
                  verificationScript: stepObj.verificationScript || item.verificationScript,
                  verifierScriptPath: stepObj.verifierScriptPath || item.verifierScriptPath,
                  expectedResponseSpec: respSpec,
                  expectedResponseSubstrings: respSpec?.containsSubstrings,
                  ...stepObj,
                };
              })
            : undefined;

          const prompt = item.prompt || multiStepPrompts?.[0]?.prompt || '';
          const responseSpec = parseResponseSpec(item) || multiStepPrompts?.[0]?.expectedResponseSpec;
          if (item && item.id && prompt) {
            const testCase: BenchmarkTestCaseDefinition = {
              ...item,
              id: String(item.id),
              name: String(item.name || item.id),
              category: item.category || (multiStepPrompts && multiStepPrompts.length > 1 ? 'multi_step_workflow' : 'code_editing'),
              prompt: String(prompt),
              prompts: item.prompts,
              description: String(item.description || prompt),
              objective: String(item.objective || prompt),
              difficulty: item.difficulty,
              fixture: item.fixture,
              verifierScriptPath: item.verifierScriptPath,
              verificationScript: item.verificationScript,
              expectedFileState: item.expectedFileState,
              expectedFileJson: item.expectedFileJson,
              expectedDirectoryEntries: item.expectedDirectoryEntries,
              expectedResponseSubstrings: responseSpec?.containsSubstrings,
              expectedResponseSpec: responseSpec,
              expectedToolResults: item.expectedToolResults,
              multiStepPrompts,
            };
            loadedCases.push(testCase);
          }
        }
      } catch (err: any) {
        console.warn(`[DeclarativeBenchmarkLoader] Failed to parse ${filePath}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.warn(`[DeclarativeBenchmarkLoader] Failed to read benchmarks directory: ${err.message}`);
  }

  return loadedCases;
}
