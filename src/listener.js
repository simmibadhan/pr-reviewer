import { extractPrUrls, isAllowed, parsePrUrl, reviewPr } from "./review.js";

const ts = () => new Date().toISOString();
const ICON = { posted: "✅", skipped: "⏭️", failed: "❌" };

export async function startListener(cfg) {
  const { App, LogLevel } = await import("@slack/bolt");
  const app = new App({
    token: cfg.slackBotToken,
    appToken: cfg.slackAppToken,
    socketMode: true, // outbound connection only: no public URL or open port needed
    logLevel: LogLevel.WARN,
  });

  // Reviews run one at a time; new links wait in line.
  let queue = Promise.resolve();
  let pending = 0;
  const enqueue = (job) => {
    pending++;
    queue = queue
      .then(job)
      .catch((err) => console.error(`[${ts()}] job crashed: ${err.stack || err}`))
      .finally(() => pending--);
  };

  app.event("message", async ({ event, client }) => {
    // Ignore other channels, edits/deletes/joins, and bot messages (including our own).
    if (event.channel !== cfg.channelId || event.subtype || event.bot_id) return;

    const urls = extractPrUrls(event.text).filter((u) => isAllowed(parsePrUrl(u), cfg));
    for (const url of urls) {
      const reply = (text) =>
        client.chat
          .postMessage({ channel: event.channel, thread_ts: event.ts, text, unfurl_links: false })
          .catch((err) => console.error(`[${ts()}] Slack post failed: ${err.message}`));

      await reply(pending ? `🕒 Queued ${url} (${pending} ahead)` : `🔍 Reviewing ${url}…`);
      console.log(`[${ts()}] queued ${url}`);

      enqueue(async () => {
        const res = await reviewPr(url, cfg, { log: (m) => console.log(`[${ts()}] ${m}`) });
        console.log(`[${ts()}] ${res.status}: ${res.message}`);
        await reply(`${ICON[res.status]} ${res.message}`);
      });
    }
  });

  await app.start();
  console.log(`[${ts()}] pr-reviewer listening on ${cfg.channelId} for PRs from: ${cfg.allowedOrgs.join(", ")}`);
  console.log(`[${ts()}] skill: ${cfg.skill}. Press Ctrl+C to stop.`);
}
