import fs from 'fs';
import path from 'path';

export const CHANGELOG_TARGETS = [
  'spec',
  'rust',
  'kotlin',
  'typescript',
  'swift',
  'go',
  'dotnet',
] as const;
export type ChangelogTarget = (typeof CHANGELOG_TARGETS)[number];

export const CHANGE_TYPES = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_TYPE_HEADINGS: Record<ChangeType, string> = {
  added: 'Added',
  changed: 'Changed',
  deprecated: 'Deprecated',
  removed: 'Removed',
  fixed: 'Fixed',
  security: 'Security',
};

export interface ChangeFragment {
  readonly filePath: string;
  readonly type: ChangeType;
  readonly message: string;
  readonly details: readonly string[];
  readonly targets: readonly ChangelogTarget[];
  readonly issues: readonly number[];
}

export interface FragmentValidationError {
  readonly filePath: string;
  readonly message: string;
}

interface ParsedMarkdownSection {
  heading: string;
  body: string[];
}

const ALLOWED_FRAGMENT_KEYS = new Set(['type', 'message', 'details', 'targets', 'issues']);
const DEFAULT_TARGETS: readonly ChangelogTarget[] = CHANGELOG_TARGETS;
export const REPO_ISSUES_URL = 'https://github.com/microsoft/agent-host-protocol/issues';

export interface UnlinkedIssueMatch {
  readonly line: number;
  readonly reference: string;
}

export function findUnlinkedIssueReferences(lines: readonly string[]): UnlinkedIssueMatch[] {
  const matches: UnlinkedIssueMatch[] = [];
  let openFence: { char: string; length: number } | undefined;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const rest = fenceMatch[2];
      if (!openFence) {
        openFence = { char: marker[0], length: marker.length };
      } else if (marker[0] === openFence.char && marker.length >= openFence.length && rest.trim().length === 0) {
        openFence = undefined;
      }
      continue;
    }
    if (openFence) {
      continue;
    }

    const stripped = line
      .replace(/`[^`]*`/g, '')
      .replace(/\[[^\]]*\]\([^)]*\)/g, '');
    for (const match of stripped.matchAll(/(?<![A-Za-z0-9_/#-])#(\d+)\b/g)) {
      matches.push({ line: index + 1, reference: match[0] });
    }
  }

  return matches;
}

export function changesDir(rootDir: string): string {
  return path.join(rootDir, 'docs', '.changes');
}

export function changelogPathForTarget(target: ChangelogTarget, rootDir: string): string {
  switch (target) {
    case 'spec':
      return path.join(rootDir, 'CHANGELOG.md');
    case 'rust':
      return path.join(rootDir, 'clients', 'rust', 'CHANGELOG.md');
    case 'kotlin':
      return path.join(rootDir, 'clients', 'kotlin', 'CHANGELOG.md');
    case 'typescript':
      return path.join(rootDir, 'clients', 'typescript', 'CHANGELOG.md');
    case 'swift':
      return path.join(rootDir, 'clients', 'swift', 'CHANGELOG.md');
    case 'go':
      return path.join(rootDir, 'clients', 'go', 'CHANGELOG.md');
    case 'dotnet':
      return path.join(rootDir, 'clients', 'dotnet', 'CHANGELOG.md');
  }
}

export function releaseIntroForTarget(target: ChangelogTarget, version: string): string {
  return target === 'spec'
    ? `Spec version: \`${version}\``
    : `Implements AHP ${version}.`;
}

export function listChangeFragmentPaths(rootDir: string): string[] {
  const dir = changesDir(rootDir);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(dir, name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isChangeType(value: unknown): value is ChangeType {
  return typeof value === 'string' && (CHANGE_TYPES as readonly string[]).includes(value);
}

function isChangelogTarget(value: unknown): value is ChangelogTarget {
  return typeof value === 'string' && (CHANGELOG_TARGETS as readonly string[]).includes(value);
}

function validateTargets(filePath: string, value: unknown, errors: FragmentValidationError[]): readonly ChangelogTarget[] {
  if (value === undefined) {
    return DEFAULT_TARGETS;
  }
  if (!Array.isArray(value) || value.length === 0) {
    errors.push({ filePath, message: '`targets` must be a non-empty array when present' });
    return [];
  }
  const targets: ChangelogTarget[] = [];
  const seen = new Set<ChangelogTarget>();
  for (const entry of value) {
    if (!isChangelogTarget(entry)) {
      errors.push({
        filePath,
        message: `invalid target ${JSON.stringify(entry)}; expected one of ${CHANGELOG_TARGETS.join(', ')}`,
      });
      continue;
    }
    if (seen.has(entry)) {
      errors.push({ filePath, message: `duplicate target ${entry}` });
      continue;
    }
    seen.add(entry);
    targets.push(entry);
  }
  return targets;
}

function validateIssues(filePath: string, value: unknown, errors: FragmentValidationError[]): readonly number[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push({ filePath, message: '`issues` must be an array of positive integers when present' });
    return [];
  }
  const issues: number[] = [];
  const seen = new Set<number>();
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry <= 0) {
      errors.push({ filePath, message: `invalid issue number ${JSON.stringify(entry)}; expected a positive integer` });
      continue;
    }
    if (seen.has(entry)) {
      errors.push({ filePath, message: `duplicate issue number ${entry}` });
      continue;
    }
    seen.add(entry);
    issues.push(entry);
  }
  return issues;
}

function validateDetails(filePath: string, value: unknown, errors: FragmentValidationError[]): readonly string[] {
  if (value === undefined) {
    return [];
  }

  let lines: string[];
  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      errors.push({ filePath, message: '`details` must not be empty when present' });
      return [];
    }
    lines = value.replace(/\r\n/g, '\n').split('\n');
    if (lines.some((line) => line.includes('\r'))) {
      errors.push({ filePath, message: '`details` must not contain bare carriage returns' });
      return [];
    }
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      errors.push({ filePath, message: '`details` must be a non-empty string or array of lines when present' });
      return [];
    }
    lines = [];
    let hasInvalidEntry = false;
    for (const entry of value) {
      if (typeof entry !== 'string') {
        errors.push({ filePath, message: '`details` array entries must be strings' });
        hasInvalidEntry = true;
        continue;
      }
      if (/\r|\n/.test(entry)) {
        errors.push({ filePath, message: '`details` array entries must each be a single line' });
        hasInvalidEntry = true;
        continue;
      }
      lines.push(entry);
    }
    if (hasInvalidEntry) {
      return [];
    }
  } else {
    errors.push({ filePath, message: '`details` must be a non-empty string or array of lines when present' });
    return [];
  }

  if (lines[0].trim().length === 0 || lines[lines.length - 1].trim().length === 0) {
    errors.push({ filePath, message: '`details` must not have leading or trailing blank lines' });
    return [];
  }

  let openFence: { char: string; length: number } | undefined;
  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const rest = fenceMatch[2];
      if (!openFence) {
        openFence = { char: marker[0], length: marker.length };
      } else if (marker[0] === openFence.char && marker.length >= openFence.length && rest.trim().length === 0) {
        openFence = undefined;
      }
      continue;
    }

    if (!openFence && /^\s*#{1,6}\s/.test(line)) {
      errors.push({ filePath, message: '`details` must not contain Markdown headings outside fenced code blocks' });
    }
  }

  if (openFence) {
    errors.push({ filePath, message: '`details` has an unclosed fenced code block' });
  }

  for (const unlinked of findUnlinkedIssueReferences(lines)) {
    errors.push({
      filePath,
      message: `\`details\` contains unlinked issue/PR reference ${unlinked.reference}; link it as [${unlinked.reference}](${REPO_ISSUES_URL}/${unlinked.reference.slice(1)}) or put it in \`issues\``,
    });
  }

  return lines;
}

export function parseChangeFragment(filePath: string, raw: string): { fragment?: ChangeFragment; errors: FragmentValidationError[] } {
  const errors: FragmentValidationError[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    errors.push({
      filePath,
      message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { errors };
  }

  if (!isRecord(parsed)) {
    return {
      errors: [{ filePath, message: 'fragment must be a JSON object' }],
    };
  }

  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_FRAGMENT_KEYS.has(key)) {
      errors.push({ filePath, message: `unknown field ${JSON.stringify(key)}` });
    }
  }

  if (!isChangeType(parsed.type)) {
    errors.push({
      filePath,
      message: `\`type\` must be one of ${CHANGE_TYPES.join(', ')}`,
    });
  }

  if (typeof parsed.message !== 'string' || parsed.message.trim().length === 0) {
    errors.push({ filePath, message: '`message` must be a non-empty string' });
  } else if (parsed.message !== parsed.message.trim()) {
    errors.push({ filePath, message: '`message` must not have leading or trailing whitespace' });
  } else if (parsed.message.startsWith('- ')) {
    errors.push({ filePath, message: '`message` must not include the leading Markdown bullet' });
  } else if (/\r|\n/.test(parsed.message)) {
    errors.push({ filePath, message: '`message` must be a single line; put code snippets, examples, or doc links in `details`' });
  } else {
    for (const unlinked of findUnlinkedIssueReferences([parsed.message])) {
      errors.push({
        filePath,
        message: `\`message\` contains unlinked issue/PR reference ${unlinked.reference}; put it in \`issues\` or link it as [${unlinked.reference}](${REPO_ISSUES_URL}/${unlinked.reference.slice(1)})`,
      });
    }
  }

  const details = validateDetails(filePath, parsed.details, errors);
  const targets = validateTargets(filePath, parsed.targets, errors);
  const issues = validateIssues(filePath, parsed.issues, errors);

  if (errors.length > 0) {
    return { errors };
  }

  return {
    fragment: {
      filePath,
      type: parsed.type as ChangeType,
      message: parsed.message as string,
      details,
      targets,
      issues,
    },
    errors,
  };
}

export function readChangeFragments(rootDir: string): { fragments: ChangeFragment[]; errors: FragmentValidationError[] } {
  const dir = changesDir(rootDir);
  if (!fs.existsSync(dir)) {
    return {
      fragments: [],
      errors: [{ filePath: dir, message: 'docs/.changes directory is missing' }],
    };
  }

  const fragments: ChangeFragment[] = [];
  const errors: FragmentValidationError[] = [];
  for (const filePath of listChangeFragmentPaths(rootDir)) {
    const result = parseChangeFragment(filePath, fs.readFileSync(filePath, 'utf-8'));
    fragments.push(...(result.fragment ? [result.fragment] : []));
    errors.push(...result.errors);
  }
  return { fragments, errors };
}

function issueSuffix(issues: readonly number[]): string {
  if (issues.length === 0) {
    return '';
  }
  return ` (${issues.map((issue) => `[#${issue}](${REPO_ISSUES_URL}/${issue})`).join(', ')})`;
}

export function renderChangeSections(fragments: readonly ChangeFragment[], target: ChangelogTarget): string[] {
  const lines: string[] = [];
  for (const type of CHANGE_TYPES) {
    const matching = fragments.filter((fragment) => fragment.type === type && fragment.targets.includes(target));
    if (matching.length === 0) {
      continue;
    }
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`### ${CHANGE_TYPE_HEADINGS[type]}`, '');
    for (const fragment of matching) {
      lines.push(`- ${fragment.message}${issueSuffix(fragment.issues)}`);
      for (const detailLine of fragment.details) {
        lines.push(detailLine.trim().length === 0 ? '' : `  ${detailLine}`);
      }
    }
  }
  return lines;
}

function parseMarkdownSections(markdown: string): { preamble: string[]; sections: ParsedMarkdownSection[] } {
  const lines = markdown.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const firstSectionIndex = lines.findIndex((line) => line.startsWith('## '));
  if (firstSectionIndex < 0) {
    return { preamble: lines, sections: [] };
  }

  const preamble = lines.slice(0, firstSectionIndex);
  const sections: ParsedMarkdownSection[] = [];
  let index = firstSectionIndex;
  while (index < lines.length) {
    const heading = lines[index];
    let end = index + 1;
    while (end < lines.length && !lines[end].startsWith('## ')) {
      end++;
    }
    sections.push({ heading, body: lines.slice(index + 1, end) });
    index = end;
  }
  return { preamble, sections };
}

function renderMarkdownSections(preamble: readonly string[], sections: readonly ParsedMarkdownSection[]): string {
  const lines: string[] = [...preamble];
  for (const section of sections) {
    lines.push(section.heading, ...section.body);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function releaseSectionBody(target: ChangelogTarget, version: string, fragments: readonly ChangeFragment[]): string[] {
  const changeLines = renderChangeSections(fragments, target);
  const body = ['', releaseIntroForTarget(target, version)];
  if (changeLines.length > 0) {
    body.push('', ...changeLines);
  }
  body.push('');
  return body;
}

export function applyReleaseToChangelog(
  markdown: string,
  target: ChangelogTarget,
  version: string,
  date: string,
  fragments: readonly ChangeFragment[],
): string {
  const parsed = parseMarkdownSections(markdown);
  const releaseHeading = `## [${version}] — ${date}`;
  const releaseBody = releaseSectionBody(target, version, fragments);
  const existingRelease = parsed.sections.findIndex((section) => section.heading.startsWith(`## [${version}]`));
  if (existingRelease >= 0) {
    if (fragments.length === 0) {
      return `${markdown.replace(/\r\n/g, '\n').trimEnd()}\n`;
    }
    const next = parsed.sections.slice();
    next[existingRelease] = { heading: releaseHeading, body: releaseBody };
    return renderMarkdownSections(parsed.preamble, next);
  }

  const unreleasedIndex = parsed.sections.findIndex((section) => section.heading === '## [Unreleased]');
  if (unreleasedIndex < 0) {
    throw new Error(`${target} CHANGELOG is missing a '## [Unreleased]' section`);
  }

  const next = parsed.sections.slice();
  next.splice(unreleasedIndex + 1, 0, { heading: releaseHeading, body: releaseBody });
  return renderMarkdownSections(parsed.preamble, next);
}

export function formatFragmentErrors(errors: readonly FragmentValidationError[], rootDir: string): string {
  return errors
    .map((error) => {
      const relative = path.relative(rootDir, error.filePath) || error.filePath;
      return `  ${relative}: ${error.message}`;
    })
    .join('\n');
}
