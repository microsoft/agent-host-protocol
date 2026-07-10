import path from 'path';
import { fileURLToPath } from 'url';

import { formatFragmentErrors, readChangeFragments } from './change-fragments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function main(): void {
  const { fragments, errors } = readChangeFragments(ROOT);
  if (errors.length > 0) {
    console.error('❌ change-fragment verification failed:');
    console.error(formatFragmentErrors(errors, ROOT));
    process.exit(1);
  }

  console.log(`✅ change-fragment verification passed (${fragments.length} fragment(s))`);
}

main();
