import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./exec.js";
import { configPath } from "./config.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "projects", "shell-snapshots", "todos", "statsig", "debug"]);

/** Look for <name>/SKILL.md anywhere under ~/.claude (user skills and plugin caches). */
function findSkill(name) {
  const stack = [[join(homedir(), ".claude"), 0]];
  while (stack.length) {
    const [dir, depth] = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.name === name && existsSync(join(p, "SKILL.md"))) return p;
      if (depth < 8) stack.push([p, depth + 1]);
    }
  }
  return null;
}

export async function runDoctor(cfg) {
  let ok = true;
  const check = (pass, label, fix) => {
    console.log(`${pass ? "✓" : "✗"} ${label}`);
    if (!pass) {
      ok = false;
      if (fix) console.log(`    → ${fix}`);
    }
  };

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  check(nodeMajor >= 20, `Node.js ${process.versions.node}`, "Node.js 20 or newer is required");

  const git = await run("git", ["--version"]);
  check(git.code === 0, "git installed", "install git");

  const gh = await run("gh", ["auth", "status"]);
  check(gh.code === 0, "GitHub CLI installed and logged in", "install from https://cli.github.com, then run: gh auth login");

  const claude = await run("claude", ["--version"]);
  check(
    claude.code === 0,
    `Claude Code installed${claude.code === 0 ? ` (${claude.stdout.trim()})` : ""}`,
    "npm install -g @anthropic-ai/claude-code, then run `claude` once to log in",
  );

  const skillPath = findSkill(cfg.skill);
  check(
    Boolean(skillPath),
    `skill "${cfg.skill}" found${skillPath ? ` at ${skillPath}` : ""}`,
    cfg.skill === "ce-code-review"
      ? "claude plugin marketplace add EveryInc/compound-engineering-plugin && claude plugin install compound-engineering@every-marketplace"
      : `install the "${cfg.skill}" skill for Claude Code`,
  );

  check(existsSync(configPath()), `config file ${configPath()}`, "run: pr-reviewer init");
  check(Boolean(cfg.slackBotToken && cfg.slackAppToken && cfg.channelId), "Slack tokens and channel set", "run: pr-reviewer init");
  check(cfg.allowedOrgs.length > 0, `allowed orgs: ${cfg.allowedOrgs.join(", ") || "(none)"}`, "run: pr-reviewer init");

  console.log(ok ? "\nAll good. Start with: pr-reviewer start" : "\nFix the items marked ✗ and run doctor again.");
  return ok;
}
