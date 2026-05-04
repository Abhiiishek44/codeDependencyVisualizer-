import path from "path";
import { neo4jDriver } from "../../config/neo4j";

const DEADLOCK_ERROR_CODE = "Neo.TransientError.Transaction.DeadlockDetected";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveImportPath = (sourcePath: string, importPath: string) => {
  if (!importPath.startsWith(".")) {
    return importPath;
  }

  const resolved = path.resolve(path.dirname(sourcePath), importPath);
  return resolved.replace(/\.(js|ts|jsx|tsx)$/, "");
};

const cleanFunctions = (functions: any[]) =>
  functions
    .filter((fn) => fn?.name && String(fn.name).trim() !== "")
    .map((fn) => ({
      ...fn,
      name: String(fn.name).trim().replace(/^\./, "")
    }));

const isDeadlockError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string };
  return err.code === DEADLOCK_ERROR_CODE;
};

export const runWithRetry = async <T>(
  operation: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {}
) => {
  const { retries = 3, baseDelayMs = 150 } = options;

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (!isDeadlockError(error) || attempt > retries) {
        throw error;
      }
      const delay = baseDelayMs * attempt;
      console.warn(`Deadlock detected. Retrying in ${delay}ms (attempt ${attempt}/${retries}).`);
      await sleep(delay);
    }
  }
};

export const storeGraph = async (filePath: string, data: any) => {
  const session = neo4jDriver.session();
  const tx = session.beginTransaction();

  try {
    console.log("Parsed Data:", data);
    const functions = cleanFunctions(
      Array.isArray(data?.functions) ? data.functions : []
    );
    const imports = Array.isArray(data?.imports) ? data.imports : [];
    const calls = Array.isArray(data?.calls) ? data.calls : [];

    // 🔹 1. Create File Node
    await tx.run(
      `
      MERGE (f:File {id: $file})
      SET f.path = $file
      `,
      { file: filePath }
    );

    // 🔹 2. Remove old DECLARES relationships (NOT nodes)
    await tx.run(
      `
      MATCH (f:File {id: $file})-[r:DECLARES]->()
      DELETE r
      `,
      { file: filePath }
    );

    // 🔹 3. Create Function Nodes + DECLARES
    for (const fn of functions) {
      const fnName = fn?.name;
      if (!fnName || String(fnName).trim() === "") {
        console.log("Skipping invalid function:", fn);
        continue;
      }
      const fnId = `${filePath}:${fnName}`;

      await tx.run(
        `
        MERGE (fn:Function {id: $id})
        SET fn.name = $name

        WITH fn
        MATCH (f:File {id: $file})
        MERGE (f)-[:DECLARES]->(fn)
        `,
        {
          id: fnId,
          name: fnName,
          file: filePath
        }
      );
    }

    // 🔹 4. Remove old IMPORTS relationships
    await tx.run(
      `
      MATCH (f:File {id: $file})-[r:IMPORTS]->()
      DELETE r
      `,
      { file: filePath }
    );

    // 🔹 5. Create File → Module (IMPORTS)
    for (const imp of imports) {
      const targetModule = resolveImportPath(filePath, imp);

      await tx.run(
        `
        MERGE (f:File {id: $source})
        MERGE (m:Module {name: $module})
        MERGE (f)-[:IMPORTS]->(m)
        `,
        {
          source: filePath,
          module: targetModule
        }
      );
    }

    // 🔹 6. Remove old CALLS relationships (only from this file)
    await tx.run(
      `
      MATCH (fn:Function)
      WHERE fn.id STARTS WITH $file
      MATCH (fn)-[r:CALLS]->()
      DELETE r
      `,
      { file: filePath }
    );

    // 🔹 7. Create Function → Function (CALLS)
    for (const call of calls) {
      const fromId = `${filePath}:${call.from}`;
      const toId = `${filePath}:${call.to}`;

      await tx.run(
        `
        MERGE (f1:Function {id: $from})
        MERGE (f2:Function {id: $to})
        MERGE (f1)-[:CALLS]->(f2)
        `,
        {
          from: fromId,
          to: toId
        }
      );
    }

    await tx.commit();
    console.log("✅ Stored Graph:", filePath);
  } catch (err) {
    try {
      await tx.rollback();
    } catch (rollbackError) {
      console.error("⚠️ Error during rollback:", rollbackError);
    }
    console.error("❌ Error storing graph:", err);
    throw err;
  } finally {
    try {
      await session.close();
    } catch (closeError) {
      console.error("⚠️ Error closing session:", closeError);
    }
  }
};

export const storeGraphWithRetry = (filePath: string, data: any) =>
  runWithRetry(() => storeGraph(filePath, data));