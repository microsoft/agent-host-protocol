import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  applyReleaseToChangelog,
  CHANGELOG_TARGETS,
  type ChangelogTarget,
  changelogPathForTarget,
  formatFragmentErrors,
  type ChangeFragment,
  readChangeFragments,
} from './change-fragments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface Options {
  readonly version: string;
  readonly date: string;
  readonly dryRun: boolean;
  readonly targets: readonly ChangelogTarget[];
}

function usage(): never {
  console.error(
    'Usage: npm run changelog:release -- --version X.Y.Z [--date YYYY-MM-DD] [--targets spec,rust,kotlin,typescript,swift,go] [--dry-run]',
  );
  process.exit(1);
}

function parseTargets(raw: string | undefined): readonly ChangelogTarget[] {
  if (!raw) {
    usage();
  }
  const targets: ChangelogTarget[] = [];
  const seen = new Set<ChangelogTarget>();
  for (const target of raw.split(',')) {
    if (!(CHANGELOG_TARGETS as readonly string[]).includes(target)) {
      usage();
    }
    const typedTarget = target as ChangelogTarget;
    if (seen.has(typedTarget)) {
      usage();
    }
    seen.add(typedTarget);
    targets.push(typedTarget);
  }
  if (targets.length === 0) {
    usage();
  }
  return targets;
}

function parseArgs(argv: readonly string[]): Options {
  let version: string | undefined;
  let date: string | undefined = new Date().toISOString().slice(0, 10);
  let dryRun = false;
  let targets: readonly ChangelogTarget[] = CHANGELOG_TARGETS;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--version':
        version = argv[++index];
        break;
      case '--date':
        date = argv[++index];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--targets':
        targets = parseTargets(argv[++index]);
        break;
      default:
        usage();
    }
  }

  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    usage();
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    usage();
  }
  return { version, date, dryRun, targets };
}

function fragmentTouchesTargets(fragment: ChangeFragment, targets: ReadonlySet<ChangelogTarget>): boolean {
  return fragment.targets.some((target) => targets.has(target));
}

function writeRemainingFragment(fragment: ChangeFragment, remainingTargets: readonly ChangelogTarget[]): void {
  const next = {
    type: fragment.type,
    message: fragment.message,
    targets: remainingTargets,
    ...(fragment.issues.length > 0 ? { issues: fragment.issues } : {}),
  };
  fs.writeFileSync(fragment.filePath, `${JSON.stringify(next, null, 2)}\n`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const { fragments, errors } = readChangeFragments(ROOT);
  if (errors.length > 0) {
    console.error('❌ cannot consume invalid change fragments:');
    console.error(formatFragmentErrors(errors, ROOT));
    process.exit(1);
  }

  const selectedTargets = new Set(options.targets);
  const fragmentsToConsume = fragments.filter((fragment) => fragmentTouchesTargets(fragment, selectedTargets));
  if (fragmentsToConsume.length === 0) {
    console.error('❌ no change fragments found for the selected target(s); refusing to rewrite changelogs');
    process.exit(1);
  }

  for (const target of options.targets) {
    const changelogPath = changelogPathForTarget(target, ROOT);
    const current = fs.readFileSync(changelogPath, 'utf-8');
    const next = applyReleaseToChangelog(current, target, options.version, options.date, fragmentsToConsume);
    if (!options.dryRun) {
      fs.writeFileSync(changelogPath, next);
    }
  }

  if (!options.dryRun) {
    for (const fragment of fragments) {
      if (!fragmentTouchesTargets(fragment, selectedTargets)) {
        continue;
      }
      const remainingTargets = fragment.targets.filter((target) => !selectedTargets.has(target));
      if (remainingTargets.length === 0) {
        fs.unlinkSync(fragment.filePath);
      } else {
        writeRemainingFragment(fragment, remainingTargets);
      }
    }
  }

  const action = options.dryRun ? 'Would consume' : 'Consumed';
  console.log(
    `${action} ${fragmentsToConsume.length} change fragment(s) for ${options.version} ` +
      `target(s): ${options.targets.join(', ')}.`,
  );
}

main();
