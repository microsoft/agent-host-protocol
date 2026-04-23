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
import { generateSwiftPackage } from './generate-swift.js';
import { generateGoModule } from './generate-go.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TYPES_DIR = path.join(ROOT, 'types');
const DOCS_DIR = path.join(ROOT, 'docs', 'reference');
const SCHEMA_DIR = path.join(ROOT, 'schema');
const SCHEMA_PUBLIC_DIR = path.join(ROOT, 'docs', 'public', 'schema');
const SWIFT_DIR = path.join(ROOT, 'examples', 'swift', 'AgentHostProtocol');
const GO_DIR = path.join(ROOT, 'examples', 'go', 'ahp');

const args = process.argv.slice(2);
const docsOnly = args.includes('--docs');
const schemaOnly = args.includes('--schema');
const actionOriginOnly = args.includes('--action-origin');
const swiftOnly = args.includes('--swift');
const goOnly = args.includes('--go');
const generateAll = !docsOnly && !schemaOnly && !actionOriginOnly && !swiftOnly && !goOnly;

// Load the TypeScript project
const project = new Project({
  tsConfigFilePath: path.join(TYPES_DIR, 'tsconfig.json'),
});

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
}

if (generateAll || swiftOnly) {
  console.log('Generating Swift package...');
  generateSwiftPackage(project, SWIFT_DIR);
  console.log(`  → Swift package written to ${path.relative(ROOT, SWIFT_DIR)}/`);
}

if (generateAll || goOnly) {
  console.log('Generating Go module...');
  generateGoModule(project, GO_DIR);
  console.log(`  → Go module written to ${path.relative(ROOT, GO_DIR)}/`);
}

console.log('Done.');
