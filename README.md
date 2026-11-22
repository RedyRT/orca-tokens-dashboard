# Tokens Dashboard for Orca

Standalone Orca port of the Paseo Tokens Dashboard. Requires **Orca desktop 1.4.269 or newer** with isolated plugin frames. No npm install, build step, network service or Paseo installation is required.

## Install

Enable plugins in Orca's **Settings → Plugins** if they are off. Install from this folder:

```powershell
orca plugin install "D:\GitHub Projects\Orca Tokens Dashboard"
```

Orca reports the access requested and prints the exact command with `--approve <fingerprint>`. Review it and run that command if you trust the source. Orca requires **Full access** because the background worker reads local files. Open **Tokens Dashboard** in Orca's right sidebar, or run:

```powershell
orca plugin open local.tokens-dashboard --panel dashboard
```

## Data and settings

- English by default; switch to Русский in the panel or the plugin's settings. The active Orca theme applies automatically. The `End of chart period` setting switches between the last matching activity and current time.
- Token, cost, cache, session, and tool charts include local OMP/Pi JSONL history. The default roots are `~/.omp/agent/sessions` and `~/.pi/agent/sessions`; override each with an absolute directory in the plugin settings if the agent stores sessions elsewhere. Workspace filtering uses the directory recorded in the journal.
- The dashboard includes OMP/Pi sessions created outside Orca if their journals are in the same roots. Other agents, remote hosts and WSL-only paths are not collected automatically. This is not Orca's subscription-quota meter.
- On first open, the worker indexes journals and starts watching them. Complete new records update the panel through Orca events, without fixed-interval polling. Partial lines are not counted. The plugin reads journals without writing to them; it keeps only an in-memory index of measurements and identifiers. It does not persist prompts or tool inputs/results, launch agents, read credentials, or send telemetry.
- Cost is the estimate in the journal, not an invoice. Cache tokens are included in the input total, not added twice. Unknown measurements remain unknown; the horizontal baseline only connects empty intervals visually. Auxiliary model calls add actual usage, not another conversation response.

## Checks

```powershell
node --test test/history.test.mjs
orca plugin validate .
```
