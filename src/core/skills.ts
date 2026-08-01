import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIRECTORIES = ['.agent/skills', '.agents/skills'] as const;
const APPLICATION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_SKILLS = 50;
const MAX_SKILL_BYTES = 64 * 1024;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ProjectSkillMetadata {
  name: string;
  description: string;
  path: string;
}

export interface LoadedProjectSkill extends ProjectSkillMetadata {
  instructions: string;
}

export type SkillCommand =
  | { kind: 'none' }
  | { kind: 'list' }
  | { kind: 'invoke'; name: string; request: string }
  | { kind: 'invalid'; error: string };

export interface SkillRegistryOptions {
  /** Include skills shipped with this application in addition to workspace skills. */
  includeBundled?: boolean;
  /** Override the application root, primarily for tests and embedded deployments. */
  bundledRoot?: string | null;
}

interface DiscoveredSkill {
  metadata: ProjectSkillMetadata;
  fullPath: string;
}

function parseFrontmatterValue(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
  if (!match) return null;
  return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
}

function parseSkillDocument(contents: string, folderName: string): Omit<ProjectSkillMetadata, 'path'> | null {
  const frontmatterMatch = contents.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!frontmatterMatch) return null;
  const name = parseFrontmatterValue(frontmatterMatch[1], 'name');
  const description = parseFrontmatterValue(frontmatterMatch[1], 'description');
  if (!name || !description || !SKILL_NAME_PATTERN.test(name) || name !== folderName) return null;
  return { name, description };
}

async function readBoundedSkill(fullPath: string): Promise<string> {
  const stats = await fs.stat(fullPath);
  if (!stats.isFile()) throw new Error('Skill instructions are not a regular file.');
  if (stats.size > MAX_SKILL_BYTES) {
    throw new Error(`Skill instructions exceed the ${MAX_SKILL_BYTES / 1024} KB limit.`);
  }
  return fs.readFile(fullPath, 'utf8');
}

async function discoverSkills(
  workingDir: string,
  options: SkillRegistryOptions = {}
): Promise<DiscoveredSkill[]> {
  const workspaceRoot = path.resolve(workingDir);
  const bundledRoot = options.bundledRoot === undefined ? APPLICATION_ROOT : options.bundledRoot;
  const locations: Array<{ root: string; bundled: boolean }> = [{ root: workspaceRoot, bundled: false }];
  if (options.includeBundled !== false && bundledRoot) {
    const resolvedBundledRoot = path.resolve(bundledRoot);
    if (resolvedBundledRoot !== workspaceRoot) locations.push({ root: resolvedBundledRoot, bundled: true });
  }

  const skills: DiscoveredSkill[] = [];
  const seenNames = new Set<string>();

  for (const location of locations) {
    for (const relativeDir of SKILL_DIRECTORIES) {
      let entries;
      try {
        entries = await fs.readdir(path.join(location.root, relativeDir), { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (skills.length >= MAX_SKILLS) return skills;
        if (!entry.isDirectory() || !SKILL_NAME_PATTERN.test(entry.name)) continue;
        const relativePath = `${relativeDir}/${entry.name}/SKILL.md`;
        const fullPath = path.join(location.root, relativePath);
        try {
          const contents = await readBoundedSkill(fullPath);
          const parsed = parseSkillDocument(contents, entry.name);
          if (!parsed || seenNames.has(parsed.name)) continue;
          seenNames.add(parsed.name);
          skills.push({
            metadata: {
              ...parsed,
              path: location.bundled ? `bundled:${relativePath}` : relativePath,
            },
            fullPath,
          });
        } catch {
          // Missing, oversized, malformed, and unreadable skills are not advertised.
        }
      }
    }
  }

  return skills;
}

export async function listProjectSkills(
  workingDir: string,
  options: SkillRegistryOptions = {}
): Promise<ProjectSkillMetadata[]> {
  return (await discoverSkills(workingDir, options)).map((skill) => skill.metadata);
}

export async function loadProjectSkill(
  workingDir: string,
  name: string,
  options: SkillRegistryOptions = {}
): Promise<LoadedProjectSkill | null> {
  if (!SKILL_NAME_PATTERN.test(name)) return null;
  const skill = (await discoverSkills(workingDir, options)).find(
    (candidate) => candidate.metadata.name === name
  );
  if (!skill) return null;
  const instructions = await readBoundedSkill(skill.fullPath);
  return { ...skill.metadata, instructions };
}

export function parseSkillCommand(input: string): SkillCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return { kind: 'none' };
  if (/^\/skills\s*$/i.test(trimmed)) return { kind: 'list' };
  if (!/^\/skill(?:\s|$)/i.test(trimmed)) return { kind: 'none' };

  const match = trimmed.match(/^\/skill\s+([^\s]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return { kind: 'invalid', error: 'Usage: /skill <name> <request>' };
  const name = match[1].toLowerCase();
  const request = (match[2] || '').trim();
  if (!SKILL_NAME_PATTERN.test(name)) {
    return { kind: 'invalid', error: `Invalid skill name "${match[1]}".` };
  }
  if (!request) return { kind: 'invalid', error: 'Usage: /skill <name> <request>' };
  return { kind: 'invoke', name, request };
}

export function formatProjectSkillList(skills: ProjectSkillMetadata[]): string {
  if (skills.length === 0) return 'No workspace or bundled skills found.';
  return [
    'Available skills:',
    ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
    '',
    'Use one with: /skill <name> <request>',
  ].join('\n');
}

export function buildSelectedSkillPrompt(skill: LoadedProjectSkill): string {
  return [
    `## Explicitly selected skill: ${skill.name}`,
    `The user explicitly selected this skill for the current turn. Follow its complete instructions below.`,
    `Skill source: ${skill.path}`,
    '',
    '<skill_instructions>',
    skill.instructions.trim(),
    '</skill_instructions>',
  ].join('\n');
}
