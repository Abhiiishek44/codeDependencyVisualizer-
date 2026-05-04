import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("api", {
  hello: () => "Hello from Electron 👋",
});