import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function devPortPlugin() {
  return {
    name: "desktop-dev-port",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const port = server.config.server.port;
        writeFileSync(path.join(rootDir, ".dev-port"), String(port));
        console.log(`[desktop] dev server port ${port}`);
      });
    },
  };
}
