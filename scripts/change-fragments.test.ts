import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';

import {
  applyReleaseToChangelog,
  changelogPathForTarget,
  parseChangeFragment,
  releaseIntroForTarget,
  renderChangeSections,
  type ChangeFragment,
} from './change-fragments.js';

describe('change fragments', () => {
  it('defaults targets to the spec and clients, not the independently released CLI', () => {
    const result = parseChangeFragment(
      'docs/.changes/example.json',
      JSON.stringify({ type: 'added', message: 'New protocol field.' }),
    );

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.fragment?.targets, ['spec', 'rust', 'kotlin', 'typescript', 'swift', 'go', 'dotnet']);
  });

  it('validates scoped targets and issue numbers', () => {
    const result = parseChangeFragment(
      'docs/.changes/bad.json',
      JSON.stringify({
        type: 'added',
        message: '- Includes a bullet',
        targets: ['typescript', 'typescript', 'python'],
        issues: [0, 12, 12],
      }),
    );

    assert.deepEqual(
      result.errors.map((error) => error.message),
      [
        '`message` must not include the leading Markdown bullet',
        'duplicate target typescript',
        'invalid target "python"; expected one of spec, rust, kotlin, typescript, swift, go, dotnet, cli',
        'invalid issue number 0; expected a positive integer',
        'duplicate issue number 12',
      ],
    );
  });

  it('supports CLI-only fragments and an independently versioned CLI changelog', () => {
    const result = parseChangeFragment(
      'docs/.changes/cli.json',
      JSON.stringify({ type: 'added', message: 'New CLI command.', targets: ['cli'] }),
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.fragment?.targets, ['cli']);
    assert.equal(changelogPathForTarget('cli', '.'), join('cli', 'CHANGELOG.md'));
    assert.equal(releaseIntroForTarget('cli', '0.1.0'), 'CLI version: `0.1.0`');
    assert.ok(result.fragment);
    const released = applyReleaseToChangelog(
      '# Changelog\n\n## [Unreleased]\n', 'cli', '0.1.0', '2026-10-08', [result.fragment],
    );
    assert.match(released, /## \[0\.1\.0\]/);
    assert.match(released, /CLI version: `0\.1\.0`/);
    assert.match(released, /- New CLI command\./);
    assert.doesNotMatch(released, /Implements AHP/);
  });

  it('renders only fragments targeting the requested artifact', () => {
    const fragments: ChangeFragment[] = [
      {
        filePath: 'docs/.changes/all.json',
        type: 'added',
        message: 'Shared entry.',
        targets: ['spec', 'rust', 'kotlin', 'typescript', 'swift', 'go', 'dotnet'],
        issues: [123],
      },
      {
        filePath: 'docs/.changes/rust.json',
        type: 'fixed',
        message: 'Rust-only fix.',
        targets: ['rust'],
        issues: [],
      },
    ];

    assert.deepEqual(renderChangeSections(fragments, 'rust'), [
      '### Added',
      '',
      '- Shared entry. (#123)',
      '',
      '### Fixed',
      '',
      '- Rust-only fix.',
    ]);
    assert.deepEqual(renderChangeSections(fragments, 'typescript'), [
      '### Added',
      '',
      '- Shared entry. (#123)',
    ]);
  });

  it('creates a dated release section after Unreleased', () => {
    const next = applyReleaseToChangelog(
      [
        '# Changelog',
        '',
        'Intro.',
        '',
        '## [Unreleased]',
        '',
        '## [0.5.2] — 2026-07-09',
        '',
        'Implements AHP 0.5.2.',
        '',
      ].join('\n'),
      'typescript',
      '0.6.0',
      '2026-07-10',
      [
        {
          filePath: 'docs/.changes/entry.json',
          type: 'changed',
          message: 'Updated client API.',
          targets: ['typescript'],
          issues: [],
        },
      ],
    );

    assert.equal(
      next,
      [
        '# Changelog',
        '',
        'Intro.',
        '',
        '## [Unreleased]',
        '',
        '## [0.6.0] — 2026-07-10',
        '',
        'Implements AHP 0.6.0.',
        '',
        '### Changed',
        '',
        '- Updated client API.',
        '',
        '## [0.5.2] — 2026-07-09',
        '',
        'Implements AHP 0.5.2.',
        '',
      ].join('\n'),
    );
  });

  it('replaces an existing version placeholder section', () => {
    const next = applyReleaseToChangelog(
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        'Holding text.',
        '',
        '## [0.6.0] — Unreleased',
        '',
        'Spec version: `0.6.0`',
        '',
        '## [0.5.2] — 2026-07-09',
        '',
      ].join('\n'),
      'spec',
      '0.6.0',
      '2026-07-10',
      [
        {
          filePath: 'docs/.changes/spec.json',
          type: 'added',
          message: 'Added a protocol feature.',
          targets: ['spec'],
          issues: [],
        },
      ],
    );

    assert.equal(
      next,
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        'Holding text.',
        '',
        '## [0.6.0] — 2026-07-10',
        '',
        'Spec version: `0.6.0`',
        '',
        '### Added',
        '',
        '- Added a protocol feature.',
        '',
        '## [0.5.2] — 2026-07-09',
        '',
      ].join('\n'),
    );
  });

  it('preserves an existing release section when no fragments are supplied', () => {
    const existing = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [0.6.0] — 2026-07-10',
      '',
      'Implements AHP 0.6.0.',
      '',
      '### Added',
      '',
      '- Existing release note.',
      '',
    ].join('\n');

    assert.equal(
      applyReleaseToChangelog(existing, 'typescript', '0.6.0', '2026-07-10', []),
      existing,
    );
  });
});
