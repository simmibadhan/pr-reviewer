import { spawn } from "node:child_process";

/** Run a command without a shell. Never throws; resolves with code/stdout/stderr. */
export function run(cmd, args, { cwd, timeoutMs, input } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer = null;
    const done = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
      }, timeoutMs);
    }

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      stderr += err.code === "ENOENT" ? `${cmd}: command not found` : err.message;
      done(-1);
    });
    child.on("close", (code) => done(code));

    child.stdin.on("error", () => {}); // ignore EPIPE if the process exits early
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

export async function runOrThrow(cmd, args, opts) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) {
    const detail = (r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ");
    throw new Error(`${cmd} ${args.slice(0, 2).join(" ")} failed: ${detail}`);
  }
  return r.stdout;
}
