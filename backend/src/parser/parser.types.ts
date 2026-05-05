/**
 * Standardized output format for all language parsers.
 * Every parser MUST return data conforming to these types.
 */

export interface ParsedFunction {
  /** Unique ID: `filePath:functionName:startLine` */
  id: string;
  /** Function name (cleaned, trimmed) */
  name: string;
  /** Names of functions called within this function */
  calls: string[];
  /** The starting line number in the source file */
  startLine: number;
  /** The ending line number in the source file */
  endLine: number;
}

export interface ParsedImport {
  /** The local variable name the import is bound to */
  localName: string | null;
  /** The original name of the exported symbol, or null for default */
  importedName: string | null;
  /** The raw path string specified in the import statement */
  source: string;
}

export interface ParsedData {
  /** Absolute file path */
  file: string;
  /** Functions declared in this file */
  functions: ParsedFunction[];
  /** Import statements in this file */
  imports: ParsedImport[];
}
