import chokidar from "chokidar";
import fs from "fs";
import { parseFile } from "../parser";
import { storeGraphWithRetry } from "../modules/graph/graph.repository";
import { logger } from "../config/logger";

/** Directories/patterns to ignore */
const IGNORE_PATTERN = /node_modules|\.git|dist|venv|__pycache__|\.pyc$|frontend/;

const shouldIgnore = (filePath: string): boolean =>
  IGNORE_PATTERN.test(filePath);

/** Serial promise queue to prevent concurrent Neo4j writes */
let processingQueue = Promise.resolve();

const enqueue = (task: () => Promise<void>): Promise<void> => {
  processingQueue = processingQueue.then(task).catch((error) => {
    logger.error("❌ Queue task failed:", error);
  });
  return processingQueue;
};

/**
 * Watch a project directory for file changes.
 * On add/change, parse the file and store the dependency graph in Neo4j.
 */
export function fileWatcher(projectPath: string): void {
  logger.info(`👁️  Starting file watcher on: ${projectPath}`);

  const watcher = chokidar.watch(projectPath, {
    ignored: IGNORE_PATTERN,
    persistent: true,
    ignoreInitial: false, // process existing files on startup
  });

  const handleFile = async (filePath: string, event: "added" | "changed"): Promise<void> => {
    if (shouldIgnore(filePath)) return;

    try {
      const code = fs.readFileSync(filePath, "utf-8");
      const parsed = parseFile(filePath, code);

      if (!parsed) return; // unsupported file type

      logger.info(
        `📄 File ${event}: ${filePath} → ${parsed.functions.length} fns, ${parsed.imports.length} imports`
      );

      await storeGraphWithRetry(parsed);
    } catch (error) {
      logger.error(`❌ Error processing ${filePath}:`, error);
    }
  };

  watcher.on("add", (filePath) => {
    enqueue(() => handleFile(filePath, "added"));
  });

  watcher.on("change", (filePath) => {
    enqueue(() => handleFile(filePath, "changed"));
  });

  watcher.on("error", (error) => {
    logger.error("❌ Watcher error:", error);
  });
}