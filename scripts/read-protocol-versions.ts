/**
 * Shared helper for the protocol type generators: read the
 * `PROTOCOL_VERSION` string and the `SUPPORTED_PROTOCOL_VERSIONS` array
 * from `types/version/registry.ts` using ts-morph AST traversal so the
 * Rust/Kotlin/Swift generators don't each re-derive them from source
 * text.
 *
 * Returns plain strings for downstream code-emit. Throws if either
 * symbol is missing or has an unexpected shape so that a refactor of
 * `registry.ts` fails the generator loudly rather than silently
 * producing stale or empty output.
 */

import { Node, Project, SyntaxKind } from 'ts-morph';

/** Parsed values from `types/version/registry.ts`. */
export interface ProtocolVersions {
  /** Value of `PROTOCOL_VERSION` ("the version new code speaks"). */
  readonly current: string;
  /**
   * Every entry of `SUPPORTED_PROTOCOL_VERSIONS`, in source order
   * (most-preferred-first). Guaranteed non-empty.
   */
  readonly supported: readonly string[];
}

/**
 * Read the protocol version constants from `types/version/registry.ts`.
 * Throws if the registry source file is not present in `project`, or if
 * either constant is missing or has an unexpected shape. Released baselines
 * may differ from the development version. Callers building a partial project must include
 * `types/version/registry.ts` among the source files.
 */
export function readProtocolVersions(project: Project): ProtocolVersions {
  const sf = project
    .getSourceFiles()
    .find((f) => f.getFilePath().endsWith('/version/registry.ts'));
  if (!sf) {
    throw new Error(
      'readProtocolVersions: could not locate types/version/registry.ts in project',
    );
  }

  let current: string | undefined;
  let supported: string[] | undefined;

  for (const decl of sf.getVariableDeclarations()) {
    const name = decl.getName();
    if (name === 'PROTOCOL_VERSION') {
      current = stringLiteralValue(decl.getInitializer());
    } else if (name === 'SUPPORTED_PROTOCOL_VERSIONS') {
      supported = stringArrayValues(decl.getInitializer());
    }
  }

  if (!current) {
    throw new Error(
      'readProtocolVersions: PROTOCOL_VERSION missing or not a string literal',
    );
  }
  if (!supported || supported.length === 0) {
    throw new Error(
      'readProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS missing or empty',
    );
  }
  return { current, supported };
}

/** Extracts the literal string from a `'x'` / `"x"` initializer. */
function stringLiteralValue(init: Node | undefined): string | undefined {
  if (!init) return undefined;
  if (Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init)) {
    return init.getLiteralValue();
  }
  return undefined;
}

/**
 * Extracts string-literal elements from an array initializer, unwrapping
 * `Object.freeze([...])` and `[...] as const` shapes since both are
 * common ways to declare a readonly array in TypeScript.
 */
function stringArrayValues(init: Node | undefined): string[] | undefined {
  if (!init) return undefined;

  let arr: Node = init;

  // Object.freeze([...]) → unwrap to the array argument.
  if (Node.isCallExpression(arr)) {
    const callee = arr.getExpression().getText();
    if (callee === 'Object.freeze') {
      const [first] = arr.getArguments();
      if (first) arr = first;
    }
  }

  // `[...] as const` → unwrap to the inner expression.
  if (Node.isAsExpression(arr)) {
    arr = arr.getExpression();
  }

  if (!Node.isArrayLiteralExpression(arr)) return undefined;

  const values: string[] = [];
  for (const el of arr.getElements()) {
    if (
      el.getKind() === SyntaxKind.StringLiteral ||
      el.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      // Cast is safe: kind check above guarantees the literal-value method exists.
      values.push((el as unknown as { getLiteralValue(): string }).getLiteralValue());
    } else {
      return undefined;
    }
  }
  return values;
}
