import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
export const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "pr-reviewer");
export const STATE_DIR = join(process.env.XDG_STATE_HOME || join(home, ".local", "state"), "pr-reviewer");
export const configPath = () => join(CONFIG_DIR, "config.json");

export const DEFAULTS = {
  slackBotToken: "",
  slackAppToken: "",
  channelId: "",
  allowedOrgs: [],
  skill: "ce-code-review",
  extraInstructions: "",
  localReposPath: "",
  localRepos: {},
  timeoutMinutes: 40,
  // Tools Claude Code may use without asking. Anything else is silently denied,
  // which keeps the run non-interactive and limits what untrusted PR content can trigger.
  allowedTools: [
    "Read",
    "Grep",
    "Glob",
    "Task",
    "Write",
    "Bash(git:*)",
    "Bash(gh pr view:*)",
    "Bash(gh pr diff:*)",
  ],
};

// Environment variables override the config file (handy for CI or containers).
const ENV_OVERRIDES = {
  slackBotToken: "PR_REVIEWER_SLACK_BOT_TOKEN",
  slackAppToken: "PR_REVIEWER_SLACK_APP_TOKEN",
  channelId: "PR_REVIEWER_CHANNEL_ID",
  skill: "PR_REVIEWER_SKILL",
  localReposPath: "PR_REVIEWER_LOCAL_REPOS_PATH",
};

export function readConfigFile() {
  if (!existsSync(configPath())) return {};
  try {
    return JSON.parse(readFileSync(configPath(), "utf8"));
  } catch (err) {
    throw new Error(`could not parse ${configPath()}: ${err.message}`);
  }
}

export function loadConfig({ requireSlack = false } = {}) {
  const cfg = { ...DEFAULTS, ...readConfigFile() };
  for (const [key, envName] of Object.entries(ENV_OVERRIDES)) {
    if (process.env[envName]) cfg[key] = process.env[envName];
  }
  if (process.env.PR_REVIEWER_ALLOWED_ORGS) {
    cfg.allowedOrgs = process.env.PR_REVIEWER_ALLOWED_ORGS.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (requireSlack) {
    const missing = ["slackBotToken", "slackAppToken", "channelId"].filter((k) => !cfg[k]);
    if (missing.length) throw new Error(`missing ${missing.join(", ")}. Run "pr-reviewer init" first.`);
    if (!cfg.allowedOrgs.length) throw new Error(`no allowed GitHub orgs configured. Run "pr-reviewer init" first.`);
  }
  return cfg;
}

export function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  chmodSync(configPath(), 0o600); // tighten even if the file already existed
}
