import Parser from "tree-sitter";
// tree-sitter-typescript exports { typescript, tsx } sub-grammars
import TypeScriptLanguage from "tree-sitter-typescript";
import { ParsedData, ParsedFunction, ParsedImport } from "../parser.types";

const parser = new Parser();
parser.setLanguage(TypeScriptLanguage.typescript as unknown as Parser.Language);

/**
 * Parse a TypeScript source file and extract functions, imports, and call relationships.
 * TS grammar is a superset of JS grammar — same AST node types apply.
 */
export const parseTypeScript = (filePath: string, code: string): ParsedData => {
  const tree = parser.parse(code);

  const functions: ParsedFunction[] = [];
  const imports: ParsedImport[] = [];
  const callMap = new Map<string, string[]>();

  let currentFunction: string | null = null;

  /**
   * Extract function name from various declaration forms.
   */
  function extractFunctionName(node: Parser.SyntaxNode): string | null {
    if (
      node.type === "function_declaration" ||
      node.type === "generator_function_declaration"
    ) {
      return node.childForFieldName("name")?.text?.trim() || null;
    }

    if (node.type === "method_definition") {
      return node.childForFieldName("name")?.text?.trim() || null;
    }

    // const foo = () => {} | const foo = function() {}
    if (
      node.type === "lexical_declaration" ||
      node.type === "variable_declaration"
    ) {
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
      const fnId = `${filePath}:${fnName}`;
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
      });

      currentFunction = prevFunction;
      return;
    }

    // ── Import statements ──
    if (node.type === "import_statement") {
      const sourceNode = node.childForFieldName("source");
      const source = sourceNode?.text?.replace(/['"]/g, "").trim();

      if (source) {
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
                    const name =
                      specifier.childForFieldName("name")?.text?.trim();
                    if (name) {
                      imports.push({ source, target: name });
                      hasNamedImports = true;
                    }
                  }
                }
              } else if (spec?.type === "identifier") {
                imports.push({ source, target: spec.text.trim() });
                hasNamedImports = true;
              } else if (spec?.type === "namespace_import") {
                imports.push({ source, target: null });
                hasNamedImports = true;
              }
            }
          }
        }

        if (!hasNamedImports) {
          imports.push({ source, target: null });
        }
      }
    }

    // ── Function calls ──
    if (node.type === "call_expression" && currentFunction) {
      const callee = node.childForFieldName("function");
      if (callee) {
        const calledName = callee.text.trim();
        if (calledName) {
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
