import { ParsedData, ParsedFunction } from "./parser.types";
import { logger } from "../config/logger";

/**
 * Clean a function name: trim whitespace, remove leading dots/symbols.
 */
const cleanName = (name: string): string =>
  name.trim().replace(/^[.\-_#@!]+/, "");

/**
 * Check if a function entry is valid (non-empty name after cleaning).
 */
const isValidFunction = (fn: ParsedFunction): boolean => {
  const cleaned = cleanName(fn.name);
  if (!cleaned) {
    logger.warn(`[normalizer] Skipping function with invalid name: "${fn.name}" (id: ${fn.id})`);
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

  for (const fn of data.functions) {
    if (!isValidFunction(fn)) continue;

    const cleanedName = cleanName(fn.name);
    const cleanedId = `${data.file}:${cleanedName}`;

    // Deduplicate by ID
    if (seenIds.has(cleanedId)) {
      logger.warn(`[normalizer] Duplicate function ID skipped: "${cleanedId}"`);
      continue;
    }
    seenIds.add(cleanedId);

    // Clean call references
    const cleanedCalls = fn.calls
      .map(cleanName)
      .filter((c) => c.length > 0);

    normalizedFunctions.push({
      id: cleanedId,
      name: cleanedName,
      calls: [...new Set(cleanedCalls)], // deduplicate calls too
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
