import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronApp", {
  platform: process.platform,
});
