# Modifying the Installer

The installer layers Ratical onto a stock Raspberry Pi OS box that already has a KIAUH base
(Kalico + Moonraker + Mainsail). It is plain bash: an orchestrator (`install.sh`) that
sources shared config/helpers and runs numbered step files in order.

> **Prerequisite reading:** [ARCHITECTURE.md §6](../ARCHITECTURE.md#6-install-time-data-flow-what-installsh-actually-does).

---

## 1. The moving parts

| File | Role |
|---|---|
| `install.sh` | Orchestrator. Sources `config.env` + `lib/common.sh`, defines the `STEPS=(…)` array, runs each (optionally filtered by prefix). |
| `config.env` | All configuration: paths (`RK_HOME`, `RK_CONFIG`, `RK_CONFIGURATOR_APP`…), the GitHub owner (`RK_GH_OWNER`), base repo URLs. Sourced by every step. |
| `lib/common.sh` | Shared helpers: `report/ok/warn/die` (colored logging), `as_user` (drop to `pi`), `need_cmd`, `git_ensure` (idempotent clone/fetch), `wait_for_configurator`, `require_not_root` (advisory). |
| `steps/NN-*.sh` | One phase each; **sourced**, not executed, so they share the environment. |

### The steps

| Step | Does |
|---|---|
| `00-system-prep` | apt deps, Node 20, pnpm (system-wide), hardware groups, swap, CPU governor. |
| `10-base-check` | Verify the KIAUH base exists; abort with instructions if not. |
| `20-configurator` | Run the configurator's `setup.sh` in place; start the service; wait for it. Creates the `config/Ratical` symlink. |
| `30-configuration` | Run bundled `ratical-install.sh` (seed printer.cfg, beacon, hooks), symlink klippy extensions, run the Kalico API check, install board udev rules. |
| `35-host-mcu` | Build + install the `klipper_mcu` linux-process host MCU. |
| `36-kalico-compat` | Idempotent Kalico/Trixie compatibility patches (see §4). |
| `40-nginx-proxy` | nginx `/configure` + `/webcam` proxy with on-demand wake. |
| `50-moonraker-wire` | Include the Ratical overlay, verify `[update_manager ratical]`, service perms. |
| `60-extras` | Linear Movement Analysis (powers `/analysis`) + crowsnest. |
| `65-ratical-db-defaults` | Seed Moonraker DB (VAOC camera settings, Mainsail macro cards). |
| `70-servos` | Install the `servo_enable_delay` extension. |
| `80-register-extensions` | Register + symlink **all** bundled klippy extensions (safety net). |
| `90-finalize` | Restart services, leave configurator/crowsnest on-demand, print next steps. |

---

## 2. Running steps

```bash
./install.sh              # all steps in order
./install.sh 20 36        # only steps whose filename starts 20* or 36*
RK_GH_OWNER=youruser ./install.sh
```

The filter matches the **filename prefix**, so `./install.sh 3` runs `30` and `35` and `36`.
Every step is **idempotent** — re-running is safe and is the normal way to apply a fix.

---

## 3. Conventions to follow when editing

- **Every step assumes a sourced environment.** `config.env` and `lib/common.sh` are already
  loaded; use `RK_*` vars and the helpers. Don't `set` pipefail again (the orchestrator does).
- **Log with the helpers:** `report "doing X"`, `ok "done"`, `warn "non-fatal"`,
  `die "fatal"`. Colors and prefixes are consistent.
- **Drop privileges with `as_user "…"`** for anything that writes into the `pi` home or runs
  the CLI. Use bare `sudo` only for system files (systemd units, `/usr/local/bin`,
  `/etc/nginx`).
- **Be idempotent.** Guard with `grep -q`/`[[ -e ]]` before appending/creating. Prefer
  "check → skip if present → else add". Back up before overwriting (`*.pre-<thing>`).
- **Fail loud on real problems, warn on optional ones.** A missing camera is a `warn`; a
  broken klippy API is a `die`.
- **Prove your result.** Where practical, verify after acting (`grep` the patched line,
  check the service is `is-active`, confirm a file exists).

### Add a new step

1. Create `steps/NN-my-step.sh` (pick `NN` for the right order). No shebang needed — it's
   sourced.
2. Add `"NN-my-step.sh"` to the `STEPS=(…)` array in `install.sh` at the right position.
3. Use `report/ok/warn/die` and `as_user`. Make it idempotent.
4. Test in isolation: `./install.sh NN`.

---

## 4. The Kalico/Trixie compat layer (`steps/36`)

This step **rewrites vendored Python at install time** by matching exact source strings
(`sed` / `python str.replace`), then verifies each patch with `grep`/`py_compile` and `die`s
if a patch failed. It covers, among others:

- flat → package imports (`import reactor` → `from klippy import reactor`),
- kinematics API (`supports_dual_carriage`, axis **name** vs **index** handling,
  `clear_homing_state`),
- `ZMesh(...)` losing its `reactor` argument,
- `split_delta_z` minimum, `sweeping_period` default, `log_points` removal,
- Python 3.13 deps (`pygam`, `cffi`) into `klippy-env`,
- forcing shaper/belt graph scripts to run under `klippy-env`.

**Why it's structured this way:** Ratical targets its own klipper fork + Bookworm; on Kalico
+ Debian 13 these break. The patches are idempotent so they survive `git pull` (an update
re-runs step 36).

**The trade-off (see [CODE-REVIEW.md](../CODE-REVIEW.md)):** string-match patching is
brittle — an upstream whitespace/identifier change silently stops a patch from matching, and
the guard then fails the install. The strategic fix is to **fold these edits into the
vendored source** over time, leaving step 36 as a pure verifier. When you do that, keep the
`grep …|| die` guard so drift still fails loudly.

---

## 5. Gotchas

- **`RK_USER` is hardcoded to `pi`.** Many bundled scripts and the configurator `.env` also
  assume `/home/pi`. Changing the user means editing `config.env` **and** the app `.env`
  **and** the bundled board `compile.sh`/`flash.sh`/`.rules` paths. Easier to keep `pi`.
- **Sourced, not executed:** a `return` in a step returns from the source; an `exit`/`die`
  aborts the whole installer. Use `return 0` for "skip this step", `die` for "stop
  everything".
- **The prefix filter is a glob-prefix**, not an exact match (`3` catches `30/35/36`).
- **Editing bundled files the installer patches** (e.g. the configurator's
  `ratical-install.sh`) may conflict with step 30/36 workarounds — check those first; the
  proper fix is usually in the vendored source, with the step reduced to a verifier.
- **On-demand services are intentionally not enabled on boot** (steps 20/60/90 disable them);
  nginx wakes them. Don't "fix" this by enabling them — it defeats the 1 GB-Pi design.
</content>
