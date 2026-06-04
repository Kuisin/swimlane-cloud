import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import electronPath from "electron";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(scriptDir, "..");
const portFile = path.join(rootDir, ".dev-port");

function waitForUrl(url, attempts = 120) {
  return new Promise((resolve, reject) => {
    let tried = 0;

    function check() {
      http
        .get(url, (response) => {
          response.resume();
          resolve();
        })
        .on("error", () => {
          tried += 1;
          if (tried >= attempts) {
            reject(new Error(`Dev server not ready at ${url}`));
            return;
          }
          setTimeout(check, 250);
        });
    }

    check();
  });
}

async function main() {
  const port = readFileSync(portFile, "utf8").trim();
  const url = `http://localhost:${port}`;

  await waitForUrl(url);
  console.log(`[desktop] launching Electron for ${url}`);

  const electron = spawn(electronPath, [rootDir, "--dev", `--port=${port}`], {
    stdio: "inherit",
    env: { ...process.env, DESKTOP_DEV_PORT: port },
  });

  electron.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error("[desktop]", error.message);
  process.exit(1);
});
