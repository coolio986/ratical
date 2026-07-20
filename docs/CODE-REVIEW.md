# Code Review — Ratical

_Reviewed: 2026-07-19. Scope: installer (`install.sh`, `config.env`, `lib/`, `steps/`),
Ratical-authored helpers (`scripts/`, `files/`), and the custom klippy Python modules.
The vendored configurator UI (`configurator/src/**`) was surveyed structurally, not
line-audited._

## Verdict

The installer and glue code are **high quality**: consistently `set -Eeuo pipefail`,
idempotent, defensive (every risky step has a `die`/`warn` guard), and already
well-commented at the "why" level. Most findings below are documentation drift or
long-term-maintainability notes, not runtime bugs. Nothing here blocks a working install.

Severity legend: **P1** breaks an install/print · **P2** wrong result or trap for the
next maintainer · **P3** cosmetic / doc.

---

## Findings

### P2 — Finalize step prints stale, pre-mono-repo paths
`steps/90-finalize.sh:58-64`

The closing banner tells the user to rebuild with
`BUILD_DIR=…/src/build ./scripts/publish-configurator-deployment.sh` and to sanity-check
`~/ratical-configurator/app/build`. Neither exists in the mono-repo:

- The rebuild script is now `scripts/build-configurator.sh` (see `README.md` "Rebuilding
  the configurator").
- The build now lives at `~/ratical/configurator/src/build`, not
  `~/ratical-configurator/app/build`.

A user who follows the banner will be sent to a missing script and a missing path.
**Fix:** update both strings to the mono-repo equivalents (or drop the publish line —
`build-configurator.sh` already prints the correct commit command).

### P3 — `require_not_root` warns but never enforces
`lib/common.sh:36-38`

The name reads as a hard gate, but the body only `warn`s and returns; `install.sh:18`
calls it and continues even under `sudo`. That is intentional (steps use `sudo -u` where
needed), but the name is a trap for the next maintainer who assumes it aborts. **Fix:**
rename to `warn_if_root` (or add a one-line comment stating it is advisory).

### P3 — Literal-glob `rm` reads like a bug even though it is correct
`steps/30-configuration.sh:70`

```bash
sudo rm -f "/etc/udev/rules.d/*.rules"
```

The quotes make this delete a file *literally* named `*.rules` — which is exactly the
artifact the bundled `install_udev_rules` bug leaves behind (the comment above explains
this). It is correct, but the quoting looks like a mistake at a glance and any editor who
"fixes" it to an unquoted glob would wipe every rules file in the directory. **Fix:** add
an inline `# quoted on purpose: removes the literal '*.rules' file, not a glob` note.

### P3 — Kalico-compat patch layer is string-match fragile (by design)
`steps/36-kalico-compat.sh` (whole file)

This step rewrites vendored Python by matching exact source strings (`sed`/`python
str.replace`) at install time. Every patch is guarded (`die`/`grep` verify), so a missed
match fails loudly rather than silently — good. But it is inherently brittle: an upstream
whitespace or identifier change silently stops a patch from applying, and the guard then
fails the whole install. This is acceptable as a *shim*, but it is technical debt. **Fix
(strategic):** fold these edits into the vendored source so step 36 becomes a no-op safety
net, and document that intent (see `docs/modifying/installer.md`).

### P3 — Core-API detection is a single-string heuristic
`scripts/check-klippy-api.py:36`

`core_uses_int_axis_api()` decides the whole check by looking for the literal
`"for axis in range(3)"` in Kalico's `homing.py`. If Kalico refactors that loop, the
detector returns "legacy" and **silently skips** the compatibility check that exists to
stop a broken `G28` from shipping. **Fix:** broaden the signal (e.g. also accept
`homing_axes = [` list-comprehensions) or log a visible warning when the signal is absent
so the skip is not silent.

### P3 — Bare `except:` in the large klippy modules
`configuration/klippy/ratical.py:183,404,698`, `configuration/klippy/z_offset_probe.py:86`

These catch `BaseException` (including `KeyboardInterrupt`/`SystemExit`). They are inherited
from the upstream RatOS/Helge-Keck modules and mostly wrap best-effort cleanup, so the risk
is low, but they can mask real errors during debugging. **Fix (low priority):** narrow to
`except Exception:` where the intent is "swallow runtime errors."

### P3 — Two open `TODO`s carried from upstream
`configuration/klippy/beacon_adaptive_heat_soak.py:287`,
`configuration/klippy/named_offsets.py:36`

Informational — tracked here so they are not forgotten. Neither affects correctness.

---

## Things done well (keep these patterns)

- **Idempotency everywhere.** Re-running `./install.sh` (or a single step, e.g.
  `./install.sh 65`) is safe: existing `printer.cfg` is reused and backed up, DB seeds skip
  when present, symlinks are recreated, patches verify before/after.
- **Fail loud, fail early.** `check-klippy-api.py` turns a runtime "G28 Internal error"
  into an install-time failure. The host-MCU and shaper-import steps prove their result
  before continuing.
- **On-demand services.** The nginx `auth_request` → `ratical-ondemand` design keeps the
  Next.js app and crowsnest off the boot path — important on a 1 GB Pi.
- **ETXTBSY / EXDEV awareness.** `steps/35` renames the MCU binary into place instead of
  `cp`-over-running; the postprocessor falls back to copy+unlink across devices. These are
  exactly the edge cases that bite on Pi OS.
- **Comment quality.** Existing comments explain *why* (the bundled bug, the OOM
  constraint, the stale-`.pyc` trap), not *what*. New comments added in this pass follow
  the same rule.

## Suggested follow-ups (not blocking)

1. Fix the `steps/90` banner strings (P2 above).
2. Fold `steps/36` patches into vendored source over time; keep the step as a verifier.
3. Add a CI check on a dev machine that runs `bash -n steps/*.sh` +
   `python3 -m py_compile configuration/klippy/**/*.py` so drift is caught before commit.
</content>
</invoke>
