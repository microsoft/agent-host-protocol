/**
 * Kotlin Package Generator — Generates the Kotlin sources of the
 * `agent-host-protocol` library from TypeScript type definitions parsed via
 * ts-morph.
 *
 * Outputs (under clients/kotlin/):
 *   - src/main/kotlin/com/microsoft/agenthostprotocol/generated/*.generated.kt   (always overwritten)
 *
 * Hand-maintained files (only created if missing — see `gradle-scaffold` files):
 *   - src/main/kotlin/com/microsoft/agenthostprotocol/Ahp.kt   (configured Json instance)
 *
 * Notes on type mapping:
 *   - `number` → `Long`. TS numbers are 64-bit ints in this protocol.
 *     Properties annotated with `@format float` are emitted as `Double` instead.
 *   - `unknown` / `object` → `kotlinx.serialization.json.JsonElement` (boxes any JSON).
 *   - Discriminated unions → sealed interfaces with custom `KSerializer`s that
 *     mirror the Swift generator. We intentionally do NOT use kotlinx's
 *     `@JsonClassDiscriminator`, because that mode forbids the discriminator
 *     field from existing on the variant data class — but our TS variant
 *     interfaces include it (e.g. `MarkdownResponsePart.kind = 'markdown'`).
 *   - Bitset enums (JSDoc starts with "Bitset") → `@JvmInline value class`
 *     wrapping `Int`, with companion-object flag constants and bitwise ops,
 *     so unknown future bits decode/encode losslessly.
 *   - Recursive structs → plain data classes (Kotlin classes are heap-
 *     allocated by default, so self-reference Just Works).
 */

import {
  Project,
  InterfaceDeclaration,
  EnumDeclaration,
  PropertySignature,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { findProtocolSourceFiles } from './find-protocol-sources.js';
import { readProtocolVersions } from './read-protocol-versions.js';

const GENERATED_HEADER =
  '// Generated from types/*.ts — do not edit\n\n' +
  'package com.microsoft.agenthostprotocol.generated\n\n' +
  'import kotlinx.serialization.KSerializer\n' +
  'import kotlinx.serialization.SerialName\n' +
  'import kotlinx.serialization.Serializable\n' +
  'import kotlinx.serialization.descriptors.PrimitiveKind\n' +
  'import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor\n' +
  'import kotlinx.serialization.descriptors.SerialDescriptor\n' +
  'import kotlinx.serialization.descriptors.buildClassSerialDescriptor\n' +
  'import kotlinx.serialization.encoding.Decoder\n' +
  'import kotlinx.serialization.encoding.Encoder\n' +
  'import kotlinx.serialization.json.JsonDecoder\n' +
  'import kotlinx.serialization.json.JsonElement\n' +
  'import kotlinx.serialization.json.JsonEncoder\n' +
  'import kotlinx.serialization.json.JsonObject\n' +
  'import kotlinx.serialization.json.JsonPrimitive\n' +
  'import kotlinx.serialization.json.buildJsonObject\n' +
  'import kotlinx.serialization.json.contentOrNull\n';

const PACKAGE = 'com.microsoft.agenthostprotocol.generated';

// ─── Identifier helpers ──────────────────────────────────────────────────────

/** PascalCase → camelCase */
function toCamelCase(name: string): string {
  return name[0].toLowerCase() + name.slice(1);
}

/** PascalCase → SCREAMING_SNAKE_CASE for enum constants. */
function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
}

/** Snake_case → camelCase (for RFC 9728 properties). */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Kotlin reserved/soft-keywords. `type`, `value`, etc. that clash with
 * common JSON field names get backticked with `name`.
 */
const KOTLIN_RESERVED_KEYWORDS = new Set([
  // Hard keywords
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun',
  'if', 'in', 'interface', 'is', 'null', 'object', 'package', 'return',
  'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val',
  'var', 'when', 'while',
]);

function kotlinIdentifier(name: string): string {
  return KOTLIN_RESERVED_KEYWORDS.has(name) ? `\`${name}\`` : name;
}

// ─── Type Mapping ────────────────────────────────────────────────────────────

/**
 * Synthetic Kotlin data classes required for `Partial<T>` references encountered
 * during type mapping. Kotlin has no structural `Partial`, so we emit a sibling
 * data class with every property forced nullable. Populated by `mapType`,
 * consumed by the file generators that reference them.
 */
const requiredPartialStructs = new Set<string>();

/** Kotlin name for `Partial<SessionSummary>` → `PartialSessionSummary`. */
function partialKotlinName(tsInterfaceName: string): string {
  return `Partial${tsInterfaceName}`;
}

/** Map a TypeScript type string to a Kotlin type string. */
function mapType(tsType: string): string {
  tsType = tsType.replace(/import\([^)]+\)\./g, '').trim();

  // Remove outer parens
  while (tsType.startsWith('(') && tsType.endsWith(')')) {
    tsType = tsType.slice(1, -1).trim();
  }

  // Primitives
  if (tsType === 'string') return 'String';
  // TS numbers are 64-bit ints in this protocol unless marked `@format float`.
  // `@format float` is applied later by `extractProps`, which overrides the
  // `Long` to `Double` based on the JSDoc annotation on the property.
  if (tsType === 'number') return 'Long';
  if (tsType === 'boolean') return 'Boolean';
  if (tsType === 'unknown') return 'JsonElement';
  if (tsType === 'object') return 'JsonElement';
  if (tsType === 'true' || tsType === 'false') return 'Boolean';

  // Type aliases
  if (tsType === 'URI') return 'String';
  if (tsType === 'StringOrMarkdown') return 'StringOrMarkdown';
  // ChildCustomizationType is a TS-only subset alias of CustomizationType.
  if (tsType === 'ChildCustomizationType') return 'CustomizationType';

  // Known unions
  if (
    tsType === 'RootState | SessionState' ||
    tsType === 'RootState | SessionState | TerminalState' ||
    tsType === 'RootState | SessionState | TerminalState | ChangesetState' ||
    tsType === 'RootState | SessionState | TerminalState | ChangesetState | AnnotationsState' ||
    tsType === 'RootState | SessionState | TerminalState | ChangesetState | ResourceWatchState | AnnotationsState' ||
    tsType === 'RootState | SessionState | ChatState' ||
    tsType === 'RootState | SessionState | ChatState | TerminalState' ||
    tsType === 'RootState | SessionState | ChatState | TerminalState | ChangesetState' ||
    tsType === 'RootState | SessionState | ChatState | TerminalState | ChangesetState | AnnotationsState'
  ) {
    return 'SnapshotState';
  }

  // T | null → T?
  const nullMatch = tsType.match(/^(.+?)\s*\|\s*null$/);
  if (nullMatch) {
    const inner = mapType(nullMatch[1]);
    return inner.endsWith('?') ? inner : inner + '?';
  }

  // T | undefined → T (optionality from ?)
  const undefMatch = tsType.match(/^(.+?)\s*\|\s*undefined$/);
  if (undefMatch) return mapType(undefMatch[1]);

  // Array: T[]
  const arrayMatch = tsType.match(/^(.+)\[\]$/);
  if (arrayMatch) return `List<${mapType(arrayMatch[1])}>`;

  // Array<T>
  const arrayGenericMatch = tsType.match(/^Array<(.+)>$/);
  if (arrayGenericMatch) return `List<${mapType(arrayGenericMatch[1])}>`;

  // Record<string, T>
  const recordMatch = tsType.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) {
    const inner = recordMatch[1].trim();
    // `Record<string, never>` is the MCP-style marker for "empty object";
    // treat it like `Record<string, unknown>` so the wire `{}` round-trips.
    if (inner === 'never') return 'Map<String, JsonElement>';
    return `Map<String, ${mapType(inner)}>`;
  }

  // Partial<T>
  const partialMatch = tsType.match(/^Partial<(\w+)>$/);
  if (partialMatch) {
    requiredPartialStructs.add(partialMatch[1]);
    return partialKotlinName(partialMatch[1]);
  }

  // Enum member union: EnumName.A | EnumName.B | ...
  const enumUnionMatch = tsType.match(/^(\w+)\.\w+(\s*\|\s*\1\.\w+)*$/);
  if (enumUnionMatch) return enumUnionMatch[1];

  // Single enum member: EnumName.Value
  const enumMemberMatch = tsType.match(/^(\w+)\.(\w+)$/);
  if (enumMemberMatch) return enumMemberMatch[1];

  // String literal: 'value'
  if (tsType.startsWith("'") && tsType.endsWith("'")) return 'String';

  // String literal union: 'a' | 'b' | ...
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(tsType)) return 'String';

  // Inline object type → JsonElement fallback
  if (tsType.startsWith('{')) return 'JsonElement';

  // Named type
  return tsType;
}

// ─── Property Extraction ─────────────────────────────────────────────────────

interface KotlinProp {
  name: string;       // Kotlin property name
  wireName: string;   // JSON key
  type: string;       // Kotlin type
  optional: boolean;  // emit `= null` default
  doc: string;
}

function getPropertyType(prop: PropertySignature): string {
  const typeNode = prop.getTypeNode();
  if (typeNode) return typeNode.getText();
  return prop.getType().getText(prop);
}

function getPropertyDoc(prop: PropertySignature): string {
  const jsDocs = prop.getJsDocs();
  if (jsDocs.length === 0) return '';
  return jsDocs[0].getDescription().trim();
}

/** Returns true if the property has a `@format float` JSDoc tag. */
function hasFormatFloat(prop: PropertySignature): boolean {
  for (const doc of prop.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === 'format' && tag.getCommentText()?.trim() === 'float') {
        return true;
      }
    }
  }
  return false;
}

/** Recursively collect all properties from an interface, flattening extends. */
function getAllProperties(iface: InterfaceDeclaration, project: Project): PropertySignature[] {
  const props: PropertySignature[] = [];
  for (const ext of iface.getExtends()) {
    const baseName = ext.getExpression().getText();
    const baseIface = findInterface(project, baseName);
    if (baseIface) {
      props.push(...getAllProperties(baseIface, project));
    }
  }
  props.push(...iface.getProperties());
  return props;
}

function findInterface(project: Project, name: string): InterfaceDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const iface = sf.getInterface(name);
    if (iface) return iface;
  }
  return undefined;
}

function findEnum(project: Project, name: string): EnumDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const e = sf.getEnum(name);
    if (e) return e;
  }
  return undefined;
}

/** Convert _meta → meta, otherwise keep as-is */
function kotlinPropName(tsPropName: string): string {
  if (tsPropName.startsWith('_')) return tsPropName.substring(1);
  return tsPropName;
}

/** Extract Kotlin properties from a TypeScript interface */
function extractProps(iface: InterfaceDeclaration, project: Project): KotlinProp[] {
  const allProps = getAllProperties(iface, project);
  const seen = new Set<string>();

  return allProps
    .filter(p => {
      const name = p.getName();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map(p => {
      const tsName = p.getName();
      const tsType = getPropertyType(p);
      let kt = mapType(tsType);
      // `@format float` overrides the default Long → Double for number properties.
      if (kt === 'Long' && hasFormatFloat(p)) {
        kt = 'Double';
      }
      const hasUnionUndefined = /\|\s*undefined/.test(tsType);
      const isOptional = p.hasQuestionToken() || hasUnionUndefined || kt.endsWith('?');
      const finalType = isOptional && !kt.endsWith('?') ? kt + '?' : kt;
      const kName = tsName.startsWith('_')
        ? kotlinPropName(tsName)
        : tsName.includes('_')
          ? snakeToCamel(tsName)
          : tsName;

      return {
        name: kotlinIdentifier(kName),
        wireName: tsName,
        type: finalType,
        optional: isOptional,
        doc: getPropertyDoc(p),
      };
    });
}

// ─── Doc emission ────────────────────────────────────────────────────────────

function emitKDoc(doc: string, indent = ''): string[] {
  if (!doc) return [];
  const lines = doc.split('\n');
  const out: string[] = [`${indent}/**`];
  for (const line of lines) {
    // Kotlin's tokenizer treats `/*` and `*/` as block-comment delimiters even
    // inside KDoc backtick spans, so `\`tools/*\`` would open a nested
    // comment that never closes. Insert a zero-width space (U+200B) to break
    // the token without changing the rendered output.
    const safe = line.trim().replace(/\/\*/g, '/\u200B*').replace(/\*\//g, '*\u200B/');
    out.push(safe ? `${indent} * ${safe}` : `${indent} *`);
  }
  out.push(`${indent} */`);
  return out;
}

// ─── Kotlin Enum Generation ──────────────────────────────────────────────────

function generateKotlinEnum(enumDecl: EnumDeclaration): string {
  const name = enumDecl.getName();
  const lines: string[] = [];
  const desc = enumDecl.getJsDocs()[0]?.getDescription().trim();
  const values = enumDecl.getMembers().map(m => m.getValue());
  const isNumeric = values.every(v => typeof v === 'number');

  // Bitset enums (JSDoc convention "Bitset of …") → `value class` so OR'd
  // combinations with unknown bits decode/encode losslessly.
  const isBitset = isNumeric && desc !== undefined && /^bitset\b/i.test(desc);

  if (desc) {
    lines.push(...emitKDoc(desc));
  }

  if (isBitset) {
    lines.push(`@Serializable(with = ${name}Serializer::class)`);
    lines.push('@JvmInline');
    lines.push(`value class ${name}(val rawValue: Int) {`);
    lines.push(`    operator fun contains(other: ${name}): Boolean =`);
    lines.push('        (rawValue and other.rawValue) == other.rawValue');
    lines.push('');
    lines.push(`    infix fun or(other: ${name}): ${name} = ${name}(rawValue or other.rawValue)`);
    lines.push(`    infix fun and(other: ${name}): ${name} = ${name}(rawValue and other.rawValue)`);
    lines.push('');
    lines.push('    companion object {');
    for (const member of enumDecl.getMembers()) {
      const memberName = toScreamingSnake(member.getName());
      const value = member.getValue();
      const memberDoc = member.getJsDocs()[0]?.getDescription().trim();
      if (memberDoc) {
        lines.push(...emitKDoc(memberDoc, '        '));
      }
      lines.push(`        val ${memberName}: ${name} = ${name}(${value})`);
    }
    lines.push('    }');
    lines.push('}');
    lines.push('');
    // Companion serializer. Bitset wire format is the raw int.
    lines.push(`internal object ${name}Serializer : KSerializer<${name}> {`);
    lines.push(`    override val descriptor: SerialDescriptor =`);
    lines.push(`        PrimitiveSerialDescriptor("${name}", PrimitiveKind.INT)`);
    lines.push(`    override fun serialize(encoder: Encoder, value: ${name}) {`);
    lines.push('        encoder.encodeInt(value.rawValue)');
    lines.push('    }');
    lines.push(`    override fun deserialize(decoder: Decoder): ${name} =`);
    lines.push(`        ${name}(decoder.decodeInt())`);
    lines.push('}');
    return lines.join('\n');
  }

  lines.push('@Serializable');
  lines.push(`enum class ${name} {`);

  const members = enumDecl.getMembers();
  members.forEach((member, idx) => {
    const memberName = toScreamingSnake(member.getName());
    const value = member.getValue();
    const memberDoc = member.getJsDocs()[0]?.getDescription().trim();
    if (memberDoc) {
      lines.push(...emitKDoc(memberDoc, '    '));
    }
    lines.push(`    @SerialName(${JSON.stringify(String(value))})`);
    const trailing = idx === members.length - 1 ? '' : ',';
    lines.push(`    ${memberName}${trailing}`);
  });

  lines.push('}');
  return lines.join('\n');
}

// ─── Kotlin Data Class Generation ────────────────────────────────────────────

function generateKotlinDataClass(
  ktName: string,
  props: KotlinProp[],
): string {
  const lines: string[] = [];

  lines.push('@Serializable');

  if (props.length === 0) {
    lines.push(`class ${ktName}`);
    return lines.join('\n');
  }

  lines.push(`data class ${ktName}(`);

  props.forEach((p, idx) => {
    if (p.doc) {
      lines.push(...emitKDoc(p.doc, '    '));
    }
    if (p.name !== p.wireName) {
      lines.push(`    @SerialName(${JSON.stringify(p.wireName)})`);
    }
    const defaultVal = p.optional ? ' = null' : '';
    const trailing = idx === props.length - 1 ? '' : ',';
    lines.push(`    val ${p.name}: ${p.type}${defaultVal}${trailing}`);
  });

  lines.push(')');
  return lines.join('\n');
}

// ─── Discriminated Union Generation ──────────────────────────────────────────

interface UnionVariant {
  caseName: string;     // sealed-interface implementor name (PascalCase)
  structName: string;   // data class to wrap
  discriminantValue: string;
}

interface UnionConfig {
  name: string;
  discriminantField: string;
  variants: UnionVariant[];
  /**
   * Forward-compat catch-all. When `true`, the generator emits an extra
   * `${name}Unknown(val raw: JsonObject)` value class and routes any unknown
   * discriminator into it (rather than throwing). The raw `JsonObject` is
   * captured at decode time and re-emitted unchanged on serialize so unknown
   * future variants round-trip through this client without losing fields.
   *
   * Mirrors the `unknown: true` flag on `scripts/generate-rust.ts`'s
   * `UnionConfig`, which emits a parallel `Unknown(serde_json::Value)` variant
   * on the same set of state-channel unions.
   */
  unknown?: boolean;
}

/**
 * Emit a discriminated union with a custom serializer that matches the Swift
 * generator: each variant data class wraps the corresponding TS interface
 * and is responsible for its own discriminator field on the wire.
 *
 * Multiple discriminant wire values may map to the same `structName` (e.g.
 * `ChatInputQuestion` accepts both "number" and "integer" → the same
 * `ChatInputNumberQuestion` data class). We deduplicate variants by
 * `structName` for the sealed-interface declaration but preserve every entry
 * in the deserializer switch.
 */
function generateDiscriminatedUnion(config: UnionConfig): string {
  const lines: string[] = [];

  lines.push(`@Serializable(with = ${config.name}Serializer::class)`);
  lines.push(`sealed interface ${config.name}`);
  lines.push('');

  // Deduplicate by structName for the wrapper variants — multiple discriminant
  // values may share a single underlying data class.
  const byStruct = new Map<string, UnionVariant>();
  for (const v of config.variants) {
    if (!byStruct.has(v.structName)) byStruct.set(v.structName, v);
  }

  for (const v of byStruct.values()) {
    lines.push(`@JvmInline`);
    lines.push(`value class ${config.name}${v.caseName}(val value: ${v.structName}) : ${config.name}`);
  }
  if (config.unknown) {
    lines.push(`/**`);
    lines.push(` * Forward-compat catch-all for unknown ${config.name} discriminators.`);
    lines.push(' *');
    lines.push(' * Older clients may receive newer wire variants they don\'t recognise; capturing');
    lines.push(' * the raw `JsonObject` lets such payloads round-trip through the client unchanged.');
    lines.push(' * Reducers handle this variant conservatively on a per-union basis (typically');
    lines.push(' * as a no-op, but see `Reducers.kt` for the exact treatment).');
    lines.push(' */');
    lines.push(`@JvmInline`);
    lines.push(`value class ${config.name}Unknown(val raw: JsonObject) : ${config.name}`);
  }
  lines.push('');

  // Custom KSerializer
  lines.push(`internal object ${config.name}Serializer : KSerializer<${config.name}> {`);
  lines.push(`    override val descriptor: SerialDescriptor =`);
  lines.push(`        buildClassSerialDescriptor("${config.name}")`);
  lines.push('');
  lines.push(`    override fun deserialize(decoder: Decoder): ${config.name} {`);
  lines.push('        val input = decoder as? JsonDecoder');
  lines.push(`            ?: error("${config.name} can only be deserialized from JSON")`);
  lines.push('        val element = input.decodeJsonElement()');
  lines.push('        val obj = element as? JsonObject');
  lines.push(`            ?: error("Expected JsonObject for ${config.name}")`);
  lines.push(`        val discriminant = (obj[${JSON.stringify(config.discriminantField)}] as? JsonPrimitive)?.content`);
  if (config.unknown) {
    lines.push(`            ?: return ${config.name}Unknown(obj)`);
  } else {
    lines.push(`            ?: error("Missing ${config.discriminantField} discriminator on ${config.name}")`);
  }
  lines.push('        return when (discriminant) {');
  for (const v of config.variants) {
    const variantClass = `${config.name}${(byStruct.get(v.structName) ?? v).caseName}`;
    lines.push(`            ${JSON.stringify(v.discriminantValue)} -> ${variantClass}(input.json.decodeFromJsonElement(${v.structName}.serializer(), element))`);
  }
  if (config.unknown) {
    lines.push(`            else -> ${config.name}Unknown(obj)`);
  } else {
    lines.push(`            else -> error("Unknown ${config.name} discriminator: $discriminant")`);
  }
  lines.push('        }');
  lines.push('    }');
  lines.push('');
  lines.push(`    override fun serialize(encoder: Encoder, value: ${config.name}) {`);
  lines.push('        val output = encoder as? JsonEncoder');
  lines.push(`            ?: error("${config.name} can only be serialized to JSON")`);
  lines.push('        val element: JsonElement = when (value) {');
  for (const v of byStruct.values()) {
    const variantClass = `${config.name}${v.caseName}`;
    lines.push(`            is ${variantClass} -> output.json.encodeToJsonElement(${v.structName}.serializer(), value.value)`);
  }
  if (config.unknown) {
    lines.push(`            is ${config.name}Unknown -> value.raw`);
  }
  lines.push('        }');
  lines.push('        output.encodeJsonElement(element)');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

// ─── Interface → Kotlin data class (auto from project) ───────────────────────

function generateDataClassFromInterface(
  project: Project,
  tsInterfaceName: string,
  ktNameOverride?: string,
): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const name = ktNameOverride ?? tsInterfaceName;
  const props = extractProps(iface, project);
  return generateKotlinDataClass(name, props);
}

/**
 * Emit a Kotlin counterpart for `Partial<T>`: same properties as `T` but with
 * every field forced nullable. The synthetic data class is referenced by
 * `mapType` via `partialKotlinName`.
 */
function generatePartialDataClassFromInterface(
  project: Project,
  tsInterfaceName: string,
): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const props = extractProps(iface, project).map(p => ({
    ...p,
    optional: true,
    type: p.type.endsWith('?') ? p.type : `${p.type}?`,
  }));
  return generateKotlinDataClass(partialKotlinName(tsInterfaceName), props);
}

// ─── Hand-written types ──────────────────────────────────────────────────────

function generateStringOrMarkdown(): string {
  return `/**
 * A value that is either a plain string or a markdown-formatted string.
 */
@Serializable(with = StringOrMarkdownSerializer::class)
sealed interface StringOrMarkdown {
    @JvmInline value class Plain(val value: String) : StringOrMarkdown
    @JvmInline value class Markdown(val value: String) : StringOrMarkdown
}

internal object StringOrMarkdownSerializer : KSerializer<StringOrMarkdown> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("StringOrMarkdown")

    override fun deserialize(decoder: Decoder): StringOrMarkdown {
        val input = decoder as? JsonDecoder
            ?: error("StringOrMarkdown can only be deserialized from JSON")
        return when (val element = input.decodeJsonElement()) {
            is JsonPrimitive -> {
                val str = element.contentOrNull
                    ?: error("Expected string primitive for StringOrMarkdown")
                StringOrMarkdown.Plain(str)
            }
            is JsonObject -> {
                val markdown = (element["markdown"] as? JsonPrimitive)?.contentOrNull
                    ?: error("StringOrMarkdown object form requires \\\"markdown\\\" string")
                StringOrMarkdown.Markdown(markdown)
            }
            else -> error("StringOrMarkdown must be a string or { markdown: string } object")
        }
    }

    override fun serialize(encoder: Encoder, value: StringOrMarkdown) {
        val output = encoder as? JsonEncoder
            ?: error("StringOrMarkdown can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is StringOrMarkdown.Plain -> JsonPrimitive(value.value)
            is StringOrMarkdown.Markdown -> buildJsonObject {
                put("markdown", JsonPrimitive(value.value))
            }
        }
        output.encodeJsonElement(element)
    }
}`;
}

function generateSnapshotState(): string {
  return `/**
 * The state payload of a snapshot — root, session, chat, terminal, changeset,
 * resource-watch, or annotations state.
 */
@Serializable(with = SnapshotStateSerializer::class)
sealed interface SnapshotState {
    @JvmInline value class Root(val value: RootState) : SnapshotState
    @JvmInline value class Session(val value: SessionState) : SnapshotState
    @JvmInline value class Chat(val value: ChatState) : SnapshotState
    @JvmInline value class Terminal(val value: TerminalState) : SnapshotState
    @JvmInline value class Changeset(val value: ChangesetState) : SnapshotState
    @JvmInline value class ResourceWatch(val value: ResourceWatchState) : SnapshotState
    @JvmInline value class Annotations(val value: AnnotationsState) : SnapshotState
}

internal object SnapshotStateSerializer : KSerializer<SnapshotState> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("SnapshotState")

    override fun deserialize(decoder: Decoder): SnapshotState {
        val input = decoder as? JsonDecoder
            ?: error("SnapshotState can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for SnapshotState")
        // Try the most distinctive shape first. SessionState has required
        // \`summary\`; ChangesetState has required \`status\` + \`files\`;
        // ResourceWatchState has required \`root\` + \`recursive\`;
        // AnnotationsState has required \`annotations\`; TerminalState has \`uri\`
        // / \`size\` / \`buffer\`; RootState is the catch-all.
        return when {
            obj.containsKey("summary") -> SnapshotState.Session(input.json.decodeFromJsonElement(SessionState.serializer(), element))
            obj.containsKey("status") && obj.containsKey("files") ->
                SnapshotState.Changeset(input.json.decodeFromJsonElement(ChangesetState.serializer(), element))
            obj.containsKey("root") && obj.containsKey("recursive") ->
                SnapshotState.ResourceWatch(input.json.decodeFromJsonElement(ResourceWatchState.serializer(), element))
            obj.containsKey("annotations") ->
                SnapshotState.Annotations(input.json.decodeFromJsonElement(AnnotationsState.serializer(), element))
            obj.containsKey("size") || obj.containsKey("uri") || obj.containsKey("buffer") ->
                SnapshotState.Terminal(input.json.decodeFromJsonElement(TerminalState.serializer(), element))
            else -> SnapshotState.Root(input.json.decodeFromJsonElement(RootState.serializer(), element))
        }
    }

    override fun serialize(encoder: Encoder, value: SnapshotState) {
        val output = encoder as? JsonEncoder
            ?: error("SnapshotState can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is SnapshotState.Root -> output.json.encodeToJsonElement(RootState.serializer(), value.value)
            is SnapshotState.Session -> output.json.encodeToJsonElement(SessionState.serializer(), value.value)
            is SnapshotState.Chat -> output.json.encodeToJsonElement(ChatState.serializer(), value.value)
            is SnapshotState.Terminal -> output.json.encodeToJsonElement(TerminalState.serializer(), value.value)
            is SnapshotState.Changeset -> output.json.encodeToJsonElement(ChangesetState.serializer(), value.value)
            is SnapshotState.ResourceWatch -> output.json.encodeToJsonElement(ResourceWatchState.serializer(), value.value)
            is SnapshotState.Annotations -> output.json.encodeToJsonElement(AnnotationsState.serializer(), value.value)
        }
        output.encodeJsonElement(element)
    }
}`;
}

function generateToolResultContentUnion(): string {
  return `@Serializable(with = ToolResultContentSerializer::class)
sealed interface ToolResultContent {
    @JvmInline value class Text(val value: ToolResultTextContent) : ToolResultContent
    @JvmInline value class EmbeddedResource(val value: ToolResultEmbeddedResourceContent) : ToolResultContent
    @JvmInline value class Resource(val value: ToolResultResourceContent) : ToolResultContent
    @JvmInline value class FileEdit(val value: ToolResultFileEditContent) : ToolResultContent
    @JvmInline value class Terminal(val value: ToolResultTerminalContent) : ToolResultContent
    @JvmInline value class Subagent(val value: ToolResultSubagentContent) : ToolResultContent

    /**
     * Forward-compat catch-all for unknown ToolResultContent types.
     *
     * Older clients may receive newer wire variants they don't recognise; capturing
     * the raw \`JsonObject\` lets such payloads round-trip through the client unchanged.
     */
    @JvmInline value class Unknown(val raw: JsonObject) : ToolResultContent
}

internal object ToolResultContentSerializer : KSerializer<ToolResultContent> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ToolResultContent")

    override fun deserialize(decoder: Decoder): ToolResultContent {
        val input = decoder as? JsonDecoder
            ?: error("ToolResultContent can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ToolResultContent")
        val type = (obj["type"] as? JsonPrimitive)?.contentOrNull
            ?: return ToolResultContent.Unknown(obj)
        return when (type) {
            "text" -> ToolResultContent.Text(input.json.decodeFromJsonElement(ToolResultTextContent.serializer(), element))
            "embeddedResource" -> ToolResultContent.EmbeddedResource(input.json.decodeFromJsonElement(ToolResultEmbeddedResourceContent.serializer(), element))
            "resource" -> ToolResultContent.Resource(input.json.decodeFromJsonElement(ToolResultResourceContent.serializer(), element))
            "fileEdit" -> ToolResultContent.FileEdit(input.json.decodeFromJsonElement(ToolResultFileEditContent.serializer(), element))
            "terminal" -> ToolResultContent.Terminal(input.json.decodeFromJsonElement(ToolResultTerminalContent.serializer(), element))
            "subagent" -> ToolResultContent.Subagent(input.json.decodeFromJsonElement(ToolResultSubagentContent.serializer(), element))
            else -> ToolResultContent.Unknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ToolResultContent) {
        val output = encoder as? JsonEncoder
            ?: error("ToolResultContent can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ToolResultContent.Text -> output.json.encodeToJsonElement(ToolResultTextContent.serializer(), value.value)
            is ToolResultContent.EmbeddedResource -> output.json.encodeToJsonElement(ToolResultEmbeddedResourceContent.serializer(), value.value)
            is ToolResultContent.Resource -> output.json.encodeToJsonElement(ToolResultResourceContent.serializer(), value.value)
            is ToolResultContent.FileEdit -> output.json.encodeToJsonElement(ToolResultFileEditContent.serializer(), value.value)
            is ToolResultContent.Terminal -> output.json.encodeToJsonElement(ToolResultTerminalContent.serializer(), value.value)
            is ToolResultContent.Subagent -> output.json.encodeToJsonElement(ToolResultSubagentContent.serializer(), value.value)
            is ToolResultContent.Unknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}`;
}

// ─── State File Generator ────────────────────────────────────────────────────

const STATE_ENUMS = [
  'PolicyState', 'PendingMessageKind', 'SessionLifecycle', 'SessionStatus',
  'ChatOriginKind', 'ChatInputAnswerState', 'ChatInputAnswerValueKind', 'ChatInputQuestionKind',
  'ChatInputResponseKind',
  'TurnState', 'MessageKind', 'MessageAttachmentKind', 'ResponsePartKind', 'ToolCallStatus',
  'ToolCallConfirmationReason', 'ToolCallCancellationReason', 'ConfirmationOptionKind',
  'ToolCallContributorKind',
  'ToolResultContentType', 'CustomizationType', 'CustomizationLoadStatus', 'TerminalClaimKind',
  'McpServerStatus', 'McpAuthRequiredReason',
  'ChangesetStatus', 'ChangesetOperationStatus', 'ChangesetOperationScope', 'ResourceChangeType',
];

const STATE_STRUCTS = [
  'Icon', 'ProtectedResourceMetadata', 'RootState', 'RootConfigState', 'AgentInfo',
  'SessionModelInfo', 'ModelSelection', 'AgentSelection', 'ConfigPropertySchema', 'ConfigSchema',
  'PendingMessage', 'ChatState', 'ChatSummary', 'SessionState', 'SessionActiveClient',
  'SessionSummary', 'ChangesSummary', 'ProjectInfo', 'SessionConfigState', 'Turn', 'ActiveTurn', 'Message',
  'ChatInputOption',
  'ChatInputTextAnswerValue', 'ChatInputNumberAnswerValue',
  'ChatInputBooleanAnswerValue', 'ChatInputSelectedAnswerValue',
  'ChatInputSelectedManyAnswerValue', 'ChatInputAnswered',
  'ChatInputSkipped',
  'ChatInputTextQuestion',
  'ChatInputNumberQuestion', 'ChatInputBooleanQuestion',
  'ChatInputSingleSelectQuestion', 'ChatInputMultiSelectQuestion',
  'ChatInputRequest',
  'TextPosition', 'TextRange', 'TextSelection',
  'SimpleMessageAttachment', 'MessageEmbeddedResourceAttachment', 'MessageResourceAttachment',
  'MessageAnnotationsAttachment',
  'MarkdownResponsePart', 'ContentRef',
  'ResourceReponsePart', 'ToolCallResponsePart', 'ReasoningResponsePart',
  'SystemNotificationResponsePart',
  'ToolCallResult', 'ToolCallStreamingState',
  'ToolCallPendingConfirmationState', 'ToolCallRunningState',
  'ToolCallPendingResultConfirmationState', 'ToolCallCompletedState',
  'ToolCallCancelledState', 'ConfirmationOption', 'ToolDefinition', 'ToolAnnotations',
  'ToolResultTextContent', 'ToolResultEmbeddedResourceContent',
  'ToolResultResourceContent', 'ToolResultFileEditContent',
  'ToolResultTerminalContent', 'ToolResultSubagentContent',
  'CustomizationLoadingState', 'CustomizationLoadedState',
  'CustomizationDegradedState', 'CustomizationErrorState',
  'PluginCustomization', 'ClientPluginCustomization', 'DirectoryCustomization',
  'AgentCustomization', 'SkillCustomization', 'PromptCustomization',
  'RuleCustomization', 'HookCustomization', 'McpServerCustomization',
  'McpServerCustomizationApps', 'AhpMcpUiHostCapabilities',
  'McpServerStartingState', 'McpServerReadyState', 'McpServerAuthRequiredState',
  'McpServerErrorState', 'McpServerStoppedState',
  'ToolCallClientContributor', 'ToolCallMcpContributor',
  'FileEdit', 'TerminalInfo',
  'TerminalClientClaim', 'TerminalSessionClaim', 'TerminalState',
  'TerminalUnclassifiedPart', 'TerminalCommandPart',
  'UsageInfo', 'ErrorInfo', 'Snapshot',
  'Changeset', 'ChangesetState', 'ChangesetFile', 'ChangesetOperation',
  'AnnotationsSummary', 'AnnotationsState', 'Annotation', 'AnnotationEntry',
  'TelemetryCapabilities',
  'ResourceWatchState', 'ResourceChange',
];

const RESPONSE_PART_UNION: UnionConfig = {
  name: 'ResponsePart',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Markdown', structName: 'MarkdownResponsePart', discriminantValue: 'markdown' },
    { caseName: 'ContentRef', structName: 'ResourceReponsePart', discriminantValue: 'contentRef' },
    { caseName: 'ToolCall', structName: 'ToolCallResponsePart', discriminantValue: 'toolCall' },
    { caseName: 'Reasoning', structName: 'ReasoningResponsePart', discriminantValue: 'reasoning' },
    { caseName: 'SystemNotification', structName: 'SystemNotificationResponsePart', discriminantValue: 'systemNotification' },
  ],
  unknown: true,
};

const TOOL_CALL_STATE_UNION: UnionConfig = {
  name: 'ToolCallState',
  discriminantField: 'status',
  variants: [
    { caseName: 'Streaming', structName: 'ToolCallStreamingState', discriminantValue: 'streaming' },
    { caseName: 'PendingConfirmation', structName: 'ToolCallPendingConfirmationState', discriminantValue: 'pending-confirmation' },
    { caseName: 'Running', structName: 'ToolCallRunningState', discriminantValue: 'running' },
    { caseName: 'PendingResultConfirmation', structName: 'ToolCallPendingResultConfirmationState', discriminantValue: 'pending-result-confirmation' },
    { caseName: 'Completed', structName: 'ToolCallCompletedState', discriminantValue: 'completed' },
    { caseName: 'Cancelled', structName: 'ToolCallCancelledState', discriminantValue: 'cancelled' },
  ],
  unknown: true,
};

const TERMINAL_CLAIM_UNION: UnionConfig = {
  name: 'TerminalClaim',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Client', structName: 'TerminalClientClaim', discriminantValue: 'client' },
    { caseName: 'Session', structName: 'TerminalSessionClaim', discriminantValue: 'session' },
  ],
  unknown: true,
};

const TERMINAL_CONTENT_PART_UNION: UnionConfig = {
  name: 'TerminalContentPart',
  discriminantField: 'type',
  variants: [
    { caseName: 'Unclassified', structName: 'TerminalUnclassifiedPart', discriminantValue: 'unclassified' },
    { caseName: 'Command', structName: 'TerminalCommandPart', discriminantValue: 'command' },
  ],
  unknown: true,
};

function generateChatOriginKotlin(): string {
  return `@Serializable(with = ChatOriginSerializer::class)
sealed interface ChatOrigin {
    @JvmInline value class User(val value: ChatOriginUser) : ChatOrigin
    @JvmInline value class Fork(val value: ChatOriginFork) : ChatOrigin
    @JvmInline value class Tool(val value: ChatOriginTool) : ChatOrigin
    @JvmInline value class Unknown(val raw: JsonObject) : ChatOrigin
}

@Serializable
data class ChatOriginUser(
    val kind: ChatOriginKind = ChatOriginKind.USER,
)

@Serializable
data class ChatOriginFork(
    val kind: ChatOriginKind = ChatOriginKind.FORK,
    val chat: String,
    val turnId: String,
)

@Serializable
data class ChatOriginTool(
    val kind: ChatOriginKind = ChatOriginKind.TOOL,
    val chat: String,
    val toolCallId: String,
)

internal object ChatOriginSerializer : KSerializer<ChatOrigin> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ChatOrigin")

    override fun deserialize(decoder: Decoder): ChatOrigin {
        val input = decoder as? JsonDecoder ?: error("ChatOrigin can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject ?: error("Expected JsonObject for ChatOrigin")
        return when ((obj["kind"] as? JsonPrimitive)?.contentOrNull) {
            "user" -> ChatOrigin.User(input.json.decodeFromJsonElement(ChatOriginUser.serializer(), element))
            "fork" -> ChatOrigin.Fork(input.json.decodeFromJsonElement(ChatOriginFork.serializer(), element))
            "tool" -> ChatOrigin.Tool(input.json.decodeFromJsonElement(ChatOriginTool.serializer(), element))
            else -> ChatOrigin.Unknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ChatOrigin) {
        val output = encoder as? JsonEncoder ?: error("ChatOrigin can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChatOrigin.User -> output.json.encodeToJsonElement(ChatOriginUser.serializer(), value.value)
            is ChatOrigin.Fork -> output.json.encodeToJsonElement(ChatOriginFork.serializer(), value.value)
            is ChatOrigin.Tool -> output.json.encodeToJsonElement(ChatOriginTool.serializer(), value.value)
            is ChatOrigin.Unknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}`;
}

const SESSION_INPUT_QUESTION_UNION: UnionConfig = {
  name: 'ChatInputQuestion',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Text', structName: 'ChatInputTextQuestion', discriminantValue: 'text' },
    // Both "number" and "integer" wire values map to the same data class.
    // Generator deduplicates the sealed-interface variant by struct name.
    { caseName: 'Number', structName: 'ChatInputNumberQuestion', discriminantValue: 'number' },
    { caseName: 'Number', structName: 'ChatInputNumberQuestion', discriminantValue: 'integer' },
    { caseName: 'Boolean', structName: 'ChatInputBooleanQuestion', discriminantValue: 'boolean' },
    { caseName: 'SingleSelect', structName: 'ChatInputSingleSelectQuestion', discriminantValue: 'single-select' },
    { caseName: 'MultiSelect', structName: 'ChatInputMultiSelectQuestion', discriminantValue: 'multi-select' },
  ],
  unknown: true,
};

const SESSION_INPUT_ANSWER_VALUE_UNION: UnionConfig = {
  name: 'ChatInputAnswerValue',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Text', structName: 'ChatInputTextAnswerValue', discriminantValue: 'text' },
    { caseName: 'Number', structName: 'ChatInputNumberAnswerValue', discriminantValue: 'number' },
    { caseName: 'Boolean', structName: 'ChatInputBooleanAnswerValue', discriminantValue: 'boolean' },
    { caseName: 'Selected', structName: 'ChatInputSelectedAnswerValue', discriminantValue: 'selected' },
    { caseName: 'SelectedMany', structName: 'ChatInputSelectedManyAnswerValue', discriminantValue: 'selected-many' },
  ],
  unknown: true,
};

const SESSION_INPUT_ANSWER_UNION: UnionConfig = {
  name: 'ChatInputAnswer',
  discriminantField: 'state',
  variants: [
    { caseName: 'Draft', structName: 'ChatInputAnswered', discriminantValue: 'draft' },
    { caseName: 'Submitted', structName: 'ChatInputAnswered', discriminantValue: 'submitted' },
    { caseName: 'Skipped', structName: 'ChatInputSkipped', discriminantValue: 'skipped' },
  ],
  unknown: true,
};

const MESSAGE_ATTACHMENT_UNION: UnionConfig = {
  name: 'MessageAttachment',
  discriminantField: 'type',
  variants: [
    { caseName: 'Simple', structName: 'SimpleMessageAttachment', discriminantValue: 'simple' },
    { caseName: 'EmbeddedResource', structName: 'MessageEmbeddedResourceAttachment', discriminantValue: 'embeddedResource' },
    { caseName: 'Resource', structName: 'MessageResourceAttachment', discriminantValue: 'resource' },
    { caseName: 'Annotations', structName: 'MessageAnnotationsAttachment', discriminantValue: 'annotations' },
  ],
  unknown: true,
};

const CUSTOMIZATION_UNION: UnionConfig = {
  name: 'Customization',
  discriminantField: 'type',
  variants: [
    { caseName: 'Plugin', structName: 'PluginCustomization', discriminantValue: 'plugin' },
    { caseName: 'Directory', structName: 'DirectoryCustomization', discriminantValue: 'directory' },
    { caseName: 'McpServer', structName: 'McpServerCustomization', discriminantValue: 'mcpServer' },
  ],
  unknown: true,
};

const CHILD_CUSTOMIZATION_UNION: UnionConfig = {
  name: 'ChildCustomization',
  discriminantField: 'type',
  variants: [
    { caseName: 'Agent', structName: 'AgentCustomization', discriminantValue: 'agent' },
    { caseName: 'Skill', structName: 'SkillCustomization', discriminantValue: 'skill' },
    { caseName: 'Prompt', structName: 'PromptCustomization', discriminantValue: 'prompt' },
    { caseName: 'Rule', structName: 'RuleCustomization', discriminantValue: 'rule' },
    { caseName: 'Hook', structName: 'HookCustomization', discriminantValue: 'hook' },
    { caseName: 'McpServer', structName: 'McpServerCustomization', discriminantValue: 'mcpServer' },
  ],
  unknown: true,
};

const CUSTOMIZATION_LOAD_STATE_UNION: UnionConfig = {
  name: 'CustomizationLoadState',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Loading', structName: 'CustomizationLoadingState', discriminantValue: 'loading' },
    { caseName: 'Loaded', structName: 'CustomizationLoadedState', discriminantValue: 'loaded' },
    { caseName: 'Degraded', structName: 'CustomizationDegradedState', discriminantValue: 'degraded' },
    { caseName: 'Error', structName: 'CustomizationErrorState', discriminantValue: 'error' },
  ],
  unknown: true,
};

const MCP_SERVER_STATUS_UNION: UnionConfig = {
  name: 'McpServerState',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Starting', structName: 'McpServerStartingState', discriminantValue: 'starting' },
    { caseName: 'Ready', structName: 'McpServerReadyState', discriminantValue: 'ready' },
    { caseName: 'AuthRequired', structName: 'McpServerAuthRequiredState', discriminantValue: 'authRequired' },
    { caseName: 'Error', structName: 'McpServerErrorState', discriminantValue: 'error' },
    { caseName: 'Stopped', structName: 'McpServerStoppedState', discriminantValue: 'stopped' },
  ],
  unknown: true,
};

const TOOL_CALL_CONTRIBUTOR_UNION: UnionConfig = {
  name: 'ToolCallContributor',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Client', structName: 'ToolCallClientContributor', discriminantValue: 'client' },
    { caseName: 'Mcp', structName: 'ToolCallMcpContributor', discriminantValue: 'mcp' },
  ],
  unknown: true,
};

function generateStateFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// ─── Type Aliases ───────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('typealias URI = String');
  lines.push('');

  lines.push('// ─── StringOrMarkdown ───────────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateStringOrMarkdown());
  lines.push('');

  lines.push('// ─── Enums ──────────────────────────────────────────────────────────────────');
  lines.push('');
  for (const enumName of STATE_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateKotlinEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ─── State Types ────────────────────────────────────────────────────────────');
  lines.push('');
  for (const ifaceName of STATE_STRUCTS) {
    try {
      lines.push(generateDataClassFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// ─── Discriminated Unions ───────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateChatOriginKotlin());
  lines.push('');
  lines.push(generateDiscriminatedUnion(RESPONSE_PART_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_CALL_STATE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TERMINAL_CLAIM_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TERMINAL_CONTENT_PART_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(SESSION_INPUT_QUESTION_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(SESSION_INPUT_ANSWER_VALUE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(SESSION_INPUT_ANSWER_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(MESSAGE_ATTACHMENT_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CUSTOMIZATION_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CHILD_CUSTOMIZATION_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CUSTOMIZATION_LOAD_STATE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(MCP_SERVER_STATUS_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_CALL_CONTRIBUTOR_UNION));
  lines.push('');
  lines.push(generateToolResultContentUnion());
  lines.push('');
  lines.push(generateSnapshotState());
  lines.push('');

  return lines.join('\n');
}

// ─── Actions File Generator ──────────────────────────────────────────────────

const ACTION_VARIANTS: { type: string; caseName: string; tsInterface: string }[] = [
  { type: 'root/agentsChanged', caseName: 'RootAgentsChanged', tsInterface: 'RootAgentsChangedAction' },
  { type: 'root/activeSessionsChanged', caseName: 'RootActiveSessionsChanged', tsInterface: 'RootActiveSessionsChangedAction' },
  { type: 'session/ready', caseName: 'SessionReady', tsInterface: 'SessionReadyAction' },
  { type: 'session/creationFailed', caseName: 'SessionCreationFailed', tsInterface: 'SessionCreationFailedAction' },
  { type: 'session/chatAdded', caseName: 'SessionChatAdded', tsInterface: 'SessionChatAddedAction' },
  { type: 'session/chatRemoved', caseName: 'SessionChatRemoved', tsInterface: 'SessionChatRemovedAction' },
  { type: 'session/chatUpdated', caseName: 'SessionChatUpdated', tsInterface: 'SessionChatUpdatedAction' },
  { type: 'session/defaultChatChanged', caseName: 'SessionDefaultChatChanged', tsInterface: 'SessionDefaultChatChangedAction' },
  { type: 'chat/turnStarted', caseName: 'ChatTurnStarted', tsInterface: 'ChatTurnStartedAction' },
  { type: 'chat/delta', caseName: 'ChatDelta', tsInterface: 'ChatDeltaAction' },
  { type: 'chat/responsePart', caseName: 'ChatResponsePart', tsInterface: 'ChatResponsePartAction' },
  { type: 'chat/toolCallStart', caseName: 'ChatToolCallStart', tsInterface: 'ChatToolCallStartAction' },
  { type: 'chat/toolCallDelta', caseName: 'ChatToolCallDelta', tsInterface: 'ChatToolCallDeltaAction' },
  { type: 'chat/toolCallReady', caseName: 'ChatToolCallReady', tsInterface: 'ChatToolCallReadyAction' },
  { type: 'chat/toolCallConfirmed', caseName: 'ChatToolCallConfirmed', tsInterface: '_merged_chat_' },
  { type: 'chat/toolCallComplete', caseName: 'ChatToolCallComplete', tsInterface: 'ChatToolCallCompleteAction' },
  { type: 'chat/toolCallResultConfirmed', caseName: 'ChatToolCallResultConfirmed', tsInterface: 'ChatToolCallResultConfirmedAction' },
  { type: 'chat/toolCallContentChanged', caseName: 'ChatToolCallContentChanged', tsInterface: 'ChatToolCallContentChangedAction' },
  { type: 'chat/turnComplete', caseName: 'ChatTurnComplete', tsInterface: 'ChatTurnCompleteAction' },
  { type: 'chat/turnCancelled', caseName: 'ChatTurnCancelled', tsInterface: 'ChatTurnCancelledAction' },
  { type: 'chat/error', caseName: 'ChatError', tsInterface: 'ChatErrorAction' },
  { type: 'session/titleChanged', caseName: 'SessionTitleChanged', tsInterface: 'SessionTitleChangedAction' },
  { type: 'chat/usage', caseName: 'ChatUsage', tsInterface: 'ChatUsageAction' },
  { type: 'chat/reasoning', caseName: 'ChatReasoning', tsInterface: 'ChatReasoningAction' },
  { type: 'session/modelChanged', caseName: 'SessionModelChanged', tsInterface: 'SessionModelChangedAction' },
  { type: 'session/agentChanged', caseName: 'SessionAgentChanged', tsInterface: 'SessionAgentChangedAction' },
  { type: 'session/isReadChanged', caseName: 'SessionIsReadChanged', tsInterface: 'SessionIsReadChangedAction' },
  { type: 'session/isArchivedChanged', caseName: 'SessionIsArchivedChanged', tsInterface: 'SessionIsArchivedChangedAction' },
  { type: 'session/activityChanged', caseName: 'SessionActivityChanged', tsInterface: 'SessionActivityChangedAction' },
  { type: 'session/changesetsChanged', caseName: 'SessionChangesetsChanged', tsInterface: 'SessionChangesetsChangedAction' },
  { type: 'session/serverToolsChanged', caseName: 'SessionServerToolsChanged', tsInterface: 'SessionServerToolsChangedAction' },
  { type: 'session/activeClientChanged', caseName: 'SessionActiveClientChanged', tsInterface: 'SessionActiveClientChangedAction' },
  { type: 'session/activeClientToolsChanged', caseName: 'SessionActiveClientToolsChanged', tsInterface: 'SessionActiveClientToolsChangedAction' },
  { type: 'chat/pendingMessageSet', caseName: 'ChatPendingMessageSet', tsInterface: 'ChatPendingMessageSetAction' },
  { type: 'chat/pendingMessageRemoved', caseName: 'ChatPendingMessageRemoved', tsInterface: 'ChatPendingMessageRemovedAction' },
  { type: 'chat/queuedMessagesReordered', caseName: 'ChatQueuedMessagesReordered', tsInterface: 'ChatQueuedMessagesReorderedAction' },
  { type: 'chat/inputRequested', caseName: 'ChatInputRequested', tsInterface: 'ChatInputRequestedAction' },
  { type: 'chat/inputAnswerChanged', caseName: 'ChatInputAnswerChanged', tsInterface: 'ChatInputAnswerChangedAction' },
  { type: 'chat/inputCompleted', caseName: 'ChatInputCompleted', tsInterface: 'ChatInputCompletedAction' },
  { type: 'session/customizationsChanged', caseName: 'SessionCustomizationsChanged', tsInterface: 'SessionCustomizationsChangedAction' },
  { type: 'session/customizationToggled', caseName: 'SessionCustomizationToggled', tsInterface: 'SessionCustomizationToggledAction' },
  { type: 'session/customizationUpdated', caseName: 'SessionCustomizationUpdated', tsInterface: 'SessionCustomizationUpdatedAction' },
  { type: 'session/customizationRemoved', caseName: 'SessionCustomizationRemoved', tsInterface: 'SessionCustomizationRemovedAction' },
  { type: 'session/mcpServerStateChanged', caseName: 'SessionMcpServerStateChanged', tsInterface: 'SessionMcpServerStateChangedAction' },
  { type: 'chat/truncated', caseName: 'ChatTruncated', tsInterface: 'ChatTruncatedAction' },
  { type: 'session/configChanged', caseName: 'SessionConfigChanged', tsInterface: 'SessionConfigChangedAction' },
  { type: 'session/metaChanged', caseName: 'SessionMetaChanged', tsInterface: 'SessionMetaChangedAction' },
  { type: 'changeset/statusChanged', caseName: 'ChangesetStatusChanged', tsInterface: 'ChangesetStatusChangedAction' },
  { type: 'changeset/fileSet', caseName: 'ChangesetFileSet', tsInterface: 'ChangesetFileSetAction' },
  { type: 'changeset/fileRemoved', caseName: 'ChangesetFileRemoved', tsInterface: 'ChangesetFileRemovedAction' },
  { type: 'changeset/operationsChanged', caseName: 'ChangesetOperationsChanged', tsInterface: 'ChangesetOperationsChangedAction' },
  { type: 'changeset/operationStatusChanged', caseName: 'ChangesetOperationStatusChanged', tsInterface: 'ChangesetOperationStatusChangedAction' },
  { type: 'changeset/cleared', caseName: 'ChangesetCleared', tsInterface: 'ChangesetClearedAction' },
  { type: 'annotations/set', caseName: 'AnnotationsSet', tsInterface: 'AnnotationsSetAction' },
  { type: 'annotations/updated', caseName: 'AnnotationsUpdated', tsInterface: 'AnnotationsUpdatedAction' },
  { type: 'annotations/removed', caseName: 'AnnotationsRemoved', tsInterface: 'AnnotationsRemovedAction' },
  { type: 'annotations/entrySet', caseName: 'AnnotationsEntrySet', tsInterface: 'AnnotationsEntrySetAction' },
  { type: 'annotations/entryRemoved', caseName: 'AnnotationsEntryRemoved', tsInterface: 'AnnotationsEntryRemovedAction' },
  { type: 'root/terminalsChanged', caseName: 'RootTerminalsChanged', tsInterface: 'RootTerminalsChangedAction' },
  { type: 'root/configChanged', caseName: 'RootConfigChanged', tsInterface: 'RootConfigChangedAction' },
  { type: 'terminal/data', caseName: 'TerminalData', tsInterface: 'TerminalDataAction' },
  { type: 'terminal/input', caseName: 'TerminalInput', tsInterface: 'TerminalInputAction' },
  { type: 'terminal/resized', caseName: 'TerminalResized', tsInterface: 'TerminalResizedAction' },
  { type: 'terminal/claimed', caseName: 'TerminalClaimed', tsInterface: 'TerminalClaimedAction' },
  { type: 'terminal/titleChanged', caseName: 'TerminalTitleChanged', tsInterface: 'TerminalTitleChangedAction' },
  { type: 'terminal/cwdChanged', caseName: 'TerminalCwdChanged', tsInterface: 'TerminalCwdChangedAction' },
  { type: 'terminal/exited', caseName: 'TerminalExited', tsInterface: 'TerminalExitedAction' },
  { type: 'terminal/cleared', caseName: 'TerminalCleared', tsInterface: 'TerminalClearedAction' },
  { type: 'terminal/commandDetectionAvailable', caseName: 'TerminalCommandDetectionAvailable', tsInterface: 'TerminalCommandDetectionAvailableAction' },
  { type: 'terminal/commandExecuted', caseName: 'TerminalCommandExecuted', tsInterface: 'TerminalCommandExecutedAction' },
  { type: 'terminal/commandFinished', caseName: 'TerminalCommandFinished', tsInterface: 'TerminalCommandFinishedAction' },
  { type: 'resourceWatch/changed', caseName: 'ResourceWatchChanged', tsInterface: 'ResourceWatchChangedAction' },
];

/** Merged data class for the approved/denied tool call confirmed action. */
function generateMergedToolCallConfirmedDataClass(scope: 'Session' | 'Chat' = 'Session'): string {
  const className = `${scope}ToolCallConfirmedAction`;
  const actionType = scope === 'Chat' ? 'ActionType.CHAT_TOOL_CALL_CONFIRMED' : 'ActionType.SESSION_TOOL_CALL_CONFIRMED';
  return `/**
 * Client approves or denies a pending tool call (merged approved + denied variants).
 */
@Serializable
data class ${className}(
    /** Action type discriminant */
    val type: ActionType = ${actionType},
    /** Turn identifier */
    val turnId: String,
    /** Tool call identifier */
    val toolCallId: String,
    /** Whether the tool call was approved */
    val approved: Boolean,
    /** How the tool was confirmed (present when approved) */
    val confirmed: ToolCallConfirmationReason? = null,
    /** Edited tool input parameters, if the client modified them before confirming */
    val editedToolInput: String? = null,
    /** Why the tool was cancelled (present when denied) */
    val reason: ToolCallCancellationReason? = null,
    /** What the user suggested instead (present when denied) */
    val userSuggestion: Message? = null,
    /** Explanation for the denial */
    val reasonMessage: StringOrMarkdown? = null,
    /** ID of the selected confirmation option, if the server provided options */
    val selectedOptionId: String? = null,
    /** Additional provider-specific metadata */
    @SerialName("_meta") val meta: Map<String, JsonElement>? = null,
)`;
}

function generateActionsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  // ActionType enum
  lines.push('// ─── ActionType ─────────────────────────────────────────────────────────────');
  lines.push('');
  const actionTypeEnum = findEnum(project, 'ActionType');
  if (actionTypeEnum) {
    lines.push(generateKotlinEnum(actionTypeEnum));
    lines.push('');
  }

  // ActionEnvelope and ActionOrigin
  lines.push('// ─── Action Infrastructure ──────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateDataClassFromInterface(project, 'ActionOrigin'));
  lines.push('');
  lines.push(generateDataClassFromInterface(project, 'ActionEnvelope'));
  lines.push('');

  // Individual action data classes
  lines.push('// ─── Action Types ───────────────────────────────────────────────────────────');
  lines.push('');
  const priorPartialsAction = new Set(requiredPartialStructs);
  for (const variant of ACTION_VARIANTS) {
    if (variant.tsInterface === '_merged_' || variant.tsInterface === '_merged_chat_') {
      lines.push(generateMergedToolCallConfirmedDataClass(variant.tsInterface === '_merged_chat_' ? 'Chat' : 'Session'));
      lines.push('');
      continue;
    }
    try {
      lines.push(generateDataClassFromInterface(project, variant.tsInterface));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${variant.tsInterface}: ${e}`);
      lines.push('');
    }
  }

  // Emit any Partial<T> types referenced only by action payloads (e.g.
  // Partial<ChatSummary> on SessionChatUpdatedAction). Mirrors the
  // notification-side emission so action-only partials don't slip through.
  const actionNewPartials = [...requiredPartialStructs].filter(n => !priorPartialsAction.has(n));
  if (actionNewPartials.length > 0) {
    lines.push('// ─── Partial Summary Types ──────────────────────────────────────────────────');
    lines.push('');
    for (const tsName of actionNewPartials) {
      try {
        lines.push(generatePartialDataClassFromInterface(project, tsName));
        lines.push('');
      } catch (e) {
        lines.push(`// TODO: Could not generate Partial<${tsName}>: ${e}`);
        lines.push('');
      }
    }
  }

  // StateAction discriminated union
  lines.push('// ─── StateAction Union ──────────────────────────────────────────────────────');
  lines.push('');
  lines.push('/**');
  lines.push(' * Discriminated union of all state actions.');
  lines.push(' *');
  lines.push(' * Unknown wire types decode to [StateActionUnknown], which captures the full');
  lines.push(' * raw JSON object (mirrors the state-channel `XUnknown` variants and Rust\'s');
  lines.push(' * `Unknown(serde_json::Value)`). Reducers should treat unknown actions as');
  lines.push(' * no-ops; the captured payload is re-emitted unchanged on encode so unknown');
  lines.push(' * actions can round-trip across protocol versions.');
  lines.push(' */');
  lines.push('@Serializable(with = StateActionSerializer::class)');
  lines.push('sealed interface StateAction');
  lines.push('');
  for (const v of ACTION_VARIANTS) {
    const dataClass = v.tsInterface === '_merged_' ? 'SessionToolCallConfirmedAction' : v.tsInterface === '_merged_chat_' ? 'ChatToolCallConfirmedAction' : v.tsInterface;
    lines.push(`@JvmInline value class StateAction${v.caseName}(val value: ${dataClass}) : StateAction`);
  }
  lines.push('@JvmInline value class StateActionUnknown(val raw: JsonObject) : StateAction');
  lines.push('');

  lines.push('internal object StateActionSerializer : KSerializer<StateAction> {');
  lines.push('    override val descriptor: SerialDescriptor =');
  lines.push('        buildClassSerialDescriptor("StateAction")');
  lines.push('');
  lines.push('    override fun deserialize(decoder: Decoder): StateAction {');
  lines.push('        val input = decoder as? JsonDecoder');
  lines.push('            ?: error("StateAction can only be deserialized from JSON")');
  lines.push('        val element = input.decodeJsonElement()');
  lines.push('        val obj = element as? JsonObject');
  lines.push('            ?: error("Expected JsonObject for StateAction")');
  lines.push('        val type = (obj["type"] as? JsonPrimitive)?.contentOrNull');
  lines.push('            ?: return StateActionUnknown(obj)');
  lines.push('        return when (type) {');
  for (const v of ACTION_VARIANTS) {
    const dataClass = v.tsInterface === '_merged_' ? 'SessionToolCallConfirmedAction' : v.tsInterface === '_merged_chat_' ? 'ChatToolCallConfirmedAction' : v.tsInterface;
    lines.push(`            ${JSON.stringify(v.type)} -> StateAction${v.caseName}(input.json.decodeFromJsonElement(${dataClass}.serializer(), element))`);
  }
  lines.push('            else -> StateActionUnknown(obj)');
  lines.push('        }');
  lines.push('    }');
  lines.push('');
  lines.push('    override fun serialize(encoder: Encoder, value: StateAction) {');
  lines.push('        val output = encoder as? JsonEncoder');
  lines.push('            ?: error("StateAction can only be serialized to JSON")');
  lines.push('        val element: JsonElement = when (value) {');
  for (const v of ACTION_VARIANTS) {
    const dataClass = v.tsInterface === '_merged_' ? 'SessionToolCallConfirmedAction' : v.tsInterface === '_merged_chat_' ? 'ChatToolCallConfirmedAction' : v.tsInterface;
    lines.push(`            is StateAction${v.caseName} -> output.json.encodeToJsonElement(${dataClass}.serializer(), value.value)`);
  }
  lines.push('            is StateActionUnknown -> value.raw');
  lines.push('        }');
  lines.push('        output.encodeJsonElement(element)');
  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ─── Commands File Generator ─────────────────────────────────────────────────

const COMMAND_ENUMS = ['ReconnectResultType', 'ContentEncoding', 'CompletionItemKind', 'ResourceType', 'ResourceWriteMode'];

const COMMAND_STRUCTS = [
  'InitializeParams', 'InitializeResult',
  'ClientCapabilities',
  'ReconnectParams', 'ReconnectReplayResult', 'ReconnectSnapshotResult',
  'SubscribeParams', 'SubscribeResult',
  'SessionForkSource', 'CreateSessionParams', 'DisposeSessionParams',
  'ChatForkSource', 'CreateChatParams', 'DisposeChatParams',
  'ListSessionsParams', 'ListSessionsResult',
  'ResourceReadParams', 'ResourceReadResult',
  'ResourceWriteParams', 'ResourceWriteResult',
  'ResourceListParams', 'ResourceListResult', 'DirectoryEntry',
  'ResourceCopyParams', 'ResourceCopyResult',
  'ResourceDeleteParams', 'ResourceDeleteResult',
  'ResourceMoveParams', 'ResourceMoveResult',
  'ResourceResolveParams', 'ResourceResolveResult',
  'ResourceMkdirParams', 'ResourceMkdirResult',
  'ResourceRequestParams', 'ResourceRequestResult',
  'CreateResourceWatchParams', 'CreateResourceWatchResult',
  'FetchTurnsParams', 'FetchTurnsResult',
  'UnsubscribeParams', 'DispatchActionParams',
  'AuthenticateParams', 'AuthenticateResult',
  'CreateTerminalParams', 'DisposeTerminalParams',
  'ResolveSessionConfigParams', 'ResolveSessionConfigResult',
  'SessionConfigPropertySchema', 'SessionConfigSchema',
  'SessionConfigCompletionsParams', 'SessionConfigCompletionsResult',
  'SessionConfigValueItem',
  'CompletionsParams', 'CompletionItem', 'CompletionsResult',
  'InvokeChangesetOperationParams', 'InvokeChangesetOperationResult',
  'ChangesetOperationFollowUp',
];

const RECONNECT_RESULT_UNION: UnionConfig = {
  name: 'ReconnectResult',
  discriminantField: 'type',
  variants: [
    { caseName: 'Replay', structName: 'ReconnectReplayResult', discriminantValue: 'replay' },
    { caseName: 'Snapshot', structName: 'ReconnectSnapshotResult', discriminantValue: 'snapshot' },
  ],
};

/**
 * ChangesetOperationTarget — TS discriminated union over `{ kind: "resource" }`
 * and `{ kind: "range" }`. The variant structs are inline-only in TS (not
 * exported separately) and only appear in this one command result, so the
 * generator emits the whole subgraph (`ChangesetOperationTarget` union plus
 * the two variant data classes and the `Range` helper) by hand to keep the
 * Kotlin wire surface aligned with Swift and Rust.
 */
function generateChangesetOperationTargetKotlin(): string {
  return `/**
 * Identifies the file or range a [ChangesetOperation] should act on.
 */
@Serializable(with = ChangesetOperationTargetSerializer::class)
sealed interface ChangesetOperationTarget {
    @JvmInline value class Resource(val value: ChangesetOperationResourceTarget) : ChangesetOperationTarget
    @JvmInline value class Range(val value: ChangesetOperationRangeTarget) : ChangesetOperationTarget
}

@Serializable
data class ChangesetOperationResourceTarget(
    val resource: String,
    val side: String? = null,
    /** Discriminator. Always "resource". */
    val kind: String = "resource",
)

@Serializable
data class ChangesetOperationRangeTarget(
    val resource: String,
    val side: String? = null,
    val range: ChangesetOperationTargetRange,
    /** Discriminator. Always "range". */
    val kind: String = "range",
)

@Serializable
data class ChangesetOperationTargetRange(
    val start: Long,
    val end: Long,
)

internal object ChangesetOperationTargetSerializer : KSerializer<ChangesetOperationTarget> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ChangesetOperationTarget")

    override fun deserialize(decoder: Decoder): ChangesetOperationTarget {
        val input = decoder as? JsonDecoder
            ?: error("ChangesetOperationTarget can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ChangesetOperationTarget")
        val kind = (obj["kind"] as? JsonPrimitive)?.contentOrNull
            ?: error("Missing kind discriminator on ChangesetOperationTarget")
        return when (kind) {
            "resource" -> ChangesetOperationTarget.Resource(
                input.json.decodeFromJsonElement(ChangesetOperationResourceTarget.serializer(), element),
            )
            "range" -> ChangesetOperationTarget.Range(
                input.json.decodeFromJsonElement(ChangesetOperationRangeTarget.serializer(), element),
            )
            else -> error("Unknown ChangesetOperationTarget kind: $kind")
        }
    }

    override fun serialize(encoder: Encoder, value: ChangesetOperationTarget) {
        val output = encoder as? JsonEncoder
            ?: error("ChangesetOperationTarget can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChangesetOperationTarget.Resource ->
                output.json.encodeToJsonElement(ChangesetOperationResourceTarget.serializer(), value.value)
            is ChangesetOperationTarget.Range ->
                output.json.encodeToJsonElement(ChangesetOperationRangeTarget.serializer(), value.value)
        }
        output.encodeJsonElement(element)
    }
}`;
}

function generateCommandsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// ─── Command Enums ──────────────────────────────────────────────────────────');
  lines.push('');
  for (const enumName of COMMAND_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateKotlinEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ─── Command Types ──────────────────────────────────────────────────────────');
  lines.push('');
  const generated = new Set<string>();
  for (const ifaceName of COMMAND_STRUCTS) {
    if (generated.has(ifaceName)) continue;
    generated.add(ifaceName);
    try {
      lines.push(generateDataClassFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// ─── ReconnectResult Union ──────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateDiscriminatedUnion(RECONNECT_RESULT_UNION));
  lines.push('');

  lines.push('// ─── Changeset Operation Unions ─────────────────────────────────────────────');
  lines.push('');
  lines.push(generateChangesetOperationTargetKotlin());
  lines.push('');

  return lines.join('\n');
}

// ─── Notifications File Generator ────────────────────────────────────────────

const NOTIFICATION_ENUMS = ['AuthRequiredReason'];

const NOTIFICATION_STRUCTS = [
  'SessionAddedParams',
  'SessionRemovedParams',
  'SessionSummaryChangedParams',
  'AuthRequiredParams',
  'OtlpExportLogsParams',
  'OtlpExportTracesParams',
  'OtlpExportMetricsParams',
];

function generateNotificationsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// ─── Notification Enums ─────────────────────────────────────────────────────');
  lines.push('');
  for (const enumName of NOTIFICATION_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateKotlinEnum(decl));
      lines.push('');
    }
  }

  // Snapshot partials requested before notifications so we can emit exactly
  // the partials introduced by notification structs in this file.
  const priorPartials = new Set(requiredPartialStructs);

  lines.push('// ─── Notification Types ─────────────────────────────────────────────────────');
  lines.push('');
  for (const ifaceName of NOTIFICATION_STRUCTS) {
    try {
      lines.push(generateDataClassFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  const newPartials = [...requiredPartialStructs].filter(n => !priorPartials.has(n));
  if (newPartials.length > 0) {
    lines.push('// ─── Partial Summary Types ──────────────────────────────────────────────────');
    lines.push('');
    for (const tsName of newPartials) {
      try {
        lines.push(generatePartialDataClassFromInterface(project, tsName));
        lines.push('');
      } catch (e) {
        lines.push(`// TODO: Could not generate Partial<${tsName}>: ${e}`);
        lines.push('');
      }
    }
  }

  // Note: AHP notifications are routed by their JSON-RPC `method` name
  // (`root/sessionAdded`, `auth/required`, `otlp/exportLogs`, ...), not by an
  // embedded discriminator. There is no `ProtocolNotification` sealed union;
  // consumers dispatch on the JSON-RPC method themselves and decode the
  // matching `*Params` data class.

  return lines.join('\n');
}

// ─── Errors File Generator ───────────────────────────────────────────────────

function generateErrorsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// ─── Standard JSON-RPC Error Codes ──────────────────────────────────────────');
  lines.push('');
  lines.push('object JsonRpcErrorCodes {');
  lines.push('    /** Invalid JSON */');
  lines.push('    const val PARSE_ERROR: Int = -32700');
  lines.push('    /** Not a valid JSON-RPC request */');
  lines.push('    const val INVALID_REQUEST: Int = -32600');
  lines.push('    /** Unknown method name */');
  lines.push('    const val METHOD_NOT_FOUND: Int = -32601');
  lines.push('    /** Invalid method parameters */');
  lines.push('    const val INVALID_PARAMS: Int = -32602');
  lines.push('    /** Unspecified server error */');
  lines.push('    const val INTERNAL_ERROR: Int = -32603');
  lines.push('}');
  lines.push('');

  lines.push('// ─── AHP Application Error Codes ────────────────────────────────────────────');
  lines.push('');
  lines.push('object AhpErrorCodes {');
  lines.push('    /** The referenced session URI does not exist */');
  lines.push('    const val SESSION_NOT_FOUND: Int = -32001');
  lines.push('    /** The requested agent provider is not registered */');
  lines.push('    const val PROVIDER_NOT_FOUND: Int = -32002');
  lines.push('    /** A session with the given URI already exists */');
  lines.push('    const val SESSION_ALREADY_EXISTS: Int = -32003');
  lines.push('    /** The operation requires no active turn, but one is in progress */');
  lines.push('    const val TURN_IN_PROGRESS: Int = -32004');
  lines.push('    /** The server cannot speak any of the protocol versions offered by the client */');
  lines.push('    const val UNSUPPORTED_PROTOCOL_VERSION: Int = -32005');
  lines.push('    /** The requested content URI does not exist */');
  lines.push('    const val CONTENT_NOT_FOUND: Int = -32006');
  lines.push('    /** Authentication required for a protected resource */');
  lines.push('    const val AUTH_REQUIRED: Int = -32007');
  lines.push('    /** The requested file, folder, or URI does not exist */');
  lines.push('    const val NOT_FOUND: Int = -32008');
  lines.push('    /** The client is not permitted to access the requested resource */');
  lines.push('    const val PERMISSION_DENIED: Int = -32009');
  lines.push('    /** The target resource already exists and the operation does not allow overwriting */');
  lines.push('    const val ALREADY_EXISTS: Int = -32010');
  lines.push('}');
  lines.push('');

  lines.push('// ─── Error Detail Payloads ──────────────────────────────────────────────────');
  lines.push('');
  for (const ifaceName of ['AuthRequiredErrorData', 'PermissionDeniedErrorData', 'UnsupportedProtocolVersionErrorData']) {
    try {
      lines.push(generateDataClassFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Messages File Generator ─────────────────────────────────────────────────

function generateMessagesFile(): string {
  return `${GENERATED_HEADER}
// ─── JSON-RPC Base Types ────────────────────────────────────────────────────

/**
 * A JSON-RPC 2.0 request.
 */
@Serializable
data class JsonRpcRequest<P>(
    val id: Long,
    val method: String,
    val params: P,
    val jsonrpc: String = "2.0",
)

/**
 * A JSON-RPC 2.0 error object.
 */
@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String,
    val data: JsonElement? = null,
)

/**
 * A JSON-RPC 2.0 success response.
 */
@Serializable
data class JsonRpcSuccessResponse<R>(
    val id: Long,
    val result: R,
    val jsonrpc: String = "2.0",
)

/**
 * A JSON-RPC 2.0 error response.
 */
@Serializable
data class JsonRpcErrorResponse(
    val id: Long,
    val error: JsonRpcError,
    val jsonrpc: String = "2.0",
)

/**
 * A JSON-RPC 2.0 notification (no id).
 */
@Serializable
data class JsonRpcNotification<P>(
    val method: String,
    val params: P,
    val jsonrpc: String = "2.0",
)

// ─── Server → Client Notification Params ────────────────────────────────────

/** Params for the server → client \`action\` notification. */
typealias ActionNotificationParams = ActionEnvelope

// ─── AHP Command Helpers ────────────────────────────────────────────────────

/**
 * Typed factories for constructing AHP JSON-RPC requests.
 */
object AhpCommands {
    fun initialize(id: Long, params: InitializeParams): JsonRpcRequest<InitializeParams> =
        JsonRpcRequest(id = id, method = "initialize", params = params)

    fun reconnect(id: Long, params: ReconnectParams): JsonRpcRequest<ReconnectParams> =
        JsonRpcRequest(id = id, method = "reconnect", params = params)

    fun subscribe(id: Long, params: SubscribeParams): JsonRpcRequest<SubscribeParams> =
        JsonRpcRequest(id = id, method = "subscribe", params = params)

    fun createSession(id: Long, params: CreateSessionParams): JsonRpcRequest<CreateSessionParams> =
        JsonRpcRequest(id = id, method = "createSession", params = params)

    fun disposeSession(id: Long, params: DisposeSessionParams): JsonRpcRequest<DisposeSessionParams> =
        JsonRpcRequest(id = id, method = "disposeSession", params = params)

    fun listSessions(id: Long, params: ListSessionsParams): JsonRpcRequest<ListSessionsParams> =
        JsonRpcRequest(id = id, method = "listSessions", params = params)

    fun resourceRead(id: Long, params: ResourceReadParams): JsonRpcRequest<ResourceReadParams> =
        JsonRpcRequest(id = id, method = "resourceRead", params = params)

    fun resourceWrite(id: Long, params: ResourceWriteParams): JsonRpcRequest<ResourceWriteParams> =
        JsonRpcRequest(id = id, method = "resourceWrite", params = params)

    fun resourceList(id: Long, params: ResourceListParams): JsonRpcRequest<ResourceListParams> =
        JsonRpcRequest(id = id, method = "resourceList", params = params)

    fun resourceCopy(id: Long, params: ResourceCopyParams): JsonRpcRequest<ResourceCopyParams> =
        JsonRpcRequest(id = id, method = "resourceCopy", params = params)

    fun resourceDelete(id: Long, params: ResourceDeleteParams): JsonRpcRequest<ResourceDeleteParams> =
        JsonRpcRequest(id = id, method = "resourceDelete", params = params)

    fun resourceMove(id: Long, params: ResourceMoveParams): JsonRpcRequest<ResourceMoveParams> =
        JsonRpcRequest(id = id, method = "resourceMove", params = params)

    fun resourceRequest(id: Long, params: ResourceRequestParams): JsonRpcRequest<ResourceRequestParams> =
        JsonRpcRequest(id = id, method = "resourceRequest", params = params)

    fun fetchTurns(id: Long, params: FetchTurnsParams): JsonRpcRequest<FetchTurnsParams> =
        JsonRpcRequest(id = id, method = "fetchTurns", params = params)

    fun authenticate(id: Long, params: AuthenticateParams): JsonRpcRequest<AuthenticateParams> =
        JsonRpcRequest(id = id, method = "authenticate", params = params)

    fun createTerminal(id: Long, params: CreateTerminalParams): JsonRpcRequest<CreateTerminalParams> =
        JsonRpcRequest(id = id, method = "createTerminal", params = params)

    fun disposeTerminal(id: Long, params: DisposeTerminalParams): JsonRpcRequest<DisposeTerminalParams> =
        JsonRpcRequest(id = id, method = "disposeTerminal", params = params)

    fun resolveSessionConfig(id: Long, params: ResolveSessionConfigParams): JsonRpcRequest<ResolveSessionConfigParams> =
        JsonRpcRequest(id = id, method = "resolveSessionConfig", params = params)

    fun sessionConfigCompletions(id: Long, params: SessionConfigCompletionsParams): JsonRpcRequest<SessionConfigCompletionsParams> =
        JsonRpcRequest(id = id, method = "sessionConfigCompletions", params = params)

    fun completions(id: Long, params: CompletionsParams): JsonRpcRequest<CompletionsParams> =
        JsonRpcRequest(id = id, method = "completions", params = params)

    fun invokeChangesetOperation(id: Long, params: InvokeChangesetOperationParams): JsonRpcRequest<InvokeChangesetOperationParams> =
        JsonRpcRequest(id = id, method = "invokeChangesetOperation", params = params)
}

/**
 * Typed factories for constructing client → server notifications.
 */
object AhpClientNotifications {
    fun unsubscribe(params: UnsubscribeParams): JsonRpcNotification<UnsubscribeParams> =
        JsonRpcNotification(method = "unsubscribe", params = params)

    fun dispatchAction(params: DispatchActionParams): JsonRpcNotification<DispatchActionParams> =
        JsonRpcNotification(method = "dispatchAction", params = params)
}
`;
}

// ─── Exhaustiveness Check ─────────────────────────────────────────────────────

/**
 * Verifies that every type exported from the per-channel protocol source
 * modules (state, actions, commands, notifications, errors) is covered by
 * one of the generator lists or a known special-cased code path.
 *
 * This catches the class of bug where a new type is added to the TypeScript
 * protocol (e.g. under `types/channels-*\/`) but the Kotlin generator
 * lists are not updated.
 */
function checkExhaustiveness(project: Project): void {
  const protocolModules = ['state.ts', 'actions.ts', 'commands.ts', 'notifications.ts', 'errors.ts'];
  const imported = new Set<string>();
  for (const baseName of protocolModules) {
    const sources = findProtocolSourceFiles(project, baseName);
    if (sources.length === 0) throw new Error(`Could not find types/${baseName} in the project`);
    for (const sf of sources) {
      for (const decl of sf.getInterfaces()) {
        if (decl.isExported()) imported.add(decl.getName());
      }
      for (const decl of sf.getTypeAliases()) {
        if (decl.isExported()) imported.add(decl.getName());
      }
      // Exported `const enum`s (e.g. ActionType, SessionStatus, ChangesetStatus) must
      // also be covered by one of the *_ENUMS lists or a knownSpecial entry, otherwise
      // a newly introduced enum would silently be omitted from the Kotlin output.
      for (const decl of sf.getEnums()) {
        if (decl.isExported()) imported.add(decl.getName());
      }
    }
  }

  const coveredByLists = new Set<string>([
    ...STATE_STRUCTS,
    ...STATE_ENUMS,
    ...COMMAND_STRUCTS,
    ...COMMAND_ENUMS,
    ...NOTIFICATION_STRUCTS,
    ...NOTIFICATION_ENUMS,
    ...ACTION_VARIANTS
      .filter(v => v.tsInterface !== '_merged_')
      .map(v => v.tsInterface),
  ]);

  const knownSpecial = new Set<string>([
    'URI',                          // type alias for string
    'BaseParams',                    // marker base interface; flattened into each command params struct
    // PingParams shape is `interface PingParams extends BaseParams { channel: 'ahp-root://' }`
    // (i.e. a `BaseParams` with `channel` narrowed to a string literal). We don't
    // emit a dedicated data class because the only useful payload is the
    // hard-coded channel value and a typed `AhpCommands.ping(...)` helper can
    // construct the request without forcing consumers through a wrapper.
    // Matches the Swift generator's handling.
    'PingParams',
    'ActionType',                   // emitted directly by generateActionsFile(), not via STATE_ENUMS
    'ChangesetOperationTargetKind', // discriminator enum embedded in the hand-rolled ChangesetOperationTarget union
    'StringOrMarkdown',              // generateStringOrMarkdown()
    'ToolCallState',                // TOOL_CALL_STATE_UNION discriminated union
    'StateAction',                  // StateAction enum in generateActionsFile()
    'ActionEnvelope',               // generateDataClassFromInterface() call in generateActionsFile()
    'ActionOrigin',                 // generateDataClassFromInterface() call in generateActionsFile()
    'ResponsePart',                 // RESPONSE_PART_UNION discriminated union
    'ToolResultContent',            // generateToolResultContentUnion()
    'SessionToolCallApprovedAction', // merged into SessionToolCallConfirmedAction
    'SessionToolCallDeniedAction',   // merged into SessionToolCallConfirmedAction
    'SessionToolCallConfirmedAction', // emitted as merged variant
    'TerminalClaim',                // TERMINAL_CLAIM_UNION discriminated union
    'TerminalContentPart',           // TERMINAL_CONTENT_PART_UNION discriminated union
    'ChatInputQuestion',         // CHAT_INPUT_QUESTION_UNION discriminated union
    'ChatInputAnswerValue',      // CHAT_INPUT_ANSWER_VALUE_UNION discriminated union
    'ChatInputAnswer',           // CHAT_INPUT_ANSWER_UNION discriminated union
    'ChatOrigin',                // hand-generated union for inline variants
    'ChatToolCallApprovedAction', // merged into ChatToolCallConfirmedAction
    'ChatToolCallDeniedAction',   // merged into ChatToolCallConfirmedAction
    'ChatToolCallConfirmedAction', // emitted as merged variant
    'ChatAction',                // source-only union covered by StateAction
    'MessageAttachment',            // MESSAGE_ATTACHMENT_UNION discriminated union
    'MessageAttachmentBase',        // base interface, flattened into the variant data classes via `extends`
    'Customization',                // CUSTOMIZATION_UNION discriminated union
    'ChildCustomization',           // CHILD_CUSTOMIZATION_UNION discriminated union
    'McpServerState',              // MCP_SERVER_STATUS_UNION discriminated union
    'ToolCallContributor',          // TOOL_CALL_CONTRIBUTOR_UNION discriminated union
    'ChildCustomizationType',       // TS subset alias of CustomizationType; consumers reuse CustomizationType
    'CustomizationLoadState',       // CUSTOMIZATION_LOAD_STATE_UNION discriminated union
    'AuthRequiredErrorData',        // emitted by generateErrorsFile()
    'PermissionDeniedErrorData',    // emitted by generateErrorsFile()
    'UnsupportedProtocolVersionErrorData', // emitted by generateErrorsFile()
    'AhpError',                     // typed via JsonRpcError; not a Kotlin data class
    'AhpErrorDetailsMap',           // type-level mapping; not a Kotlin type
    'AhpErrorCode',                 // type-level alias over AhpErrorCodes const enum
    'AhpErrorCodeWithData',         // type-level alias; not a Kotlin type
    'JsonRpcErrorCode',             // type-level alias over JsonRpcErrorCodes const enum
    'ReconnectResult',              // RECONNECT_RESULT_UNION discriminated union
    'ChangesetOperationTarget',     // generateChangesetOperationTargetKotlin()
  ]);

  const missing = [...imported].filter(n => !coveredByLists.has(n) && !knownSpecial.has(n));
  if (missing.length > 0) {
    throw new Error(
      `generate-kotlin.ts exhaustiveness check failed.\n` +
      `The following types are exported from the protocol source modules but are not covered by the Kotlin generator:\n` +
      missing.map(n => `  - ${n}`).join('\n') + '\n\n' +
      `Add them to the appropriate list in scripts/generate-kotlin.ts:\n` +
      `  STATE_STRUCTS / STATE_ENUMS, COMMAND_STRUCTS / COMMAND_ENUMS,\n` +
      `  NOTIFICATION_STRUCTS / NOTIFICATION_ENUMS, ACTION_VARIANTS,\n` +
      `  or knownSpecial if they are generated via a non-list code path.`
    );
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

function generateVersionFile(project: Project): string {
  const { current, supported } = readProtocolVersions(project);

  const items = supported.map((v) => `    ${JSON.stringify(v)},`).join('\n');

  return (
    '// Generated from types/*.ts — do not edit\n\n' +
    `package ${PACKAGE}\n\n` +
    '/**\n' +
    ' * Current protocol version (SemVer `MAJOR.MINOR.PATCH`).\n' +
    ' */\n' +
    `public const val PROTOCOL_VERSION: String = ${JSON.stringify(current)}\n\n` +
    '/**\n' +
    ' * Every protocol version this library is willing to negotiate, ordered\n' +
    ' * most-preferred-first. The first entry equals [PROTOCOL_VERSION].\n' +
    ' *\n' +
    ' * Pass this list (or a derived `List<String>`) as `protocolVersions` on\n' +
    ' * `InitializeParams` so the same client binary can fall back to older\n' +
    " * protocol versions if the host doesn't accept the newest one.\n" +
    ' */\n' +
    'public val SUPPORTED_PROTOCOL_VERSIONS: List<String> = listOf(\n' +
    items +
    '\n)\n'
  );
}

export function generateKotlinPackage(project: Project, outputDir: string): void {
  // Reset generator state so back-to-back invocations are deterministic.
  requiredPartialStructs.clear();
  void PACKAGE; // exported for future docs / re-export use; reference avoids unused warning.

  checkExhaustiveness(project);

  const generatedDir = path.join(
    outputDir,
    'src', 'main', 'kotlin', 'com', 'microsoft', 'agenthostprotocol', 'generated',
  );
  fs.mkdirSync(generatedDir, { recursive: true });

  fs.writeFileSync(path.join(generatedDir, 'State.generated.kt'), generateStateFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Actions.generated.kt'), generateActionsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Commands.generated.kt'), generateCommandsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Notifications.generated.kt'), generateNotificationsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Errors.generated.kt'), generateErrorsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Messages.generated.kt'), generateMessagesFile());
  fs.writeFileSync(path.join(generatedDir, 'Version.generated.kt'), generateVersionFile(project));
}
