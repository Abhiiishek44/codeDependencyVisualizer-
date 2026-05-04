import Parser from "tree-sitter";
import python from "tree-sitter-python";

const parser = new Parser();
parser.setLanguage(python as unknown as Parser.Language);

export const parsePython = (code: string) => {
  const tree = parser.parse(code);

  const functions: string[] = [];
  const imports: string[] = [];
  const calls: { from: string; to: string }[] = [];

  let currentFunction: string | null = null;

  function walk(node: Parser.SyntaxNode) {
    // 🔹 Function definitions
    if (node.type === "function_definition") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const fnName = nameNode.text;
        functions.push(fnName);

        // Track current function for CALL relationships
        const prevFunction = currentFunction;
        currentFunction = fnName;

        // Walk inside function body
        for (let i = 0; i < node.namedChildCount; i++) {
          const child = node.namedChild(i);
          if (child) walk(child);
        }

        currentFunction = prevFunction;
        return;
      }
    }

    // 🔹 Imports (import x OR from x import y)
    if (node.type === "import_statement") {
      const names = node.namedChildren;

      for (const child of names) {
        if (child.type === "dotted_name") {
          imports.push(child.text); // sys, os
        }
      }
    }

    if (node.type === "import_from_statement") {
      const moduleNode = node.childForFieldName("module");

      if (moduleNode) {
        imports.push(moduleNode.text); // fastapi, pathlib
      }
    }

    // 🔹 Function calls
    if (node.type === "call") {
      const functionNode = node.childForFieldName("function");
      if (functionNode && currentFunction) {
        calls.push({
          from: currentFunction,
          to: functionNode.text
        });
      }
    }

    // 🔁 Traverse children
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