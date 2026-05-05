import { ParsedData } from "./parser.types";
import { parsePython, parseJavaScript, parseTypeScript } from "./languages";
import { normalizeParsedData } from "./normalizer";
import { logger } from "../config/logger";

/** Map of file extensions to parser functions */
const PARSER_MAP: Record<string, (filePath: string, code: string) => ParsedData> = {
  ".py": parsePython,
  ".js": parseJavaScript,
  ".jsx": parseJavaScript,
  ".ts": parseTypeScript,
  ".tsx": parseTypeScript,
};

/** Extensions we support */
const SUPPORTED_EXTENSIONS = Object.keys(PARSER_MAP);

/**
 * Detect language by file extension and route to the correct parser.
 * Returns normalized ParsedData or null if the file type is unsupported.
 */
export const parseFile = (filePath: string, code: string): ParsedData | null => {
  // Find the matching extension
  const ext = SUPPORTED_EXTENSIONS.find((e) => filePath.endsWith(e));

  if (!ext) {
    logger.info(`[parserService] Skipping unsupported file: ${filePath}`);
    return null;
  }

  const parserFn = PARSER_MAP[ext];

  try {
    const rawData = parserFn(filePath, code);
    const normalized = normalizeParsedData(rawData);

    logger.info(
      `[parserService] Parsed ${filePath}: ${normalized.functions.length} functions, ${normalized.imports.length} imports`
    );

    return normalized;
  } catch (error) {
    logger.error(`[parserService] Failed to parse ${filePath}:`, error);
    return null;
  }
};

/**
 * Check if a file extension is supported by the parser system.
 */
export const isSupportedFile = (filePath: string): boolean =>
  SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext));
