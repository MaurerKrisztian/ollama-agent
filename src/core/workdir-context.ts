import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_FILES = 200;
const MAX_DEPTH = 4;
const MAX_INSTRUCTIONS_CHARS = 12_000;
const MAX_SKILLS = 50;
const MAX_SKILL_HEADER_CHARS = 16_000;
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);

interface ProjectSkillMetadata {
  name: string;
  description: string;
  path: string;
}

async function collectFiles(root: string): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;

  const visit = async (relativeDir: string, depth: number): Promise<void> => {
    if (files.length >= MAX_FILES || depth > MAX_DEPTH) {
      truncated = true;
      return;
    }

    const entries = await fs.readdir(path.join(root, relativeDir), { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const relativePath = path.join(relativeDir, entry.name).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(relativePath, depth + 1);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  };

  await visit('', 0);
  return { files, truncated };
}

async function getPackageSummary(root: string): Promise<string | null> {
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const parts = [
      packageJson.name && `name=${packageJson.name}`,
      packageJson.version && `version=${packageJson.version}`,
      packageJson.description && `description=${packageJson.description}`,
      packageJson.type && `module-type=${packageJson.type}`,
      packageJson.scripts && `scripts=${Object.keys(packageJson.scripts).join(', ')}`,
    ].filter(Boolean);
    return parts.length > 0 ? `Node package: ${parts.join('; ')}` : null;
  } catch {
    return null;
  }
}

function parseFrontmatterValue(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
  if (!match) return null;
  return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
}

async function collectProjectSkills(root: string): Promise<ProjectSkillMetadata[]> {
  const skillsDir = path.join(root, '.agent', 'skills');
  let entries;
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: ProjectSkillMetadata[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || skills.length >= MAX_SKILLS) continue;
    const relativeSkillPath = `.agent/skills/${entry.name}/SKILL.md`;
    try {
      const contents = await fs.readFile(path.join(root, relativeSkillPath), 'utf8');
      const header = contents.slice(0, MAX_SKILL_HEADER_CHARS);
      const frontmatterMatch = header.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
      const frontmatter = frontmatterMatch?.[1] || '';
      const heading = header.match(/^#\s+(.+)$/m)?.[1]?.trim();
      skills.push({
        name: parseFrontmatterValue(frontmatter, 'name') || heading || entry.name,
        description:
          parseFrontmatterValue(frontmatter, 'description') ||
          'No description provided; read the skill instructions if its name matches the task.',
        path: relativeSkillPath,
      });
    } catch {
      // A skill directory without a readable SKILL.md is not advertised.
    }
  }
  return skills;
}

export async function buildWorkingDirectoryContext(workingDir: string): Promise<string> {
  const resolvedDir = path.resolve(workingDir);
  const [{ files, truncated }, packageSummary, projectSkills] = await Promise.all([
    collectFiles(resolvedDir),
    getPackageSummary(resolvedDir),
    collectProjectSkills(resolvedDir),
  ]);

  let agentInstructions: string | null = null;
  try {
    const contents = await fs.readFile(path.join(resolvedDir, '.agent', 'AGENTS.md'), 'utf8');
    agentInstructions =
      contents.length > MAX_INSTRUCTIONS_CHARS
        ? `${contents.slice(0, MAX_INSTRUCTIONS_CHARS)}\n[Instructions truncated]`
        : contents;
  } catch {
    // Project instructions are optional.
  }

  const lines = [
    '# CURRENT WORKING DIRECTORY CONTEXT',
    `Working directory: ${resolvedDir}`,
    packageSummary,
    `Project files (up to ${MAX_FILES}, depth ${MAX_DEPTH}):`,
    files.length > 0 ? files.map((file) => `- ${file}`).join('\n') : '- (empty directory)',
    truncated ? '- [File list truncated]' : null,
  ].filter((line): line is string => Boolean(line));

  if (agentInstructions !== null) {
    lines.push(
      '',
      '## Project instructions from .agent/AGENTS.md',
      'The complete project instructions are already included below. Follow them directly; do not call read_file merely to reread .agent/AGENTS.md.',
      agentInstructions.trim()
    );
  }

  if (projectSkills.length > 0) {
    lines.push(
      '',
      '## Available project skills from .agent/skills',
      'These are metadata summaries only. When a skill matches the current task, use read_file on its SKILL.md path before following it.',
      ...projectSkills.map(
        (skill) => `- ${skill.name}: ${skill.description} (instructions: ${skill.path})`
      )
    );
  }

  return lines.join('\n');
}
