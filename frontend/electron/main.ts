import { app, BrowserWindow } from "electron";
import path from "path";

let mainWindow: BrowserWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Load Vite dev server
  mainWindow.loadURL("http://localhost:5173");

  // Optional: Open DevTools
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);