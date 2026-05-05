import path from "path";
import { neo4jDriver } from "../../config/neo4j";
import { logger } from "../../config/logger";
import { ParsedData } from "../../parser/parser.types";
import { GraphNode, GraphEdge, GraphResponse } from "./graph.types";
import { mapNode, mapEdge, mapGraphResponse } from "./graph.mapper";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const DEADLOCK_ERROR_CODE = "Neo.TransientError.Transaction.DeadlockDetected";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isDeadlockError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === DEADLOCK_ERROR_CODE;
};

const resolveImportPath = (sourcePath: string, importPath: string): string => {
  if (!importPath.startsWith(".")) return importPath;
  const resolved = path.resolve(path.dirname(sourcePath), importPath);
  return resolved.replace(/\.(js|ts|jsx|tsx)$/, "");
};

// ─────────────────────────────────────────────
// Retry logic
// ─────────────────────────────────────────────

export const runWithRetry = async <T>(
  operation: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> => {
  const { retries = 3, baseDelayMs = 150 } = options;
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (!isDeadlockError(error) || attempt > retries) throw error;
      const delay = baseDelayMs * attempt;
      logger.warn(`Deadlock detected. Retrying in ${delay}ms (attempt ${attempt}/${retries}).`);
      await sleep(delay);
    }
  }
};

// ─────────────────────────────────────────────
// Store graph (write)
// ─────────────────────────────────────────────

/**
 * Store parsed file data into Neo4j.
 * Creates: (File)-[:DECLARES]->(Function), (File)-[:IMPORTS]->(Module), (Function)-[:CALLS]->(Function)
 */
export const storeGraph = async (data: ParsedData): Promise<void> => {
  const session = neo4jDriver.session();
  const tx = session.beginTransaction();
  const filePath = data.file;

  try {
    // 1. Merge File node
    await tx.run(
      `MERGE (f:File {id: $file}) SET f.path = $file`,
      { file: filePath }
    );

    // 2. Clear old relationships from this file
    await tx.run(
      `MATCH (f:File {id: $file})-[r:DECLARES]->() DELETE r`,
      { file: filePath }
    );
    await tx.run(
      `MATCH (f:File {id: $file})-[r:IMPORTS]->() DELETE r`,
      { file: filePath }
    );
    await tx.run(
      `MATCH (fn:Function) WHERE fn.id STARTS WITH $file MATCH (fn)-[r:CALLS]->() DELETE r`,
      { file: filePath }
    );

    // 3. Create Function nodes + DECLARES edges
    for (const fn of data.functions) {
      if (!fn.name || !fn.id) {
        logger.warn(`[graphRepo] Skipping invalid function node: ${JSON.stringify(fn)}`);
        continue;
      }

      await tx.run(
        `
        MERGE (fn:Function {id: $id})
        SET fn.name = $name
        WITH fn
        MATCH (f:File {id: $file})
        MERGE (f)-[:DECLARES]->(fn)
        `,
        { id: fn.id, name: fn.name, file: filePath }
      );

      // 4. Create CALLS edges from this function
      for (const calledName of fn.calls) {
        if (!calledName) continue;
        const targetId = `${filePath}:${calledName}`;

        await tx.run(
          `
          MERGE (f1:Function {id: $from})
          MERGE (f2:Function {id: $to})
          SET f2.name = $toName
          MERGE (f1)-[:CALLS]->(f2)
          `,
          { from: fn.id, to: targetId, toName: calledName }
        );
      }
    }

    // 5. Create Module nodes + IMPORTS edges
    for (const imp of data.imports) {
      if (!imp.source) continue;
      const targetModule = resolveImportPath(filePath, imp.source);

      await tx.run(
        `
        MERGE (f:File {id: $source})
        MERGE (m:Module {name: $module})
        MERGE (f)-[:IMPORTS]->(m)
        `,
        { source: filePath, module: targetModule }
      );
    }

    await tx.commit();
    logger.info(`✅ Stored graph: ${filePath} (${data.functions.length} fns, ${data.imports.length} imports)`);
  } catch (err) {
    try { await tx.rollback(); } catch (rollbackErr) {
      logger.error("⚠️ Rollback error:", rollbackErr);
    }
    logger.error("❌ Error storing graph:", err);
    throw err;
  } finally {
    try { await session.close(); } catch (closeErr) {
      logger.error("⚠️ Session close error:", closeErr);
    }
  }
};

export const storeGraphWithRetry = (data: ParsedData) =>
  runWithRetry(() => storeGraph(data));

// ─────────────────────────────────────────────
// Query graph (read) — drill levels
// ─────────────────────────────────────────────

/**
 * Architecture level: returns all File nodes and their IMPORTS relationships.
 */
export const queryArchitecture = async (): Promise<GraphResponse> => {
  const session = neo4jDriver.session();
  try {
    const result = await session.run(`
      MATCH (f:File)
      OPTIONAL MATCH (f)-[:IMPORTS]->(m:Module)
      RETURN f.id AS fileId, f.path AS filePath, m.name AS moduleName
    `);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const record of result.records) {
      const fileId = record.get("fileId") as string;
      const filePath = record.get("filePath") as string;
      const moduleName = record.get("moduleName") as string | null;

      nodes.push({ id: fileId, label: filePath, type: "file" });

      if (moduleName) {
        nodes.push({ id: `module:${moduleName}`, label: moduleName, type: "module" });
        edges.push(mapEdge(fileId, `module:${moduleName}`, "IMPORTS"));
      }
    }

    return mapGraphResponse(nodes, edges);
  } finally {
    await session.close();
  }
};

/**
 * File level: returns functions declared in a specific file.
 */
export const queryFileLevel = async (filePath: string): Promise<GraphResponse> => {
  const session = neo4jDriver.session();
  try {
    const result = await session.run(
      `
      MATCH (f:File {id: $file})-[:DECLARES]->(fn:Function)
      OPTIONAL MATCH (fn)-[:CALLS]->(target:Function)
      RETURN f.id AS fileId, f.path AS filePath,
             fn.id AS fnId, fn.name AS fnName,
             target.id AS targetId, target.name AS targetName
      `,
      { file: filePath }
    );

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const record of result.records) {
      const fileId = record.get("fileId") as string;
      const fnId = record.get("fnId") as string;
      const fnName = record.get("fnName") as string;
      const targetId = record.get("targetId") as string | null;
      const targetName = record.get("targetName") as string | null;

      nodes.push({ id: fileId, label: fileId, type: "file" });
      nodes.push({ id: fnId, label: fnName, type: "function" });
      edges.push(mapEdge(fileId, fnId, "DECLARES"));

      if (targetId && targetName) {
        nodes.push({ id: targetId, label: targetName, type: "function" });
        edges.push(mapEdge(fnId, targetId, "CALLS"));
      }
    }

    return mapGraphResponse(nodes, edges);
  } finally {
    await session.close();
  }
};

/**
 * Function level: returns the full call graph for functions in a file.
 */
export const queryFunctionLevel = async (filePath: string): Promise<GraphResponse> => {
  const session = neo4jDriver.session();
  try {
    const result = await session.run(
      `
      MATCH (f:File {id: $file})-[:DECLARES]->(fn:Function)
      OPTIONAL MATCH (fn)-[:CALLS*1..3]->(target:Function)
      RETURN fn.id AS fnId, fn.name AS fnName,
             target.id AS targetId, target.name AS targetName
      `,
      { file: filePath }
    );

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const record of result.records) {
      const fnId = record.get("fnId") as string;
      const fnName = record.get("fnName") as string;
      const targetId = record.get("targetId") as string | null;
      const targetName = record.get("targetName") as string | null;

      nodes.push({ id: fnId, label: fnName, type: "function" });

      if (targetId && targetName) {
        nodes.push({ id: targetId, label: targetName, type: "function" });
        edges.push(mapEdge(fnId, targetId, "CALLS"));
      }
    }

    return mapGraphResponse(nodes, edges);
  } finally {
    await session.close();
  }
};