import { writeFileSync } from "node:fs";

writeFileSync("dist-electron/package.json", '{"type":"commonjs"}\n');
