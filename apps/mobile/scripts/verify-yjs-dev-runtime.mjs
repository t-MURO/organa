import { spawn } from "node:child_process";

const port = process.env.ORGANA_YJS_VERIFY_PORT ?? "8097";
const warning =
  "Yjs was already imported. This breaks constructor checks and will lead to issues!";
const child = spawn(
  "pnpm",
  ["exec", "expo", "start", "--web", "--port", port],
  {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";

child.stdout.on("data", (chunk) => {
  output += chunk;
});
child.stderr.on("data", (chunk) => {
  output += chunk;
});

try {
  await loadRoute("/");
  await loadRoute("/");
  await sleep(800);

  if (output.includes(warning)) {
    throw new Error(`Development runtime emitted: ${warning}`);
  }

  console.log("Yjs development runtime verification passed.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2_000),
  ]);
}

async function loadRoute(path) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok) {
        await response.text();
        return;
      }
    } catch {
      // Metro may not be listening yet.
    }
    await sleep(250);
  }

  throw new Error(`Development runtime did not load ${path}.\n${output}`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
