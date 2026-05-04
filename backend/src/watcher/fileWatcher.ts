import chokidar from "chokidar";
import fs from "fs";
import { parseJavaScript } from "../parser/languages/javascript";
import { storeGraphWithRetry } from "../modules/graph/graph.repository";
import { parsePython } from "../parser/languages/python";

const shouldIgnore = (filePath: string) =>
    filePath.includes("node_modules") ||
    filePath.includes("dist") ||
    filePath.includes("venv") ||
    filePath.includes(".git");

const parseFile = (filePath: string, code: string) => {
    if (filePath.endsWith(".py")) {
        return parsePython(code);
    }

    if (filePath.endsWith(".js") || filePath.endsWith(".ts")) {
        return parseJavaScript(code);
    }

    return null;
};

let processingQueue = Promise.resolve();

const enqueue = (task: () => Promise<void>) => {
    processingQueue = processingQueue.then(task).catch((error) => {
        console.error("❌ Queue task failed:", error);
    });

    return processingQueue;
};
export function fileWatcher(projectPath: string) {
    const watcher = chokidar.watch(projectPath, {
        ignored: /node_modules|\.git|dist|venv/,
        persistent: true
    });

    const handleFile = async (filePath: string, event: "changed" | "added") => {
        if (shouldIgnore(filePath)) return;

        console.log(`File ${event}: ${filePath}`);
        const code = fs.readFileSync(filePath, "utf-8");
        const parsed = parseFile(filePath, code);

        if (!parsed) return;
        await storeGraphWithRetry(filePath, parsed);
    };

    watcher.on("change", (filePath) => {
        enqueue(() => handleFile(filePath, "changed"));
    });

    watcher.on("add", (filePath) => {
        enqueue(() => handleFile(filePath, "added"));
    });
}