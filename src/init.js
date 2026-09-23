import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { DEFAULTS, configPath, readConfigFile, saveConfig } from "./config.js";

const mask = (s) => (s.length > 12 ? `${s.slice(0, 5)}…${s.slice(-4)}` : "****");

export async function runInit() {
  const current = { ...DEFAULTS, ...readConfigFile() };
  // A line iterator works both in a terminal and with piped answers (scripted installs).
  const rl = createInterface({ input: stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question, def = "", { secret = false } = {}) => {
    const shown = def ? ` [${secret ? mask(def) : def}]` : "";
    stdout.write(`${question}${shown}: `);
    const { value, done } = await lines.next();
    if (!stdin.isTTY) stdout.write("\n");
    const answer = done ? "" : value.trim();
    return answer || def;
  };

  console.log("Setting up pr-reviewer. Press Enter to keep the value in brackets.");
  console.log("Need a Slack app? Create one from slack-manifest.yml (see README).\n");

  try {
    const cfg = { ...current };
    cfg.slackBotToken = await ask("Slack bot token (xoxb-...)", current.slackBotToken, { secret: true });
    cfg.slackAppToken = await ask("Slack app-level token (xapp-...)", current.slackAppToken, { secret: true });
    cfg.channelId = await ask("Slack channel ID to watch (starts with C)", current.channelId);
    const orgs = await ask(
      "GitHub orgs/users whose PRs may be reviewed (comma-separated)",
      current.allowedOrgs.join(","),
    );
    cfg.allowedOrgs = orgs.split(",").map((s) => s.trim()).filter(Boolean);
    cfg.skill = await ask("Claude Code skill to run", current.skill);
    cfg.localReposPath = await ask("Local repos base path (optional, for repos in a single folder)", current.localReposPath);
    const localReposStr = await ask(
      "Local repos mapping (org/repo=/path, comma-separated, or empty)",
      Object.entries(current.localRepos).map(([k, v]) => `${k}=${v}`).join(", "),
    );
    cfg.localRepos = {};
    for (const entry of localReposStr.split(",").map(s => s.trim()).filter(Boolean)) {
      const [slug, path] = entry.split("=");
      if (slug && path) cfg.localRepos[slug.trim()] = path.trim();
    }
    cfg.extraInstructions = await ask("Extra instructions for the reviewer (optional)", current.extraInstructions);

    const warnings = [];
    if (cfg.slackBotToken && !cfg.slackBotToken.startsWith("xoxb-")) warnings.push("bot token usually starts with xoxb-");
    if (cfg.slackAppToken && !cfg.slackAppToken.startsWith("xapp-")) warnings.push("app-level token usually starts with xapp-");
    if (cfg.channelId && !/^[CG][A-Z0-9]+$/.test(cfg.channelId)) warnings.push("channel ID looks unusual (expected something like C0123ABCD)");
    if (!cfg.allowedOrgs.length) warnings.push("no allowed orgs set, so every PR link will be ignored");
    for (const w of warnings) console.log(`⚠ ${w}`);

    saveConfig(cfg);
    console.log(`\nSaved to ${configPath()} (readable only by you).`);
    console.log(`Next: run "pr-reviewer doctor", then "pr-reviewer start".`);
  } finally {
    rl.close();
  }
}
