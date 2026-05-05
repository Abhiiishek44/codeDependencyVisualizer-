/**
 * Standardized output format for all language parsers.
 * Every parser MUST return data conforming to these types.
 */

export interface ParsedFunction {
  /** Unique ID: `filePath:functionName` */
  id: string;
  /** Function name (cleaned, trimmed) */
  name: string;
  /** Names of functions called within this function */
  calls: string[];
}

export interface ParsedImport {
  /** The module/file being imported */
  source: string;
  /** Specific symbol imported, or null for default/namespace imports */
  target: string | null;
}

export interface ParsedData {
  /** Absolute file path */
  file: string;
  /** Functions declared in this file */
  functions: ParsedFunction[];
  /** Import statements in this file */
  imports: ParsedImport[];
}
