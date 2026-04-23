import { app, BrowserWindow, net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const filePath =
      url.pathname === "/" || url.pathname === ""
        ? path.join(__dirname, "../dist/index.html")
        : path.join(__dirname, "../dist", url.pathname);

    return net
      .fetch(pathToFileURL(filePath).toString())
      .catch(() =>
        net.fetch(
          pathToFileURL(path.join(__dirname, "../dist/index.html")).toString(),
        ),
      );
  });

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

  win.loadURL(loadUrlArg ?? DEV_URL ?? "app://real-router/");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
