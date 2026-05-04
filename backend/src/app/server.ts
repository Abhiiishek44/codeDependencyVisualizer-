import express from "express";
import cors from "cors";
import http from "http";

// ✅ correct relative import
import { fileWatcher } from "../watcher/fileWatcher";
import { verifyNeo4jConnection } from "../config/neo4j";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// ✅ create server (useful later for socket)
const server = http.createServer(app);

// ✅ set correct project path
const projectPath = "/home/abhishek/SmartReimburse"; 

// ✅ start file watcher
fileWatcher(projectPath);

app.get("/", (req, res) => {
  res.send("Server is running...");
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  verifyNeo4jConnection().catch(() => {
    console.warn("Neo4j connection check failed. Verify NEO4J_* env vars and server status.");
  });
});