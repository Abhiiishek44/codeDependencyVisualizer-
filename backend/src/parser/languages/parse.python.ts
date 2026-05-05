import Parser from "tree-sitter";
import python from "tree-sitter-python";
import { ParsedData, ParsedFunction, ParsedImport } from "../parser.types";

const parser = new Parser();
parser.setLanguage(python as unknown as Parser.Language);

/**
 * Parse a Python source file and extract functions, imports, and call relationships.
 */
export const parsePython = (filePath: string, code: string): ParsedData => {
  const tree = parser.parse(code);

  const functions: ParsedFunction[] = [];
  const imports: ParsedImport[] = [];
  const callMap = new Map<string, string[]>();

  let currentFunction: string | null = null;

  function walk(node: Parser.SyntaxNode): void {
    // ── Function definitions ──
    if (node.type === "function_definition") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const fnName = nameNode.text.trim();
        if (fnName) {
          const fnId = `${filePath}:${fnName}`;
          callMap.set(fnName, []);

          const prevFunction = currentFunction;
          currentFunction = fnName;

          // Walk children inside this function
          for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child) walk(child);
          }

          functions.push({
            id: fnId,
            name: fnName,
            calls: callMap.get(fnName) ?? [],
          });

          currentFunction = prevFunction;
          return; // Don't walk children again
        }
      }
    }

    // ── Import statements: `import sys`, `import os, json` ──
    if (node.type === "import_statement") {
      for (const child of node.namedChildren) {
        if (child.type === "dotted_name") {
          imports.push({ source: child.text, target: null });
        }
      }
    }

    // ── Import-from statements: `from fastapi import FastAPI` ──
    if (node.type === "import_from_statement") {
      const moduleNode = node.childForFieldName("module");
      if (moduleNode) {
        const moduleName = moduleNode.text;

        // Collect named imports
        const namedImports = node.namedChildren.filter(
          (c) =>
            c.type === "dotted_name" &&
            c.id !== moduleNode.id
        );

        if (namedImports.length > 0) {
          for (const named of namedImports) {
            imports.push({ source: moduleName, target: named.text });
          }
        } else {
          imports.push({ source: moduleName, target: null });
        }
      }
    }

    // ── Function calls ──
    if (node.type === "call" && currentFunction) {
      const functionNode = node.childForFieldName("function");
      if (functionNode) {
        const calledName = functionNode.text.trim();
        if (calledName) {
          const calls = callMap.get(currentFunction);
          if (calls && !calls.includes(calledName)) {
            calls.push(calledName);
          }
        }
      }
    }

    // ── Recurse into children ──
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) walk(child);
    }
  }

  walk(tree.rootNode);

  return { file: filePath, functions, imports };
};