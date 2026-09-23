import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, runOrThrow } from "./exec.js";
import { STATE_DIR } from "./config.js";

const LABEL = "dev.pr-reviewer";
const BIN = fileURLToPath(new URL("../bin/pr-reviewer.js", import.meta.url));
const NODE = process.execPath;
const LOG = join(STATE_DIR, "listener.log");
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const UNIT = join(homedir(), ".config", "systemd", "user", "pr-reviewer.service");

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function installService() {
  if (BIN.includes("_npx")) {
    console.log("⚠ You're running via npx. Install globally first (npm install -g pr-reviewer) so the service has a stable path.");
  }
  mkdirSync(STATE_DIR, { recursive: true });
  // Services start with a minimal PATH; capture the current one so git, gh and claude are found.
  const path = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";

  if (process.platform === "darwin") {
    mkdirSync(dirname(PLIST), { recursive: true });
    writeFileSync(
      PLIST,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(NODE)}</string><string>${xml(BIN)}</string><string>start</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xml(path)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
</dict>
</plist>
`,
    );
    await run("launchctl", ["unload", PLIST]);
    await runOrThrow("launchctl", ["load", "-w", PLIST]);
    console.log(`Installed LaunchAgent ${PLIST}`);
    console.log("It starts at login and restarts if it crashes. It stops while the Mac sleeps;");
    console.log("to prevent that, adjust Energy settings or run `caffeinate -s` in a terminal.");
  } else if (process.platform === "linux") {
    mkdirSync(dirname(UNIT), { recursive: true });
    writeFileSync(
      UNIT,
      `[Unit]
Description=pr-reviewer Slack listener
After=network-online.target

[Service]
ExecStart="${NODE}" "${BIN}" start
Environment="PATH=${path}"
Restart=always
RestartSec=10
StandardOutput=append:${LOG}
StandardError=append:${LOG}

[Install]
WantedBy=default.target
`,
    );
    await runOrThrow("systemctl", ["--user", "daemon-reload"]);
    await runOrThrow("systemctl", ["--user", "enable", "--now", "pr-reviewer.service"]);
    console.log(`Installed systemd user service ${UNIT}`);
    console.log("To keep it running while you're logged out: loginctl enable-linger $USER");
  } else {
    throw new Error("install-service supports macOS and Linux. On Windows, install pr-reviewer inside WSL.");
  }
  console.log(`Logs: ${LOG}`);
}

export async function uninstallService() {
  if (process.platform === "darwin") {
    if (existsSync(PLIST)) {
      await run("launchctl", ["unload", "-w", PLIST]);
      rmSync(PLIST);
    }
    console.log("Removed LaunchAgent.");
  } else if (process.platform === "linux") {
    await run("systemctl", ["--user", "disable", "--now", "pr-reviewer.service"]);
    if (existsSync(UNIT)) rmSync(UNIT);
    await run("systemctl", ["--user", "daemon-reload"]);
    console.log("Removed systemd user service.");
  } else {
    throw new Error("no service to remove on this platform.");
  }
}
