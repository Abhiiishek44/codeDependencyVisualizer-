import { ParsedData, ParsedFunction } from "./parser.types";
import { logger } from "../config/logger";

/**
 * Clean a function name: trim whitespace, remove leading dots/symbols.
 */
const cleanName = (name: string): string =>
  name.trim().replace(/^[.\-_#@!]+/, "");

/**
 * Common built-in functions / methods to ignore.
 */
const BUILT_IN_FILTERS: Record<string, Set<string>> = {
  js: new Set([
    "console.log", "console.error", "console.warn", "console.info", "console.debug",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "parseInt", "parseFloat", "require",
    "JSON.stringify", "JSON.parse",
    "Array.isArray", "Object.keys", "Object.values", "Object.entries",
    "Promise.resolve", "Promise.reject", "Promise.all",
  ]),
  py: new Set([
    "print", "len", "range", "type", "str", "int", "float", "list", "dict",
    "set", "tuple", "isinstance", "issubclass", "super", "enumerate",
    "zip", "map", "filter", "sorted", "reversed", "abs", "min", "max",
    "sum", "open", "input", "hasattr", "getattr", "setattr",
  ]),
};

const getLanguageFilter = (filePath: string): Set<string> | null => {
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx") || filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
    return BUILT_IN_FILTERS.js;
  }
  if (filePath.endsWith(".py")) {
    return BUILT_IN_FILTERS.py;
  }
  return null;
};

/**
 * Check if a function entry is valid (non-empty name after cleaning, and not a built-in).
 */
const isValidFunction = (fn: ParsedFunction, filterSet: Set<string> | null): boolean => {
  const cleaned = cleanName(fn.name);
  if (!cleaned) {
    logger.warn(`[normalizer] Skipping function with invalid name: "${fn.name}" (id: ${fn.id})`);
    return false;
  }
  if (filterSet && filterSet.has(cleaned)) {
    return false;
  }
  return true;
};

/**
 * Normalize parsed data:
 * - Remove functions with empty/null/whitespace-only names
 * - Trim and clean names + IDs
 * - Deduplicate functions by ID
 * - Clean call references
 */
export const normalizeParsedData = (data: ParsedData): ParsedData => {
  const seenIds = new Set<string>();
  const normalizedFunctions: ParsedFunction[] = [];
  const filterSet = getLanguageFilter(data.file);

  for (const fn of data.functions) {
    if (!isValidFunction(fn, filterSet)) continue;

    const cleanedName = cleanName(fn.name);
    const cleanedId = `${data.file}:${cleanedName}:${fn.startLine}`;

    // Deduplicate by ID
    if (seenIds.has(cleanedId)) {
      logger.warn(`[normalizer] Duplicate function ID skipped: "${cleanedId}"`);
      continue;
    }
    seenIds.add(cleanedId);

    // Clean call references and filter out built-ins
    const cleanedCalls = fn.calls
      .map(cleanName)
      .filter((c) => c.length > 0 && !(filterSet && filterSet.has(c)));

    normalizedFunctions.push({
      id: cleanedId,
      name: cleanedName,
      calls: [...new Set(cleanedCalls)], // deduplicate calls too
      startLine: fn.startLine,
      endLine: fn.endLine
    });
  }

  // Filter out imports with empty sources
  const normalizedImports = data.imports.filter((imp) => {
    if (!imp.source || imp.source.trim() === "") {
      logger.warn(`[normalizer] Skipping import with empty source in ${data.file}`);
      return false;
    }
    return true;
  });

  return {
    file: data.file,
    functions: normalizedFunctions,
    imports: normalizedImports,
  };
};
