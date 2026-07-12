# Ratical

A **standalone, self-contained** Klipper/[Kalico](https://github.com/KalicoCrew/kalico) printer
stack — configurator web app, configuration (macros / klippy extensions / kinematics / board &
printer definitions), and an installer — that runs on **stock Raspberry Pi OS**. Keeps VAOC,
visual calibration, realtime input-shaper analysis, and all macros/hooks.

Everything ships in this one repo — **no runtime or update dependency on any external
configurator, configuration, or theme repository**. Licensed **GPL-3.0-or-later**; see
[`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

## Layout (mono-repo)

```
ratical/
  install.sh              orchestrator (bash) — runs steps/NN-*.sh in order
  config.env              paths + owner; nothing is cloned at install time
  lib/common.sh           shared helpers
  steps/                  00 prep .. 90 finalize
  configuration/          macros, klippy extensions, kinematics, boards, printer defs, moonraker.conf
  configurator/src/       Next.js app — committed prebuilt build/ + bin/ratical.mjs (Pi cannot build)
  scripts/                build-configurator.sh (dev rebuild), ratical-rename.sh
  LICENSE  NOTICE
```

The configurator's prebuilt `build/` is **committed** — the Pi (1 GB) cannot run `next build`
without OOM, so the installer never builds on-device.

## Requirements

1. Raspberry Pi OS (64-bit), user **`pi`** (paths hardcode `/home/pi`), SSH enabled.
2. A KIAUH base with **Klipper set to Kalico**, plus Moonraker + Mainsail:
   ```bash
   cd ~ && git clone https://github.com/dw-0/kiauh.git && ./kiauh/kiauh.sh
   ```

## Install (fresh image)

```bash
git clone https://github.com/coolio986/ratical.git ~/ratical
cd ~/ratical
./install.sh                 # all steps
./install.sh 20 36           # only the named step prefixes
RK_GH_OWNER=youruser ./install.sh
```

Then open `http://<printer-ip>/` (Mainsail) and `http://<printer-ip>/configure/` (Ratical
Configurator). Run the setup wizard to generate `printer.cfg`.

## Steps

| Step | Does |
|---|---|
| 00 | apt deps, Node.js, groups, swap (1 GB Pi) |
| 10 | verify KIAUH base (Kalico + Moonraker + Mainsail) |
| 20 | run vendored configurator `setup.sh` **in place** (pnpm deps, `ratical` CLI, service, udev, symlink `config/Ratical` → `configuration/`) |
| 30 | run `ratical-install.sh` (printer.cfg template, board udev, beacon, hooks), materialize klippy extensions, link theme if vendored |
| 35 | build + install host MCU (`klipper_mcu`) |
| 36 | Kalico + Trixie compat patches (idempotent safety net) |
| 40 | nginx `/configure` proxy + on-demand wake |
| 50 | moonraker: include `Ratical/moonraker.conf`, verify baked `[update_manager ratical]`, service perms |
| 60 | Linear Movement Analysis + crowsnest |
| 65 | seed moonraker DB defaults (VAOC camera settings) |
| 70 | step-servo enable delay |
| 80 | register all bundled klippy extensions |
| 90 | restart + next steps |

## Updating

Managed by moonraker via a single `[update_manager ratical]` git_repo tracking `~/ratical`, or
manually:

```bash
cd ~/ratical && git pull && ./install.sh
```

## Rebuilding the configurator (developers)

Never on the Pi. On a dev machine with node + pnpm:

```bash
scripts/build-configurator.sh
git add configurator/src/build configurator/src/bin && git commit -m "chore: refresh prebuilt configurator"
```

## Homing / Beacon

`G28 X Y` works with step-servos. Full `G28` (Z) needs a valid Beacon proximity model.
`Toolhead stopped below model range` = post-homing samples returned `dist: inf` (reading outside
the saved model). Recovery:

```text
G28 X Y
BEACON_MODEL_REMOVE NAME=default
BEACON_RATICAL_CALIBRATE          # bed clear; writes a new [beacon model default]
G28
```

## License

GPL-3.0-or-later — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
