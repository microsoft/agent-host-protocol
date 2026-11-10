/**
 * Generation entry point — Parses TypeScript type definitions using ts-morph and
 * generates documentation markdown and JSON Schema files.
 */

import { Project } from 'ts-morph';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateMarkdownDocs } from './generate-markdown.js';
import { generateJsonSchemas } from './generate-json-schema.js';
import { generateActionOrigin } from './generate-action-origin.js';
import { generateWindowExempt } from './read-window-exempt.js';
import { generateSwiftPackage } from './generate-swift.js';
import { generateRustCrate } from './generate-rust.js';
import { generateKotlinPackage } from './generate-kotlin.js';
import { generateTypeScriptClient } from './generate-typescript.js';
import { generateGoModule } from './generate-go.js';
import { generateCSharpPackage } from './generate-csharp.js';
import { generateReleaseMetadata } from './generate-release-metadata.js';
import { validateEnumCompatibility } from './enum-compatibility.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TYPES_DIR = path.join(ROOT, 'types');
const DOCS_DIR = path.join(ROOT, 'docs', 'reference');
const SCHEMA_DIR = path.join(ROOT, 'schema');
const SCHEMA_PUBLIC_DIR = path.join(ROOT, 'docs', 'public', 'schema');
const SWIFT_DIR = path.join(ROOT, 'clients', 'swift', 'AgentHostProtocol');
const RUST_DIR = path.join(ROOT, 'clients', 'rust');
const KOTLIN_DIR = path.join(ROOT, 'clients', 'kotlin');
const TYPESCRIPT_TYPES_DIR = path.join(ROOT, 'clients', 'typescript', 'src', 'types');
const GO_DIR = path.join(ROOT, 'clients', 'go');
const DOTNET_DIR = path.join(ROOT, 'clients', 'dotnet');

const args = process.argv.slice(2);
const docsOnly = args.includes('--docs');
const schemaOnly = args.includes('--schema');
const actionOriginOnly = args.includes('--action-origin');
const swiftOnly = args.includes('--swift');
const rustOnly = args.includes('--rust');
const kotlinOnly = args.includes('--kotlin');
const typescriptOnly = args.includes('--typescript');
const goOnly = args.includes('--go');
const dotnetOnly = args.includes('--dotnet');
const metadataOnly = args.includes('--metadata');
const allowMissingFormatter = args.includes('--allow-missing-formatter');
const generateAll =
  !docsOnly &&
  !schemaOnly &&
  !actionOriginOnly &&
  !swiftOnly &&
  !rustOnly &&
  !kotlinOnly &&
  !typescriptOnly &&
  !goOnly &&
  !dotnetOnly &&
  !metadataOnly;

// Load the TypeScript project
const project = new Project({
  tsConfigFilePath: path.join(TYPES_DIR, 'tsconfig.json'),
});

validateEnumCompatibility(project);

if (generateAll || docsOnly) {
  console.log('Generating documentation markdown...');
  generateMarkdownDocs(project, DOCS_DIR);
  console.log(`  → docs written to ${path.relative(ROOT, DOCS_DIR)}/`);
}

if (generateAll || schemaOnly) {
  console.log('Generating JSON Schema...');
  generateJsonSchemas(project, SCHEMA_DIR);
  console.log(`  → schemas written to ${path.relative(ROOT, SCHEMA_DIR)}/`);

  // Copy schemas to docs/public for GitHub Pages serving
  fs.mkdirSync(SCHEMA_PUBLIC_DIR, { recursive: true });
  for (const file of fs.readdirSync(SCHEMA_DIR)) {
    fs.copyFileSync(path.join(SCHEMA_DIR, file), path.join(SCHEMA_PUBLIC_DIR, file));
  }
  console.log(`  → schemas copied to ${path.relative(ROOT, SCHEMA_PUBLIC_DIR)}/`);
}

if (generateAll || actionOriginOnly) {
  console.log('Generating action origin types...');
  generateActionOrigin(project, TYPES_DIR);
  console.log(`  → action-origin.generated.ts written to ${path.relative(ROOT, TYPES_DIR)}/`);
  generateWindowExempt(project, TYPES_DIR);
  console.log(`  → window-exempt.generated.ts written to ${path.relative(ROOT, TYPES_DIR)}/`);
}

if (generateAll || swiftOnly) {
  console.log('Generating Swift package...');
  generateSwiftPackage(project, SWIFT_DIR);
  console.log(`  → Swift package written to ${path.relative(ROOT, SWIFT_DIR)}/`);
}

if (generateAll || rustOnly) {
  console.log('Generating Rust crate...');
  generateRustCrate(project, RUST_DIR, { allowMissingFormatter });
  console.log(`  → Rust crate written to ${path.relative(ROOT, RUST_DIR)}/`);
}

if (generateAll || kotlinOnly) {
  console.log('Generating Kotlin package...');
  generateKotlinPackage(project, KOTLIN_DIR);
  console.log(`  → Kotlin package written to ${path.relative(ROOT, KOTLIN_DIR)}/`);
}

if (generateAll || typescriptOnly) {
  console.log('Generating TypeScript client sources...');
  generateTypeScriptClient(project, TYPES_DIR, TYPESCRIPT_TYPES_DIR);
  console.log(`  → TypeScript sources written to ${path.relative(ROOT, TYPESCRIPT_TYPES_DIR)}/`);
}

if (generateAll || goOnly) {
  console.log('Generating Go module...');
  generateGoModule(project, GO_DIR, { allowMissingFormatter });
  console.log(`  → Go module written to ${path.relative(ROOT, GO_DIR)}/`);
}

if (generateAll || dotnetOnly) {
  console.log('Generating .NET package...');
  generateCSharpPackage(project, DOTNET_DIR);
  console.log(`  → .NET sources written to ${path.relative(ROOT, DOTNET_DIR)}/`);
}

if (generateAll || metadataOnly) {
  console.log('Generating release metadata...');
  generateReleaseMetadata(project, ROOT);
  console.log('  → release-metadata.json written for every client');
}

console.log('Done.');
