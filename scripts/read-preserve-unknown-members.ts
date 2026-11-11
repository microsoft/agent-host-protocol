import type { InterfaceDeclaration, TypeAliasDeclaration, Project } from 'ts-morph';

/** Fixed-schema objects edited and replaced in full must retain newer fields. */
export function preservesUnknownMembers(node: InterfaceDeclaration | TypeAliasDeclaration): boolean {
  const tags = node.getJsDocs().flatMap(doc => doc.getTags())
    .filter(tag => tag.getTagName() === 'preserveUnknownMembers');
  if (tags.length === 0) return false;
  if (tags.length !== 1 || (tags[0].getCommentText()?.trim() ?? '') !== '') {
    throw new Error(`${node.getName()}: @preserveUnknownMembers must appear once, without a value`);
  }
  return true;
}

/** Inline union variants share the annotation on their containing alias. */
export function aliasPreservesUnknownMembers(project: Project, name: string): boolean {
  const alias = project.getSourceFiles().map(file => file.getTypeAlias(name)).find(node => node !== undefined);
  if (!alias) throw new Error(`Type alias ${name} not found`);
  return preservesUnknownMembers(alias);
}
