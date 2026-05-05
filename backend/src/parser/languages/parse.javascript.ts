import Parser from "tree-sitter";
import javascript from "tree-sitter-javascript";
import { ParsedData, ParsedFunction, ParsedImport } from "../parser.types";

const parser = new Parser();
parser.setLanguage(javascript as unknown as Parser.Language);

/**
 * Parse a JavaScript source file and extract functions, imports, and call relationships.
 */
export const parseJavaScript = (filePath: string, code: string): ParsedData => {
  const tree = parser.parse(code);

  const functions: ParsedFunction[] = [];
  const imports: ParsedImport[] = [];
  const callMap = new Map<string, string[]>();

  let currentFunction: string | null = null;

  /**
   * Extract a function name from various declaration forms.
   */
  function extractFunctionName(node: Parser.SyntaxNode): string | null {
    // function foo() {} 
    if (node.type === "function_declaration" || node.type === "generator_function_declaration") {
      return node.childForFieldName("name")?.text?.trim() || null;
    }

    // class method: foo() {} inside a class body
    if (node.type === "method_definition") {
      return node.childForFieldName("name")?.text?.trim() || null;
    }

    // const foo = () => {} or const foo = function() {}
    if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
      for (let i = 0; i < node.namedChildCount; i++) {
        const declarator = node.namedChild(i);
        if (declarator?.type === "variable_declarator") {
          const value = declarator.childForFieldName("value");
          if (
            value &&
            (value.type === "arrow_function" || value.type === "function_expression")
          ) {
            return declarator.childForFieldName("name")?.text?.trim() || null;
          }
        }
      }
    }

    return null;
  }

  function walk(node: Parser.SyntaxNode): void {
    // ── Function declarations ──
    const fnName = extractFunctionName(node);
    if (fnName) {
      const fnId = `${filePath}:${fnName}:${node.startPosition.row + 1}`;
      callMap.set(fnName, []);

      const prevFunction = currentFunction;
      currentFunction = fnName;

      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) walk(child);
      }

      functions.push({
        id: fnId,
        name: fnName,
        calls: callMap.get(fnName) ?? [],
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });

      currentFunction = prevFunction;
      return;
    }

    // ── Import statements: import X from 'module' ──
    if (node.type === "import_statement") {
      const sourceNode = node.childForFieldName("source");
      const source = sourceNode?.text?.replace(/['"]/g, "").trim();

      if (source) {
        // Check for named imports
        let hasNamedImports = false;
        for (let i = 0; i < node.namedChildCount; i++) {
          const child = node.namedChild(i);
          if (child?.type === "import_clause") {
            for (let j = 0; j < child.namedChildCount; j++) {
              const spec = child.namedChild(j);
              if (spec?.type === "named_imports") {
                for (let k = 0; k < spec.namedChildCount; k++) {
                  const specifier = spec.namedChild(k);
                  if (specifier?.type === "import_specifier") {
                    const importedName = specifier.childForFieldName("name")?.text?.trim();
                    const localName = specifier.childForFieldName("alias")?.text?.trim() || importedName;
                    if (importedName) {
                      imports.push({ source, localName: localName || null, importedName });
                      hasNamedImports = true;
                    }
                  }
                }
              } else if (spec?.type === "identifier") {
                // default import
                imports.push({ source, localName: spec.text.trim(), importedName: "default" });
                hasNamedImports = true;
              } else if (spec?.type === "namespace_import") {
                imports.push({ source, localName: spec.text.trim(), importedName: null });
                hasNamedImports = true;
              }
            }
          }
        }
        if (!hasNamedImports) {
          imports.push({ source, localName: null, importedName: null });
        }
      }
    }

    // ── require() calls: const X = require('module') ──
    if (node.type === "call_expression") {
      const callee = node.childForFieldName("function");
      if (callee?.text === "require") {
        const args = node.childForFieldName("arguments");
        if (args && args.namedChildCount > 0) {
          const firstArg = args.namedChild(0);
          if (firstArg?.type === "string") {
            const source = firstArg.text.replace(/['"]/g, "").trim();
            if (source) {
              imports.push({ source, localName: null, importedName: null });
            }
          }
        }
      }
    }

    // ── Function calls (inside a function context) ──
    if (node.type === "call_expression" && currentFunction) {
      const callee = node.childForFieldName("function");
      if (callee) {
        const calledName = callee.text.trim();
        if (calledName && calledName !== "require") {
          const calls = callMap.get(currentFunction);
          if (calls && !calls.includes(calledName)) {
            calls.push(calledName);
          }
        }
      }
    }

    // ── Recurse ──
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) walk(child);
    }
  }

  walk(tree.rootNode);

  return { file: filePath, functions, imports };
};