import type { InterfaceDeclaration } from 'ts-morph';

type DocumentedNode = Pick<InterfaceDeclaration, 'getJsDocs' | 'getSourceFile'>;

const STABILITY_LABELS = new Map([
  ['0', 'Deprecated'],
  ['1', 'Experimental'],
  ['1.0', 'Early development'],
  ['1.1', 'Active development'],
  ['1.2', 'Release candidate'],
  ['2', 'Stable'],
  ['3', 'Legacy'],
]);

export function readStability(node: DocumentedNode): { level: string; label: string } | undefined {
  const tags = node.getJsDocs().flatMap(doc => doc.getTags())
    .filter(tag => tag.getTagName() === 'stability');
  if (tags.length === 0) return undefined;
  const level = tags[0].getCommentText()?.trim();
  const label = level === undefined ? undefined : STABILITY_LABELS.get(level);
  if (tags.length !== 1 || level === undefined || label === undefined) {
    throw new Error(
      `${node.getSourceFile().getFilePath()}: expected one @stability annotation with a supported stability level`,
    );
  }
  return { level, label };
}

export function getDocumentation(node: DocumentedNode): string {
  const description = node.getJsDocs()[0]?.getDescription().replace(/\r\n/g, '\n').trim() ?? '';
  const stability = readStability(node);
  if (!stability) return description;
  const marker = `Stability: ${stability.level} - ${stability.label}.`;
  return description ? `${description}\n\n${marker}` : marker;
}
