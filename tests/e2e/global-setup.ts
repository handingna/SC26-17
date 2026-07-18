import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const productionMode = process.env.E2E_MODE === "production"
  || process.env.npm_lifecycle_event === "test:e2e:prod";
const port = productionMode ? 3100 : 3000;
const probeUrl = `http://127.0.0.1:${port}`;

async function isAvailable() {
  try {
    const response = await fetch(probeUrl, { signal: AbortSignal.timeout(2_000) });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function stopServer(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

export default async function globalSetup() {
  // Fast development tests may reuse a developer-owned server. Production
  // acceptance uses a dedicated port and never silently reuses another app.
  if (await isAvailable()) {
    if (productionMode) {
      throw new Error(`Production E2E port ${port} is already in use; refusing to reuse an unknown server.`);
    }
    return;
  }

  const nextCli = resolve("node_modules/next/dist/bin/next");
  const nextArguments = productionMode
    ? [nextCli, "start", "-p", String(port)]
    : [nextCli, "dev", "--webpack", "-p", String(port)];
  const child = spawn(process.execPath, nextArguments, {
    cwd: process.cwd(),
    env: process.env,
    // Ignored streams ensure a crashed/orphaned Next worker cannot keep the
    // Playwright command's captured output pipe open on Windows.
    stdio: "ignore",
    windowsHide: true,
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${productionMode ? "Next.js production" : "Next.js development"} E2E server exited before becoming ready (${child.exitCode}).`);
    }
    if (await isAvailable()) {
      return () => stopServer(child);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  stopServer(child);
  throw new Error(`${productionMode ? "Next.js production" : "Next.js development"} E2E server did not become ready within 120 seconds.`);
}
