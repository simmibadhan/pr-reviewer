# pr-reviewer

Post a GitHub pull request link in a Slack channel and pr-reviewer checks out the PR, runs a
Claude Code skill on it (default: `ce-code-review` from the Compound Engineering plugin), and
posts the result as a review comment on the PR. It runs unattended, with no permission prompts.

Runs on macOS and Linux (Windows: use WSL). The machine running the listener must be on.

## Requirements

- Node.js 20+
- [Claude Code](https://docs.claude.com/en/docs/claude-code), logged in (`claude` once)
- [GitHub CLI](https://cli.github.com), logged in (`gh auth login`), with access to the repos
- The skill you want to run. For the default:
  ```bash
  claude plugin marketplace add EveryInc/compound-engineering-plugin
  claude plugin install compound-engineering@every-marketplace
  ```

## Setup

1. **Install**
   ```bash
   npm install -g pr-reviewer
   ```
2. **Create the Slack app.** At https://api.slack.com/apps choose *Create New App → From an app
   manifest* and paste `slack-manifest.yml` (it ships with the package: run
   `cat "$(npm root -g)/pr-reviewer/slack-manifest.yml"`). Then:
   - *Basic Information → App-Level Tokens*: generate one with the `connections:write` scope (`xapp-…`)
   - *Install App*: install to your workspace and copy the Bot token (`xoxb-…`)
   - In Slack, `/invite @pr-reviewer` in the channel you want watched. The channel ID is at the
     bottom of the channel's *About* panel.
3. **Configure and check**
   ```bash
   pr-reviewer init     # tokens, channel, allowed GitHub orgs, skill
   pr-reviewer doctor   # verifies git, gh, claude, the skill, and config
   ```
4. **Try one PR by hand**
   ```bash
   pr-reviewer review https://github.com/your-org/your-repo/pull/123
   ```
5. **Run it**
   ```bash
   pr-reviewer start              # foreground
   pr-reviewer install-service    # or: background, starts at login (launchd / systemd --user)
   ```

## How it behaves

- Only PR links from orgs in `allowedOrgs` are reviewed; everything else is ignored silently.
- Reviews run one at a time. Status is posted in a thread under the Slack message.
- Each commit is reviewed once. A hidden marker in the review body lets other machines running
  pr-reviewer see it too. Push new commits and post the link again for a fresh review, or use
  `pr-reviewer review <url> --force`.
- Reviews are posted with *your* `gh` identity. For a shared setup, log `gh` in as a bot account.

## Configuration

`pr-reviewer config` prints the config file path (`~/.config/pr-reviewer/config.json`, mode 600).
Besides the values `init` asks for, you can edit:

| Key | Default | Meaning |
| --- | --- | --- |
| `localReposPath` | `""` | Base path for local repos (e.g. `/Users/you/Projects`). Looks for repo named same as folder. |
| `localRepos` | `{}` | Map of `org/repo` to exact local path, e.g. `{"acme/app": "/Users/you/code/app"}`. Overrides `localReposPath`. |
| `timeoutMinutes` | `40` | Kill a review that runs longer than this |
| `allowedTools` | read-only tools plus `git` and `gh pr view/diff` | Tools Claude Code may use without asking; everything else is denied |
| `extraInstructions` | `""` | Appended to the prompt, e.g. `Use mode:report-only` or `Focus on security` |

Environment variables override the file: `PR_REVIEWER_SLACK_BOT_TOKEN`, `PR_REVIEWER_SLACK_APP_TOKEN`,
`PR_REVIEWER_CHANNEL_ID`, `PR_REVIEWER_ALLOWED_ORGS` (comma-separated), `PR_REVIEWER_SKILL`,
`PR_REVIEWER_LOCAL_REPOS_PATH`.
The background service reads only the config file, so use `init` if you install the service.

## Security notes

PR content is untrusted input. pr-reviewer limits the damage a malicious PR could do by
restricting Claude Code to the `allowedTools` list (no arbitrary shell, no network tools),
reviewing only allow-listed orgs, and having pr-reviewer itself, not Claude, post to GitHub.
Don't add broad tools like `Bash` to `allowedTools` unless you trust every PR author.

## Troubleshooting

- **Nothing happens when a link is posted:** is the bot invited to the channel, and is the channel
  ID right? Check the log (`~/.local/state/pr-reviewer/listener.log` when run as a service).
- **"Claude produced no review":** run the same PR with `pr-reviewer review <url>` to see output,
  and make sure `claude` works non-interactively (`echo hi | claude -p`).
- **Service can't find `gh` or `claude`:** reinstall the service from a terminal where they're on
  your PATH (`pr-reviewer install-service`), since it captures PATH at install time.
