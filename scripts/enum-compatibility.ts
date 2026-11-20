import { EnumDeclaration, Project } from 'ts-morph';

export type EnumCompatibility = 'exhaustive' | 'nonexhaustive';

const COMPATIBILITY_TAGS = new Set<EnumCompatibility>(['exhaustive', 'nonexhaustive']);

/**
 * Gets the compatibility contract declared on a protocol enum.
 *
 * A closed enum rejects unknown wire values. An open enum must preserve an
 * unknown raw value so an older client can relay newer protocol data without
 * corruption.
 */
export function getEnumCompatibility(enumDecl: EnumDeclaration): EnumCompatibility {
  const jsDocs = enumDecl.getJsDocs();
  const tags = jsDocs
    .flatMap(doc => doc.getTags())
    .map(tag => tag.getTagName())
    .filter((tag): tag is EnumCompatibility => COMPATIBILITY_TAGS.has(tag as EnumCompatibility));

  if (tags.length !== 1) {
    const location = enumDecl.getSourceFile().getFilePath();
    throw new Error(
      `${location}: enum ${enumDecl.getName()} must declare exactly one of ` +
      '@exhaustive or @nonexhaustive.',
    );
  }

  const mainDoc = jsDocs[0];
  if (
    !mainDoc ||
    !mainDoc.getDescription().trim() ||
    !mainDoc.getTags().some(tag => tag.getTagName() === tags[0])
  ) {
    const location = enumDecl.getSourceFile().getFilePath();
    throw new Error(
      `${location}: enum ${enumDecl.getName()} must have a substantive main enum ` +
      'JSDoc block containing its compatibility annotation.',
    );
  }

  return tags[0];
}

export function isNonexhaustiveEnum(enumDecl: EnumDeclaration): boolean {
  return getEnumCompatibility(enumDecl) === 'nonexhaustive';
}

export function isBitsetEnum(enumDecl: EnumDeclaration): boolean {
  const tagged = enumDecl.getJsDocs()
    .flatMap(doc => doc.getTags())
    .some(tag => tag.getTagName() === 'bitset');
  if (!tagged) return false;

  const valid = enumDecl.getMembers().every(member => {
    const value = member.getValue();
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
  });
  if (!valid) {
    throw new Error(
      `${enumDecl.getSourceFile().getFilePath()}: enum ${enumDecl.getName()} marked @bitset must use uint32 member values.`,
    );
  }
  return true;
}

/** Validates every enum declaration participating in the protocol project. */
export function validateEnumCompatibility(project: Project): void {
  for (const sourceFile of project.getSourceFiles()) {
    for (const enumDecl of sourceFile.getEnums()) {
      getEnumCompatibility(enumDecl);
      isBitsetEnum(enumDecl);
    }
  }
}

function propertyInHierarchy(
  project: Project,
  interfaceName: string,
  propertyName: string,
) {
  for (const sourceFile of project.getSourceFiles()) {
    const interfaceDecl = sourceFile.getInterface(interfaceName);
    if (!interfaceDecl) continue;

    const direct = interfaceDecl.getProperty(propertyName);
    if (direct) return direct;

    for (const base of interfaceDecl.getExtends()) {
      const inherited = propertyInHierarchy(project, base.getExpression().getText(), propertyName);
      if (inherited) return inherited;
    }
  }
  return undefined;
}

function enumByName(project: Project, name: string): EnumDeclaration | undefined {
  for (const sourceFile of project.getSourceFiles()) {
    const enumDecl = sourceFile.getEnum(name);
    if (enumDecl) return enumDecl;
  }
  return undefined;
}

/**
 * Determines whether a discriminated union must preserve an unknown payload
 * from the compatibility annotation of its discriminator enum. Configurations
 * list only their wire variants; this avoids separately maintained open-union
 * lists drifting from the protocol declaration.
 */
export function discriminatedUnionAllowsUnknown(
  project: Project,
  discriminatorField: string,
  variantInterfaceNames: readonly string[],
  fallback = false,
  discriminatorEnumName?: string,
): boolean {
  if (discriminatorEnumName) {
    const enumDecl = enumByName(project, discriminatorEnumName);
    if (!enumDecl) throw new Error(`Cannot find discriminator enum ${discriminatorEnumName}.`);
    return isNonexhaustiveEnum(enumDecl);
  }

  const enumNames = new Set<string>();
  for (const interfaceName of variantInterfaceNames) {
    const property = propertyInHierarchy(project, interfaceName, discriminatorField);
    if (!property) {
      throw new Error(
        `Cannot find ${discriminatorField} discriminator on ${interfaceName} while determining union compatibility.`,
      );
    }

    for (const [, enumName] of property.getTypeNodeOrThrow().getText().matchAll(/\b(\w+)\.\w+/g)) {
      enumNames.add(enumName);
    }
  }

  if (enumNames.size === 0) {
    return fallback;
  }
  if (enumNames.size !== 1) {
    throw new Error(
      `Expected one discriminator enum for ${variantInterfaceNames.join(', ')}; found ${[...enumNames].join(', ') || 'none'}.`,
    );
  }

  const enumName = [...enumNames][0];
  const enumDecl = enumByName(project, enumName);
  if (!enumDecl) {
    throw new Error(`Cannot find discriminator enum ${enumName}.`);
  }
  return isNonexhaustiveEnum(enumDecl);
}
