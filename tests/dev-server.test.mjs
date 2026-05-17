import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");
const pythonCommand = resolvePythonCommand();

test("dev server generates a live-translator file index for local beta payloads", { timeout: 20000 }, async (t) => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "rpg-translator-dev-server-"));
  t.after(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const payloadRoot = path.join(fixtureRoot, "translator", "4.0.0b4", "live-translator");
  await mkdir(path.join(payloadRoot, "gui"), { recursive: true });
  await mkdir(path.join(payloadRoot, "runtime"), { recursive: true });
  await writeFile(path.join(payloadRoot, "install-manifest.json"), "{}\n");
  await writeFile(path.join(payloadRoot, "version.json"), "{\"version\":\"4.0.0b4\"}\n");
  await writeFile(path.join(payloadRoot, "gui", "index.html"), "<!doctype html>\n");
  await writeFile(path.join(payloadRoot, "runtime", "paths.js"), "export {};\n");

  const server = await startDevServer(fixtureRoot);
  t.after(async () => {
    await stopDevServer(server.process);
  });

  const response = await fetch(
    `http://127.0.0.1:${server.port}/translator/4.0.0b4/live-translator-files.json`,
    { cache: "no-store" },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  assert.deepEqual(await response.json(), {
    files: [
      "gui/index.html",
      "install-manifest.json",
      "runtime/paths.js",
      "version.json",
    ],
  });
});

function resolvePythonCommand() {
  const candidates = [];
  if (process.env.PYTHON) {
    candidates.push({ command: process.env.PYTHON, args: [] });
  }

  candidates.push(
    { command: "python3", args: [] },
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
  );

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [...candidate.args, "--version"],
      { stdio: "ignore" },
    );
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  throw new Error("Python is required to run dev-server tests.");
}

async function startDevServer(directory) {
  const child = spawn(
    pythonCommand.command,
    [
      ...pythonCommand.args,
      "-u",
      path.join(repoRoot, "dev-server.py"),
      "--bind",
      "127.0.0.1",
      "0",
      "--directory",
      directory,
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out starting dev server.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10000);

    const onStdout = (chunk) => {
      stdout += chunk;
      const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (!match) {
        return;
      }

      cleanup();
      resolve(Number(match[1]));
    };

    const onStderr = (chunk) => {
      stderr += chunk;
    };

    const onExit = (code, signal) => {
      cleanup();
      reject(
        new Error(
          `Dev server exited before startup completed (code=${code}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      child.off("error", onError);
    }

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);
  });

  return { port, process: child };
}

async function stopDevServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  await once(child, "exit");
}
