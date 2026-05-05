import express from "express";
import cors from "cors";
import http from "http";

import { router } from "./routes";
import { fileWatcher } from "../watcher/fileWatcher";
import { verifyNeo4jConnection } from "../config/neo4j";
import { logger } from "../config/logger";

const app = express();
app.use(cors());
app.use(express.json());

// Mount API routes
app.use(router);

const PORT = process.env.PORT || 5000;

// Create HTTP server (useful later for WebSocket)
const server = http.createServer(app);

// Project path to watch
const projectPath = process.env.PROJECT_PATH || "/home/abhishek/codeDependencyVisualizer";

// Start file watcher
fileWatcher(projectPath);

app.get("/", (_req, res) => {
  res.json({
    status: "running",
    endpoints: {
      "GET /graph?level=architecture": "All files + import edges",
      "GET /graph?level=file&file=<path>": "Functions in a file",
      "GET /graph?level=function&file=<path>": "Call graph for functions",
    },
  });
});

server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  verifyNeo4jConnection().catch(() => {
    logger.warn("Neo4j connection check failed. Verify NEO4J_* env vars and server status.");
  });
});