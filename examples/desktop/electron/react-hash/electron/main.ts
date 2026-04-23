import { app, BrowserWindow } from "electron";
import path from "node:path";

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  const DEV_URL = process.env.VITE_DEV_SERVER_URL;
  const loadUrlArg = process.argv
    .find((a) => a.startsWith("--load-url="))
    ?.slice("--load-url=".length);

  if (loadUrlArg) {
    win.loadURL(loadUrlArg);
  } else if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
