import { Request, Response } from "express";
import { GraphLevel } from "./graph.types";
import {
  queryArchitecture,
  queryFileLevel,
  queryFunctionLevel,
} from "./graph.repository";
import { logger } from "../../config/logger";

/**
 * GET /graph?level=architecture|file|function&file=<filePath>
 *
 * Drill levels:
 *   - architecture: all files + import relationships
 *   - file:         functions within a specific file + their calls
 *   - function:     full call graph for functions in a file (depth up to 3)
 */
export const getGraph = async (req: Request, res: Response): Promise<void> => {
  const level = (req.query.level as GraphLevel) || "architecture";
  const filePath = req.query.file as string | undefined;

  try {
    switch (level) {
      case "architecture": {
        const graph = await queryArchitecture();
        res.json(graph);
        return;
      }

      case "file": {
        if (!filePath) {
          res.status(400).json({ error: "Query parameter 'file' is required for level=file" });
          return;
        }
        const graph = await queryFileLevel(filePath);
        res.json(graph);
        return;
      }

      case "function": {
        if (!filePath) {
          res.status(400).json({ error: "Query parameter 'file' is required for level=function" });
          return;
        }
        const graph = await queryFunctionLevel(filePath);
        res.json(graph);
        return;
      }

      default: {
        res.status(400).json({
          error: `Invalid level: "${level}". Use "architecture", "file", or "function".`,
        });
        return;
      }
    }
  } catch (error) {
    logger.error(`[graphController] Error fetching graph (level=${level}):`, error);
    res.status(500).json({ error: "Internal server error while fetching graph data." });
  }
};
