import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  applyReleaseToChangelog,
  findUnlinkedIssueReferences,
  parseChangeFragment,
  renderChangeSections,
  REPO_ISSUES_URL,
  type ChangeFragment,
} from './change-fragments.js';

describe('change fragments', () => {
  it('defaults targets to every changelog artifact', () => {
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
        'invalid target "python"; expected one of spec, rust, kotlin, typescript, swift, go, dotnet',
        'invalid issue number 0; expected a positive integer',
        'duplicate issue number 12',
      ],
    );
  });

  it('renders only fragments targeting the requested artifact', () => {
    const fragments: ChangeFragment[] = [
      {
        filePath: 'docs/.changes/all.json',
        type: 'added',
        message: 'Shared entry.',
        details: [],
        targets: ['spec', 'rust', 'kotlin', 'typescript', 'swift', 'go', 'dotnet'],
        issues: [123],
      },
      {
        filePath: 'docs/.changes/rust.json',
        type: 'fixed',
        message: 'Rust-only fix.',
        details: [],
        targets: ['rust'],
        issues: [],
      },
    ];

    assert.deepEqual(renderChangeSections(fragments, 'rust'), [
      '### Added',
      '',
      `- Shared entry. ([#123](${REPO_ISSUES_URL}/123))`,
      '',
      '### Fixed',
      '',
      '- Rust-only fix.',
    ]);
    assert.deepEqual(renderChangeSections(fragments, 'typescript'), [
      '### Added',
      '',
      `- Shared entry. ([#123](${REPO_ISSUES_URL}/123))`,
    ]);
  });

  it('parses and indents multi-line details from arrays or strings', () => {
    const arrayResult = parseChangeFragment(
      'docs/.changes/rich.json',
      JSON.stringify({
        type: 'added',
        message: 'Add experimental flow-control with byte accounting and framed delivery.',
        details: [
          '```ts',
          'const sub = await client.subscribe({ resource, flowControl: { windowBytes: 65536 } });',
          '',
          '// comments with # inside code blocks are fine',
          '```',
          'Read more in [Windowed Delivery](https://microsoft.github.io/agent-host-protocol/specification/windowed-delivery).',
        ],
        issues: [492],
      }),
    );

    assert.deepEqual(arrayResult.errors, []);
    assert.ok(arrayResult.fragment);
    assert.deepEqual(renderChangeSections([arrayResult.fragment], 'spec'), [
      '### Added',
      '',
      `- Add experimental flow-control with byte accounting and framed delivery. ([#492](${REPO_ISSUES_URL}/492))`,
      '  ```ts',
      '  const sub = await client.subscribe({ resource, flowControl: { windowBytes: 65536 } });',
      '',
      '  // comments with # inside code blocks are fine',
      '  ```',
      '  Read more in [Windowed Delivery](https://microsoft.github.io/agent-host-protocol/specification/windowed-delivery).',
    ]);

    const stringResult = parseChangeFragment(
      'docs/.changes/string-details.json',
      JSON.stringify({
        type: 'added',
        message: 'Add a simple option.',
        details: 'Read more in [Lifecycle](https://microsoft.github.io/agent-host-protocol/specification/lifecycle).',
      }),
    );

    assert.deepEqual(stringResult.errors, []);
    assert.deepEqual(stringResult.fragment?.details, [
      'Read more in [Lifecycle](https://microsoft.github.io/agent-host-protocol/specification/lifecycle).',
    ]);
  });

  it('rejects malformed details', () => {
    const unclosedFence = parseChangeFragment(
      'docs/.changes/unclosed.json',
      JSON.stringify({
        type: 'added',
        message: 'Broken fence.',
        details: ['```ts', 'const x = 1;'],
      }),
    );
    assert.deepEqual(
      unclosedFence.errors.map((error) => error.message),
      ['`details` has an unclosed fenced code block'],
    );

    const headingOutsideFence = parseChangeFragment(
      'docs/.changes/heading.json',
      JSON.stringify({
        type: 'added',
        message: 'Contains heading.',
        details: ['## Not allowed'],
      }),
    );
    assert.deepEqual(
      headingOutsideFence.errors.map((error) => error.message),
      ['`details` must not contain Markdown headings outside fenced code blocks'],
    );

    const blankEdge = parseChangeFragment(
      'docs/.changes/blank.json',
      JSON.stringify({
        type: 'added',
        message: 'Leading blank.',
        details: ['', 'Body'],
      }),
    );
    assert.deepEqual(
      blankEdge.errors.map((error) => error.message),
      ['`details` must not have leading or trailing blank lines'],
    );

    const multilineItem = parseChangeFragment(
      'docs/.changes/newline-entry.json',
      JSON.stringify({
        type: 'added',
        message: 'Newline in array entry.',
        details: ['line 1\nline 2'],
      }),
    );
    assert.deepEqual(
      multilineItem.errors.map((error) => error.message),
      ['`details` array entries must each be a single line'],
    );
  });

  it('rejects unlinked #123 references while allowing linked issues and code blocks', () => {
    const unlinkedMessage = parseChangeFragment(
      'docs/.changes/unlinked-message.json',
      JSON.stringify({
        type: 'fixed',
        message: 'Fix crash (#123).',
      }),
    );
    assert.deepEqual(
      unlinkedMessage.errors.map((error) => error.message),
      [
        `\`message\` contains unlinked issue/PR reference #123; put it in \`issues\` or link it as [#123](${REPO_ISSUES_URL}/123)`,
      ],
    );

    const linkedAndCode = parseChangeFragment(
      'docs/.changes/linked.json',
      JSON.stringify({
        type: 'fixed',
        message: `Fix issue discussed in [#123](${REPO_ISSUES_URL}/123) and handle \`#456\`.`,
        details: [
          '```ts',
          '// #789 inside a fenced code block is ignored',
          '```',
          `See also [PR #99](${REPO_ISSUES_URL}/99).`,
        ],
      }),
    );
    assert.deepEqual(linkedAndCode.errors, []);

    assert.deepEqual(
      findUnlinkedIssueReferences([
        `- Linked ([#12](${REPO_ISSUES_URL}/12)) and unlinked (#34, #56).`,
        '```',
        '// #78 ignored',
        '```',
        'Inline `#90` ignored, URL https://example.com/a#11 ignored.',
      ]),
      [
        { line: 1, reference: '#34' },
        { line: 1, reference: '#56' },
      ],
    );
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
          details: [],
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
          details: [],
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
