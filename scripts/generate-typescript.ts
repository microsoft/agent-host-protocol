/**
 * TypeScript Client Generator — Copies the canonical TypeScript protocol
 * sources under `types/` into the TypeScript client source tree at
 * `clients/typescript/src/types/`, prepending a generated-file banner to
 * each emitted file and emitting ordinary enums for the public SDK.
 *
 * Unlike the Rust and Swift generators (which translate the TypeScript
 * source into a different language and commit the result), this source
 * mirror is intentionally **not** committed. The destination
 * directory is gitignored in `clients/typescript/.gitignore`; CI and the
 * documented dev flow regenerate it from the canonical sources.
 *
 * Canonical const enums become ordinary enums in this mirror so the built
 * declarations work for isolatedModules and verbatimModuleSyntax consumers.
 * The SDK already emits runtime enum objects under isolatedModules; the
 * canonical sources and the enum members' wire values are left unchanged.
 *
 * Before copying, the generator runs `generateActionOrigin` so the
 * derived `action-origin.generated.ts` file in `types/` is current. This
 * makes `npm run generate:typescript` self-contained — running just that
 * single script produces correct output even if other generators
 * (`--swift`, `--rust`, default `npm run generate`) were not run first.
 *
 * Sources are resolved against `types/tsconfig.json` so the include/exclude
 * rules stay consistent with what the rest of the toolchain treats as
 * "protocol code" — in particular, `*.test.ts` files and `test-cases/`
 * fixtures are excluded.
 *
 * `clients/typescript/src/types/` is wiped before the copy so files that
 * have been removed from `types/` do not linger in the output.
 *
 * Output: clients/typescript/src/types/**\/*.ts
 */

import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { generateActionOrigin } from './generate-action-origin.js';

const GENERATED_BANNER = `// Generated from types/*.ts — do not edit.
// Regenerate with: npm run generate:typescript
`;

const COPY_BANNER_MARKER = '// Generated from types/*.ts — do not edit.';

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function rmDirContents(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    } else {
      fs.rmSync(full, { force: true });
    }
  }
}

/**
 * Returns true if this source file should be emitted into the generated
 * TypeScript client. Excludes test files and test-case fixtures so the
 * published client mirrors what the rest of the toolchain treats as
 * protocol code.
 */
function shouldEmit(sf: SourceFile, typesDir: string): boolean {
  const rel = path.relative(typesDir, sf.getFilePath());
  if (rel.startsWith('..')) return false;
  if (rel.endsWith('.test.ts')) return false;
  const segments = rel.split(path.sep);
  if (segments[0] === 'test-cases') return false;
  return true;
}

/**
 * Generate the TypeScript client source mirror under
 * `clients/typescript/src/types/`.
 *
 * `project` is the shared ts-morph project; `typesDir` is the absolute
 * path of the canonical `types/` directory the project was loaded from.
 * Passing `typesDir` explicitly avoids depending on the non-standard
 * `configFilePath` field that ts-morph adds to the resolved
 * `CompilerOptions` (it is not part of the TypeScript public API).
 *
 * Before copying, the generator runs the action-origin generator to
 * ensure the derived `types/action-origin.generated.ts` is current —
 * this makes `npm run generate:typescript` self-contained when invoked
 * alone.
 *
 * File contents are read from disk rather than from ts-morph's in-memory
 * copy so that the freshly-written `action-origin.generated.ts` is picked
 * up with its final contents.
 */
export function generateTypeScriptClient(project: Project, typesDir: string, outDir: string): void {
  // Refresh the derived action-origin file so the published client
  // doesn't carry stale `RootAction` / `SessionAction` / `TerminalAction`
  // / `ChangesetAction` unions when only `--typescript` is invoked.
  generateActionOrigin(project, typesDir);

  const sources = project.getSourceFiles().filter(sf => shouldEmit(sf, typesDir));
  // Keep SDK-only transformations out of the project shared by all generators.
  const outputProject = new Project({ useInMemoryFileSystem: true });

  rmDirContents(outDir);
  ensureDir(outDir);

  for (const sf of sources) {
    const rel = path.relative(typesDir, sf.getFilePath());
    const destPath = path.join(outDir, rel);
    ensureDir(path.dirname(destPath));

    const raw = fs.readFileSync(sf.getFilePath(), 'utf-8');
    const outputSource = outputProject.createSourceFile(rel, raw);
    for (const declaration of outputSource.getDescendantsOfKind(SyntaxKind.EnumDeclaration)) {
      declaration.setIsConstEnum(false);
    }
    const contents = outputSource.getFullText();
    const withBanner = contents.startsWith(COPY_BANNER_MARKER)
      ? contents
      : `${GENERATED_BANNER}\n${contents}`;
    fs.writeFileSync(destPath, withBanner);
  }
}
