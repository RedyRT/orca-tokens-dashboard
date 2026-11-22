# Tokens Dashboard for Orca

Standalone Orca port of the Paseo Tokens Dashboard. Requires **Orca desktop 1.4.269 or newer** with isolated plugin frames. No npm install, build step, network service or Paseo installation is required.

## Install

Enable plugins in Orca's **Settings → Plugins** if they are off. To install or update a copy installed from a local folder, run:

```powershell
orca plugin install "D:\GitHub Projects\Orca Tokens Dashboard"
```

Orca reports the access requested and prints the exact command with `--approve <fingerprint>`. Review it and run that command if you trust the source. Orca requires **Full access** because the background worker reads local files.

In **1.1.0**, the dashboard moved from the right sidebar to a regular tab. In an open workspace, select **+ → Tokens Dashboard** in the tab bar. Orca uses an empty temporary `untitled.tokens-dashboard` file to host the view. It stores no usage data. Close the tab normally without saving; to reopen it, select **+ → Tokens Dashboard** again.

## Data and settings

- English by default; switch to Русский in the dashboard tab or the plugin's settings. The active Orca theme applies automatically. The `End of chart period` setting switches between the last matching activity and current time.
- Token, cost, cache, session, and tool charts include local OMP/Pi JSONL history. The default roots are `~/.omp/agent/sessions` and `~/.pi/agent/sessions`; override each with an absolute directory in the plugin settings if the agent stores sessions elsewhere. Workspace filtering uses the directory recorded in the journal.
- The dashboard includes OMP/Pi sessions created outside Orca if their journals are in the same roots. Other agents, remote hosts and WSL-only paths are not collected automatically. This is not Orca's subscription-quota meter.
- On first open, the worker indexes journals and starts watching them. Complete new records update the history through Orca events, without fixed-interval polling. Partial lines are not counted. The plugin reads journals without writing to them; it keeps only an in-memory index of measurements and identifiers. It does not persist prompts or tool inputs/results, read credentials directly, or send telemetry.
- Cost is the estimate in the journal, not an invoice. Cache tokens are included in the input total, not added twice. Unknown measurements remain unknown; the horizontal baseline only connects empty intervals visually. Auxiliary model calls add actual usage, not another conversation response.
- **Codex usage left** uses the optional `omp` CLI on Orca's `PATH` and its existing Codex sign-in. It shows remaining quota by provider window and available reset credits, independently of the history filters. It checks on open, once a minute while visible, on return to the tab, and on Refresh. OMP may serve a cached report; the card shows when OMP last checked it. If a check fails, the last available values stay visible with a warning. Account emails and IDs are not sent to the panel.
  On Windows, use the native `omp.exe` on Orca's `PATH`; the worker does not run shell shims such as `omp.cmd`.

## Checks

```powershell
node --test test/*.test.mjs
orca plugin validate .
```
