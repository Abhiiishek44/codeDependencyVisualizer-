import neo4j from "neo4j-driver";
import "./env";

const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "password";

export const neo4jDriver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  {
    maxConnectionPoolSize: 10,
    connectionAcquisitionTimeout: 30_000,
  }
);

export const verifyNeo4jConnection = async () => {
  try {
    await neo4jDriver.verifyConnectivity();
    console.log("Neo4j connection established");
    await initConstraints();
  } catch (error) {
    console.error("Neo4j connection failed", {
      uri: NEO4J_URI,
      user: NEO4J_USER,
      error,
    });
    throw error;
  }
};

const initConstraints = async () => {
  const session = neo4jDriver.session();
  try {
    await session.run(`CREATE CONSTRAINT file_id IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE;`);
    await session.run(`CREATE CONSTRAINT function_id IF NOT EXISTS FOR (fn:Function) REQUIRE fn.id IS UNIQUE;`);
    console.log("Neo4j constraints initialized");
  } catch (error) {
    console.error("Failed to initialize Neo4j constraints", error);
  } finally {
    await session.close();
  }
};