const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "../dist-electron");
const packageJsonPath = path.join(distDir, "package.json");

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(packageJsonPath, JSON.stringify({ type: "commonjs" }, null, 2));

console.log("Prepared dist-electron/package.json for CommonJS output.");
