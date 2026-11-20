import { Node, Project, SyntaxKind } from 'ts-morph';

/** Read the release's own sidebar without loading its versioned site config. */
export function readDocSidebarSource(config: string): string {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile('config.mts', config);
  const theme = source.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .find((property) => property.getName() === 'themeConfig')
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  const property = theme?.getProperty('sidebar');
  const initializer = property && Node.isPropertyAssignment(property)
    ? property.getInitializer()
    : undefined;
  const sidebar = initializer && Node.isCallExpression(initializer)
    && initializer.getExpression().getText() === 'createVersionedSidebar'
    ? initializer.getArguments()[0]
    : initializer;
  if (!sidebar || !Node.isObjectLiteralExpression(sidebar)) {
    throw new Error('Expected themeConfig.sidebar to be an object or createVersionedSidebar(object).');
  }
  return sidebar.getText();
}
