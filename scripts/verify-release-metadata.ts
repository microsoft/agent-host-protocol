/**
 * Verify release metadata — Cross-checks four independent sources to
 * catch drift between any of them. Exits non-zero (and prints a
 * machine-friendly summary) on the first mismatch.
 *
 * The four sources, per client:
 *
 *   1. Native package version (Cargo.toml / gradle.properties /
 *      package.json / clients/swift/VERSION).
 *   2. `release-metadata.json` (`packageVersion`,
 *      `supportedProtocolVersions`).
 *   3. Generated `Version.generated.{rs,kt,swift}` source files
 *      (`PROTOCOL_VERSION` and `SUPPORTED_PROTOCOL_VERSIONS` constants).
 *   4. Canonical `types/version/registry.ts` (`PROTOCOL_VERSION`,
 *      `SUPPORTED_PROTOCOL_VERSIONS`).
 *
 * Run via `npm run verify:release-metadata` (also wired into `npm test`).
 *
 * CI invokes this after the per-language drift checks in `ci.yml`, so by
 * the time this runs the generated source files are already known to
 * match the canonical registry. This script's primary job is to catch
 * stale `release-metadata.json` files and mismatches between the native
 * package version files and what's recorded in the metadata.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Project } from 'ts-morph';

import { readProtocolVersions } from './read-protocol-versions.js';
import {
  computeReleaseMetadata,
  RELEASE_METADATA_CLIENTS,
  releaseMetadataPath,
  serializeReleaseMetadata,
  type ReleaseMetadata,
} from './generate-release-metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TYPES_DIR = path.join(ROOT, 'types');

const RUST_VERSION_FILE = path.join(
  ROOT,
  'clients',
  'rust',
  'crates',
  'ahp-types',
  'src',
  'version.rs',
);
const KOTLIN_VERSION_FILE = path.join(
  ROOT,
  'clients',
  'kotlin',
  'src',
  'main',
  'kotlin',
  'com',
  'microsoft',
  'agenthostprotocol',
  'generated',
  'Version.generated.kt',
);
const SWIFT_VERSION_FILE = path.join(
  ROOT,
  'clients',
  'swift',
  'AgentHostProtocol',
  'Sources',
  'AgentHostProtocol',
  'Generated',
  'Version.generated.swift',
);
const GO_VERSION_FILE = path.join(
  ROOT,
  'clients',
  'go',
  'ahptypes',
  'version.generated.go',
);
const TS_REGISTRY_FILE = path.join(ROOT, 'types', 'version', 'registry.ts');

interface Mismatch {
  readonly client?: string;
  readonly source: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

function fail(mismatches: readonly Mismatch[]): never {
  console.error('❌ release-metadata verification failed:');
  for (const m of mismatches) {
    const tag = m.client ? `[${m.client}] ` : '';
    console.error(`  ${tag}${m.source}`);
    console.error(`    expected: ${JSON.stringify(m.expected)}`);
    console.error(`    actual:   ${JSON.stringify(m.actual)}`);
  }
  console.error('');
  console.error(
    "Hint: run `npm run generate:metadata` and commit the result, " +
      'and re-run the per-language generator (e.g. `npm run generate:rust`) ' +
      'if a Version.generated.* file is out of date.',
  );
  process.exit(1);
}

/** Extracts `pub const PROTOCOL_VERSION: &str = "x.y.z";` from version.rs. */
function rustVersionConstants(source: string): { current: string; supported: string[] } {
  const cur = source.match(/pub const PROTOCOL_VERSION: &str = "([^"]+)"/);
  const sup = source.match(
    /pub const SUPPORTED_PROTOCOL_VERSIONS: &\[&str\]\s*=\s*&\[([^\]]*)\]/,
  );
  if (!cur || !sup) {
    throw new Error('rustVersionConstants: failed to parse version.rs');
  }
  const supported = [...sup[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { current: cur[1], supported };
}

/** Extracts the Kotlin constants from Version.generated.kt. */
function kotlinVersionConstants(source: string): { current: string; supported: string[] } {
  const cur = source.match(/public const val PROTOCOL_VERSION: String = "([^"]+)"/);
  const sup = source.match(
    /public val SUPPORTED_PROTOCOL_VERSIONS: List<String> = listOf\(([\s\S]*?)\)/,
  );
  if (!cur || !sup) {
    throw new Error('kotlinVersionConstants: failed to parse Version.generated.kt');
  }
  const supported = [...sup[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { current: cur[1], supported };
}

/** Extracts the Swift constants from Version.generated.swift. */
function swiftVersionConstants(source: string): { current: string; supported: string[] } {
  const cur = source.match(/public let PROTOCOL_VERSION: String = "([^"]+)"/);
  const sup = source.match(
    /public let SUPPORTED_PROTOCOL_VERSIONS: \[String\] = \[([\s\S]*?)\]/,
  );
  if (!cur || !sup) {
    throw new Error('swiftVersionConstants: failed to parse Version.generated.swift');
  }
  const supported = [...sup[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { current: cur[1], supported };
}

/** Extracts the Go constants from version.generated.go. */
function goVersionConstants(source: string): { current: string; supported: string[] } {
  const cur = source.match(/const ProtocolVersion\s*=\s*"([^"]+)"/);
  // supportedProtocolVersions is declared as a `var ... = []string{ ... }` slice
  // literal; capture every quoted entry inside the braces.
  const sup = source.match(
    /var supportedProtocolVersions\s*=\s*\[\]string\{([\s\S]*?)\}/,
  );
  if (!cur || !sup) {
    throw new Error('goVersionConstants: failed to parse version.generated.go');
  }
  const supported = [...sup[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { current: cur[1], supported };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function main(): void {
  // Load the ts-morph project from the canonical tsconfig so the same
  // include rules used by the generators apply here.
  const project = new Project({
    tsConfigFilePath: path.join(TYPES_DIR, 'tsconfig.json'),
  });

  const { current: registryCurrent, supported: registrySupported } = readProtocolVersions(project);

  const mismatches: Mismatch[] = [];

  // ── Check 1: generated Version.* files match the registry ──────────────
  // (CI's per-language drift checks already catch this when they run, but
  // checking here too keeps `npm test` self-contained for local devs.)
  const generatedSources = [
    { lang: 'rust', file: RUST_VERSION_FILE, parse: rustVersionConstants },
    { lang: 'kotlin', file: KOTLIN_VERSION_FILE, parse: kotlinVersionConstants },
    { lang: 'swift', file: SWIFT_VERSION_FILE, parse: swiftVersionConstants },
    { lang: 'go', file: GO_VERSION_FILE, parse: goVersionConstants },
  ] as const;
  for (const { lang, file, parse } of generatedSources) {
    if (!fs.existsSync(file)) {
      mismatches.push({
        client: lang,
        source: `${path.relative(ROOT, file)} missing`,
        expected: 'file present',
        actual: 'file absent',
      });
      continue;
    }
    const parsed = parse(fs.readFileSync(file, 'utf-8'));
    if (parsed.current !== registryCurrent) {
      mismatches.push({
        client: lang,
        source: `${path.relative(ROOT, file)} PROTOCOL_VERSION`,
        expected: registryCurrent,
        actual: parsed.current,
      });
    }
    if (!arraysEqual(parsed.supported, registrySupported)) {
      mismatches.push({
        client: lang,
        source: `${path.relative(ROOT, file)} SUPPORTED_PROTOCOL_VERSIONS`,
        expected: registrySupported,
        actual: parsed.supported,
      });
    }
  }

  // ── Check 2: release-metadata.json files match expected payload ────────
  for (const client of RELEASE_METADATA_CLIENTS) {
    const metaPath = releaseMetadataPath(client, ROOT);
    if (!fs.existsSync(metaPath)) {
      mismatches.push({
        client,
        source: `${path.relative(ROOT, metaPath)} missing`,
        expected: 'file present',
        actual: 'file absent',
      });
      continue;
    }
    const expected = computeReleaseMetadata(client, ROOT, registrySupported);
    const expectedSerialized = serializeReleaseMetadata(expected);
    const actualSerialized = fs.readFileSync(metaPath, 'utf-8');

    if (expectedSerialized !== actualSerialized) {
      // Parse the actual file for a more useful diff in the error message.
      let actualParsed: Partial<ReleaseMetadata> = {};
      try {
        actualParsed = JSON.parse(actualSerialized) as Partial<ReleaseMetadata>;
      } catch {
        // Leave actualParsed empty; the full-text mismatch is still reported below.
      }
      if (actualParsed.packageVersion !== expected.packageVersion) {
        mismatches.push({
          client,
          source: `${path.relative(ROOT, metaPath)} packageVersion`,
          expected: expected.packageVersion,
          actual: actualParsed.packageVersion,
        });
      }
      if (
        !Array.isArray(actualParsed.supportedProtocolVersions) ||
        !arraysEqual(
          actualParsed.supportedProtocolVersions as string[],
          expected.supportedProtocolVersions,
        )
      ) {
        mismatches.push({
          client,
          source: `${path.relative(ROOT, metaPath)} supportedProtocolVersions`,
          expected: expected.supportedProtocolVersions,
          actual: actualParsed.supportedProtocolVersions,
        });
      }
      if (expectedSerialized !== actualSerialized && mismatches.length === 0) {
        // Whitespace/formatting drift only — still a CI failure since the
        // file is supposed to be regenerated-and-committed verbatim.
        mismatches.push({
          client,
          source: `${path.relative(ROOT, metaPath)} formatting`,
          expected: 'regenerated output',
          actual: 'on-disk content differs from `npm run generate:metadata`',
        });
      }
    }
  }

  // ── Defensive: catch a broken registry parse ───────────────────────────
  if (!fs.existsSync(TS_REGISTRY_FILE)) {
    mismatches.push({
      source: `${path.relative(ROOT, TS_REGISTRY_FILE)} missing`,
      expected: 'file present',
      actual: 'file absent',
    });
  }

  if (mismatches.length > 0) {
    fail(mismatches);
  }

  console.log(
    `✅ release-metadata verification passed: PROTOCOL_VERSION=${registryCurrent}, ` +
      `SUPPORTED_PROTOCOL_VERSIONS=[${registrySupported.join(', ')}]`,
  );
}

main();
