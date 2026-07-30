import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export const MOCK_ENV_DIR = path.join(os.tmpdir(), 'local-model-chat-benchmark-mock');

export async function setupMockEnvironment(): Promise<string> {
  // Ensure fresh mock directory
  try {
    await fs.rm(MOCK_ENV_DIR, { recursive: true, force: true });
  } catch (_) {}

  await fs.mkdir(MOCK_ENV_DIR, { recursive: true });

  // Create distinct mock files and subdirectories (zero overlap with system prompt examples)
  const makeReport = (lineCount: number, factLine: number, fact: string) =>
    Array.from({ length: lineCount }, (_, index) => {
      const line = index + 1;
      if (line === factLine) return `IMPORTANT RECORD: ${fact}`;
      return `Record ${String(line).padStart(4, '0')}: routine operational telemetry was reviewed and no exception was recorded.`;
    }).join('\n');

  const mockFiles = [
    {
      filePath: 'user_profile.json',
      content: JSON.stringify(
        {
          username: 'benchmark_tester',
          userId: 9482,
          role: 'admin',
          accountStatus: 'active',
        },
        null,
        2
      ),
    },
    {
      filePath: 'server_info.txt',
      content: 'Benchmark mock server status: Operational running on cluster alpha-9.',
    },
    {
      filePath: 'config/app_settings.env',
      content: 'PORT=9090\nDB_HOST=mockdb.internal\nSECRET_KEY=bench_sec_99',
    },
    {
      filePath: 'modules/utility.js',
      content: 'export function computeHash(input) { return "hash_" + input.length; }',
    },
    {
      filePath: 'retrieval/short_brief.txt',
      content: makeReport(12, 7, 'The launch codename is AURORA-LIME.'),
    },
    {
      filePath: 'retrieval/medium_report.txt',
      content: makeReport(140, 83, 'The scheduled backup window is Thursday at 02:30 UTC.'),
    },
    {
      filePath: 'retrieval/long_archive.txt',
      content: makeReport(420, 397, 'The emergency recovery phrase is ORBIT-CEDAR-731.'),
    },
  ];

  for (const item of mockFiles) {
    const fullPath = path.join(MOCK_ENV_DIR, item.filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, item.content, 'utf-8');
  }

  return MOCK_ENV_DIR;
}
