// 1. Create constraints to enforce unique IDs
CREATE CONSTRAINT file_id IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT function_id IF NOT EXISTS FOR (fn:Function) REQUIRE fn.id IS UNIQUE;

// 2. Ensure all functions are connected to files using DEFINED_IN
MATCH (f:Function)
MATCH (file:File {path: f.filePath})
MERGE (f)-[:DEFINED_IN]->(file);

// 3. Delete all DECLARES relationships
MATCH ()-[r:DECLARES]->()
DELETE r;

// 4. Clean up duplicate DEFINED_IN relationships
MATCH (a)-[r:DEFINED_IN]->(b)
WITH a, b, collect(r) AS rels
WHERE size(rels) > 1
FOREACH (r IN rels[1..] | DELETE r);

// 5. Add 'type' properties to all nodes for easier filtering
MATCH (f:File) SET f.type = 'file';
MATCH (fn:Function) SET fn.type = 'function';
MATCH (m:Module) SET m.type = 'module';
