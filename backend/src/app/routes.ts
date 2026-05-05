import { Router } from "express";
import { getGraph } from "../modules/graph/graph.controller";

export const router = Router();

/**
 * Graph API — drill-down visualization
 *
 * GET /graph?level=architecture        → all files + imports
 * GET /graph?level=file&file=<path>    → functions in a file
 * GET /graph?level=function&file=<path> → call graph for functions
 */
router.get("/graph", getGraph);
