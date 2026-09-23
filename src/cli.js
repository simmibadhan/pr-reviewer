import { readFileSync } from "node:fs";
import { loadConfig, configPath } from "./config.js";
import { runInit } from "./init.js";
import { reviewPr } from "./review.js";
import { startListener } from "./listener.js";
import { runDoctor } from "./doctor.js";
import { installService, uninstallService } from "./service.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `pr-reviewer ${pkg.version}
Review GitHub PRs posted in Slack with a Claude Code skill and post the review on the PR.

Usage:
  pr-reviewer init                  Interactive setup (Slack tokens, channel, allowed orgs, skill)
  pr-reviewer doctor                Check that git, gh, claude and the skill are ready
  pr-reviewer start                 Listen on Slack and review PR links as they're posted
  pr-reviewer review <pr-url>       Review one PR right now (add --force to re-review)
  pr-reviewer install-service       Run the listener in the background at login (macOS/Linux)
  pr-reviewer uninstall-service     Remove the background service
  pr-reviewer config                Print the config file path
  pr-reviewer --version
`;

export async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "init":
      return runInit();
    case "doctor": {
      const ok = await runDoctor(loadConfig());
      if (!ok) process.exitCode = 1;
      return;
    }
    case "start":
      return startListener(loadConfig({ requireSlack: true }));
    case "review": {
      const url = rest.find((a) => !a.startsWith("--"));
      if (!url) throw new Error("usage: pr-reviewer review <pr-url> [--force]");
      const res = await reviewPr(url, loadConfig(), {
        force: rest.includes("--force"),
        log: (m) => console.log(m),
      });
      console.log(res.message);
      if (res.status === "failed") process.exitCode = 1;
      return;
    }
    case "install-service":
      loadConfig({ requireSlack: true }); // fail early if not configured
      return installService();
    case "uninstall-service":
      return uninstallService();
    case "config":
      console.log(configPath());
      return;
    case "-v":
    case "--version":
      console.log(pkg.version);
      return;
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(HELP);
      return;
    default:
      throw new Error(`unknown command "${cmd}". Run "pr-reviewer --help".`);
  }
}
