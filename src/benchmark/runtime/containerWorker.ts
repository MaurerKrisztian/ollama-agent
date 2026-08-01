import fs from 'fs/promises';
import { BENCHMARK_TEST_CASES } from '../cases/index.js';
import type { BenchmarkAgentConfig } from '../types.js';
import { runBenchmarkAttemptInContainer } from './runner.js';

interface ContainerRequest {
  testId: string;
  modelName: string;
  ollamaHost: string;
  ollamaToken?: string;
  agentConfig?: BenchmarkAgentConfig;
}

async function main() {
  const request = JSON.parse(await fs.readFile('/benchmark-io/request.json', 'utf8')) as ContainerRequest;
  const testCase = BENCHMARK_TEST_CASES.find((candidate) => candidate.id === request.testId);
  if (!testCase) throw new Error(`Unknown benchmark test: ${request.testId}`);
  const result = await runBenchmarkAttemptInContainer(
    testCase,
    request.modelName,
    request.ollamaHost,
    request.ollamaToken,
    request.agentConfig,
  );
  await fs.writeFile('/benchmark-io/result.json', JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
