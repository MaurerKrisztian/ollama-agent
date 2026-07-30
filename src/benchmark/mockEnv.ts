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
      filePath: 'README.md',
      content:
        '# Fixture Agent Studio\n\nFixture Agent Studio is a local-first coding assistant used to validate project-research workflows.\n',
    },
    {
      filePath: 'package.json',
      content: JSON.stringify(
        {
          name: 'fixture-agent-studio',
          version: '2.0.0',
          description:
            'Fixture Agent Studio is a local-first coding assistant used to validate project-research workflows',
          scripts: {
            start: 'node src/index.js',
          },
        },
        null,
        2
      ),
    },
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
      filePath: 'config/feature_flags.json',
      content: JSON.stringify(
        {
          darkMode: false,
          auditLogging: true,
          maxRetries: 3,
        },
        null,
        2
      ),
    },
    {
      filePath: 'config/service.yaml',
      content: 'service:\n  name: fixture-api\n  endpoint: https://staging.internal/v1\n  timeout: 30\n',
    },
    {
      filePath: 'modules/formatter.ts',
      content:
        'export function formatLabel(value: string) {\n  const normalized = value.trim().toLowerCase();\n  return `[old] ${normalized}`;\n}\n',
    },
    {
      filePath: 'docs/release_notes.md',
      content:
        '# Release Notes\n\nStable authentication flow.\n\nDeprecated: legacy token fallback remains enabled.\n\nMetrics export is available.\n',
    },
    {
      filePath: 'docs/status.txt',
      content: 'Deployment state: pending-review.\nOwner: platform-team.\nRegion: eu-central.\n',
    },
    {
      filePath: '.agent/AGENTS.md',
      content:
        '# Fixture project instructions\n\nFor this project, the required verification command is `npm run fixture-check`.\n',
    },
    {
      filePath: '.agent/skills/release-helper/SKILL.md',
      content:
        '---\n' +
        'name: release-helper\n' +
        'description: Use when preparing a version release or release checklist.\n' +
        '---\n\n' +
        '# Release Helper\n\n' +
        'For a release, require a clean working tree, run `npm run fixture-check`, and include the approval code `SAPPHIRE-CHECK-42` in the checklist.\n',
    },
    {
      filePath: '.agent/skills/theme-stylist/SKILL.md',
      content:
        '---\n' +
        'name: theme-stylist\n' +
        'description: Use only for UI theme, color palette, and visual styling work.\n' +
        '---\n\n' +
        '# Theme Stylist\n\nUse the fixture accent color `ultraviolet-77` for theme work.\n',
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
