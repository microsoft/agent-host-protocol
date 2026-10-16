/**
 * Verify CHANGELOG entries — Fails CI if any client's CHANGELOG.md is
 * missing a `## [X.Y.Z]` heading matching the current native package
 * version, or if the root CHANGELOG.md is missing one matching the
 * current `PROTOCOL_VERSION`.
 *
 * This complements `verify-release-metadata.ts`:
 *
 *  - `verify-release-metadata` cross-checks the *current* package
 *    version against the generated constants and the metadata file.
 *  - `verify-changelog` checks that whenever someone bumps a version
 *    they also rotate the CHANGELOG. Every per-tag publish workflow
 *    (`publish-spec.yml`, `publish-rust.yml`, `publish-swift.yml`) and
 *    the ADO publish pipelines for Kotlin/TypeScript re-run this script
 *    as a release-time gate, on top of the same check in `ci.yml` for
 *    every PR. Defense in depth: a release artifact can't ship with a
 *    missing CHANGELOG heading regardless of which entry path triggered
 *    the publish.
 *
 * The check is intentionally lenient about the rest of the heading line
 * (e.g. ` — YYYY-MM-DD` or ` — Unreleased`) — only the version-bracket
 * part is matched. That way the `[Unreleased]` → `[0.2.0]` rotation
 * style and the strict `[0.2.0] — 2026-05-27` style both pass.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Project } from 'ts-morph';

import { readProtocolVersions } from './read-protocol-versions.js';
import {
  readKotlinPackageVersion,
  readRustPackageVersion,
  readSwiftPackageVersion,
  readTypeScriptPackageVersion,
  readGoPackageVersion,
  readDotnetPackageVersion,
} from './generate-release-metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TYPES_DIR = path.join(ROOT, 'types');

interface ChangelogTarget {
  readonly label: string;
  readonly version: string;
  readonly changelogPath: string;
  /**
   * Free-form note appended to the failure message — typically a
   * one-line nudge about how to recover (which file to edit, which
   * workflow enforces the same rule at publish time, etc.).
   */
  readonly hint: string;
}

function changelogHasHeading(changelogPath: string, version: string): boolean {
  if (!fs.existsSync(changelogPath)) return false;
  const body = fs.readFileSync(changelogPath, 'utf-8');
  // Escape regex metacharacters in the version (e.g. the dot in `0.2.0`
  // and the hyphen in `-SNAPSHOT`) so an unusual version string can't
  // produce false matches.
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^## \\[${escaped}\\]`, 'm').test(body);
}

/**
 * Normalize a native package version into the version string that
 * should appear in the CHANGELOG. Currently this only strips Maven's
 * `-SNAPSHOT` suffix — between Kotlin releases, `VERSION_NAME` lives
 * at `X.Y.Z-SNAPSHOT` but the CHANGELOG entry is for the upcoming
 * `X.Y.Z` release (per Keep a Changelog convention).
 *
 * Other SemVer pre-release identifiers (e.g. `-beta.1`, `-rc.2`) are
 * left alone — those *are* shippable, distinct versions and should
 * have their own CHANGELOG entries.
 */
function changelogVersionFor(rawVersion: string): string {
  return rawVersion.endsWith('-SNAPSHOT')
    ? rawVersion.slice(0, -'-SNAPSHOT'.length)
    : rawVersion;
}

function main(): void {
  const project = new Project({
    tsConfigFilePath: path.join(TYPES_DIR, 'tsconfig.json'),
  });
  const { current: specVersion } = readProtocolVersions(project);

  const targets: ChangelogTarget[] = [
    {
      label: 'spec',
      version: specVersion,
      changelogPath: path.join(ROOT, 'CHANGELOG.md'),
      hint:
        'Bump types/version/registry.ts PROTOCOL_VERSION? Add a matching ' +
        '## [X.Y.Z] heading to CHANGELOG.md before merging. The spec ' +
        'publish workflow re-validates the same check at tag time.',
    },
    {
      label: 'rust',
      version: readRustPackageVersion(
        fs.readFileSync(path.join(ROOT, 'clients', 'rust', 'Cargo.toml'), 'utf-8'),
      ),
      changelogPath: path.join(ROOT, 'clients', 'rust', 'CHANGELOG.md'),
      hint:
        'Bumped [workspace.package].version in clients/rust/Cargo.toml? ' +
        'Add a matching ## [X.Y.Z] heading to clients/rust/CHANGELOG.md.',
    },
    {
      label: 'kotlin',
      version: readKotlinPackageVersion(
        fs.readFileSync(
          path.join(ROOT, 'clients', 'kotlin', 'gradle.properties'),
          'utf-8',
        ),
      ),
      changelogPath: path.join(ROOT, 'clients', 'kotlin', 'CHANGELOG.md'),
      hint:
        'Bumped VERSION_NAME in clients/kotlin/gradle.properties? Add a ' +
        'matching ## [X.Y.Z] heading to clients/kotlin/CHANGELOG.md ' +
        '(use the bare version, not the -SNAPSHOT suffix).',
    },
    {
      label: 'swift',
      version: readSwiftPackageVersion(
        fs.readFileSync(path.join(ROOT, 'clients', 'swift', 'VERSION'), 'utf-8'),
      ),
      changelogPath: path.join(ROOT, 'clients', 'swift', 'CHANGELOG.md'),
      hint:
        'Bumped clients/swift/VERSION? Add a matching ## [X.Y.Z] heading ' +
        'to clients/swift/CHANGELOG.md before tagging.',
    },
    {
      label: 'typescript',
      version: readTypeScriptPackageVersion(
        fs.readFileSync(
          path.join(ROOT, 'clients', 'typescript', 'package.json'),
          'utf-8',
        ),
      ),
      changelogPath: path.join(ROOT, 'clients', 'typescript', 'CHANGELOG.md'),
      hint:
        'Bumped clients/typescript/package.json version? Add a matching ' +
        '## [X.Y.Z] heading to clients/typescript/CHANGELOG.md. ' +
        'TypeScript publishes via the ADO pipeline at ' +
        'clients/typescript/pipeline.yml; this CI check is the only ' +
        '"no release without a changelog entry" gate, so it must pass ' +
        'on main before publishPackage is toggled.',
    },
    {
      label: 'go',
      version: readGoPackageVersion(
        fs.readFileSync(path.join(ROOT, 'clients', 'go', 'VERSION'), 'utf-8'),
      ),
      changelogPath: path.join(ROOT, 'clients', 'go', 'CHANGELOG.md'),
      hint:
        'Bumped clients/go/VERSION? Add a matching ## [X.Y.Z] heading ' +
        'to clients/go/CHANGELOG.md before tagging clients/go/vX.Y.Z.',
    },
    {
      label: 'cli',
      version: readTypeScriptPackageVersion(
        fs.readFileSync(path.join(ROOT, 'cli', 'package.json'), 'utf-8'),
      ),
      changelogPath: path.join(ROOT, 'cli', 'CHANGELOG.md'),
      hint:
        'CLI 0.0.0 is an unpublished placeholder requiring [Unreleased]. ' +
        'For a release, bump cli/package.json, refresh its lockfile, and ' +
        'run changelog:release -- --version X.Y.Z --targets cli. ' +
        'cli/pipeline.yml rejects the placeholder and requires the release heading.',
    },
    {
      label: 'dotnet',
      version: readDotnetPackageVersion(
        fs.readFileSync(path.join(ROOT, 'clients', 'dotnet', 'VERSION'), 'utf-8'),
      ),
      changelogPath: path.join(ROOT, 'clients', 'dotnet', 'CHANGELOG.md'),
      hint:
        'Bumped clients/dotnet/VERSION? Add a matching ## [X.Y.Z] heading ' +
        'to clients/dotnet/CHANGELOG.md before tagging dotnet/vX.Y.Z.',
    },
  ];

  const failures: { target: ChangelogTarget; relative: string; expectedVersion: string }[] = [];
  for (const target of targets) {
    const expectedVersion = target.label === 'cli' && target.version === '0.0.0'
      ? 'Unreleased' : changelogVersionFor(target.version);
    if (!fs.existsSync(target.changelogPath)) {
      failures.push({
        target,
        relative: path.relative(ROOT, target.changelogPath),
        expectedVersion,
      });
      continue;
    }
    if (!changelogHasHeading(target.changelogPath, expectedVersion)) {
      failures.push({
        target,
        relative: path.relative(ROOT, target.changelogPath),
        expectedVersion,
      });
    }
  }

  if (failures.length > 0) {
    console.error('❌ CHANGELOG verification failed:');
    for (const { target, relative, expectedVersion } of failures) {
      console.error(
        `  [${target.label}] ${relative} is missing a '## [${expectedVersion}]' heading`,
      );
      console.error(`    hint: ${target.hint}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ CHANGELOG verification passed for: ${targets
      .map((t) => `${t.label}=${changelogVersionFor(t.version)}`)
      .join(', ')}`,
  );
}

main();
