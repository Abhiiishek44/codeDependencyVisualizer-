import Parser from "tree-sitter";
import javascript from "tree-sitter-javascript";

const parser = new Parser();

parser.setLanguage(javascript as unknown as Parser.Language);

export const parseJavaScript = (code: string) => {
  const tree = parser.parse(code);

  const functions: string[] = [];
  const imports: string[] = [];
  const calls: { from: string; to: string }[] = [];

  function walk(node: Parser.SyntaxNode) {
    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        functions.push(nameNode.text);
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) {
        walk(child);
      }
    }
  }

  walk(tree.rootNode);

  return {
    functions,
    imports,
    calls
  };
}; 