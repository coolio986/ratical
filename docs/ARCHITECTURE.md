# Ratical Architecture

This document explains **what every part of the repo is, how the pieces talk to each
other, and what happens from `git clone` to a printing machine**. Read it once before you
change anything; the per-area "how to modify" guides in [`docs/modifying/`](./modifying/)
assume you understand the map below.

> **One-line summary:** Ratical is a self-contained Klipper/[Kalico](https://github.com/KalicoCrew/kalico)
> printer stack — a web **configurator** that generates Klipper config, a bundled
> **configuration** (macros + board/printer definitions + custom klippy Python), and a
> bash **installer** that layers it all onto stock Raspberry Pi OS. Nothing is fetched
> from an external Ratical/RatOS server at runtime.

---

## 1. The four layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOUR BROWSER                                                         │
│    http://<pi>/            Mainsail (print UI)                        │
│    http://<pi>/configure/  Ratical Configurator (setup wizard, VAOC, │
│                            input-shaper analysis)                     │
└───────────────┬─────────────────────────────────────────────────────┘
                │ nginx reverse-proxy (steps/40) + on-demand wake
┌───────────────▼─────────────────────────────────────────────────────┐
│  CONFIGURATOR  (configurator/src, a Next.js app on :3000)            │
│    - reads board/printer definitions from configuration/             │
│    - GENERATES printer.cfg / Ratical.cfg into printer_data/config    │
│    - `ratical` CLI (bin/ratical.mjs): flash, postprocess, register   │
└───────────────┬─────────────────────────────────────────────────────┘
                │ writes config files, registers klippy extensions
┌───────────────▼─────────────────────────────────────────────────────┐
│  CONFIGURATION  (configuration/)                                     │
│    macros/*.cfg   boards/<id>/   printers/<id>/   klippy/*.py         │
│    templates/     moonraker.conf                                     │
│    → symlinked into printer_data/config/Ratical and into klipper     │
└───────────────┬─────────────────────────────────────────────────────┘
                │ loaded by
┌───────────────▼─────────────────────────────────────────────────────┐
│  BASE (installed by KIAUH, NOT by this repo)                        │
│    Kalico (klipper fork) + Moonraker + Mainsail + klippy-env         │
└─────────────────────────────────────────────────────────────────────┘
```

The **installer** (`install.sh` + `steps/`) is the glue that wires layers 2–3 onto
layer 4. It never installs the base itself — you install that with KIAUH first.

---

## 2. Repo map

| Path | What it is | Change it when… |
|---|---|---|
| `install.sh` | Orchestrator. Sources `config.env` + `lib/common.sh`, runs `steps/NN-*.sh` in order. | You add/remove/reorder an install step. |
| `config.env` | All paths + the GitHub owner. Sourced by every step. **`RK_USER` is hardcoded to `pi`.** | You change where things live or the repo owner. |
| `lib/common.sh` | Shared bash helpers: `report/ok/warn/die`, `as_user`, `git_ensure`, `wait_for_configurator`. | You need a new shared helper. |
| `steps/00…90` | One file per install phase (see table in `README.md`). | See [`docs/modifying/installer.md`](./modifying/installer.md). |
| `scripts/` | Dev-machine tools: `build-configurator.sh` (rebuild the prebuilt app), `check-klippy-api.py` (Kalico API drift linter), `sync-configurator-upstream.sh`. | You rebuild the app or add a dev tool. |
| `files/` | Assets the installer drops onto the system: `ratical-ondemand-wake.py` (+ its service), `servo_enable_delay.py`. | You change the on-demand daemon or a shipped file. |
| `theme/` | Cosmetic Mainsail skin (logo, macro-card layout in `default.json`, CSS). Symlinked to `config/.theme`. | You restyle Mainsail. |
| `kiauh/` | A vendored copy of KIAUH for convenience. Not part of Ratical proper. | Rarely. |
| **`configuration/`** | The Klipper-side payload. See §3. | See the `docs/modifying/` guides. |
| **`configurator/src/`** | The Next.js web app + `ratical` CLI, with a **committed prebuilt `build/`**. See §4. | See [`docs/modifying/configurator.md`](./modifying/configurator.md). |
| `docs/` | This documentation. | Always, when you change behavior. |
| `LICENSE` / `NOTICE` | GPL-3.0-or-later + upstream attribution. **Do not strip attribution** — the license requires it. | Never remove; add to `NOTICE` if you vendor new GPL code. |

---

## 3. `configuration/` — the Klipper payload

Everything Klipper/Kalico actually loads lives here. At install time it is symlinked to
`printer_data/config/Ratical`, so `[include Ratical/...]` in `printer.cfg` resolves here.

| Subdir | Contents | Notes |
|---|---|---|
| `boards/<id>/` | One directory per control board / toolboard. Holds `board-definition.json` (pin map + metadata the wizard reads), `config.cfg` (the `[board_pins]` aliases Klipper uses), `NN-*.rules` (udev), `firmware.config` (menuconfig), `compile.sh`/`flash.sh`, wiring images. | **Auto-discovered** — see §5. Add a board = add a folder. |
| `printers/<id>/` | One directory per printer model. Holds `printer-definition.json` (sizes, speed limits, default hardware, which template to use), `<id>.cfg` (base machine config), size cfgs (`300.cfg`…), `macros.cfg`, image. | Also auto-discovered. |
| `macros/*.cfg` | The macro library: `calibration`, `mesh`, `parking`, `priming`, `heatsoaking`, `commissioning`, `idex/`, `user-hooks.cfg`, `overrides.cfg`, etc. | `user-hooks.cfg` / `overrides.cfg` are the user-safe edit points. |
| `klippy/*.py` | **Custom klippy extensions** (Python that plugs into Kalico core): `ratical.py`, `ratical_homing.py`, `beacon_*.py`, `named_offsets.py`, `resonance_generator.py`, `kinematics/ratical_hybrid_corexy.py`, etc. | Registered + symlinked into `klipper/klippy/extras` (and `.../kinematics`). See [`docs/modifying/macros-and-klippy-extensions.md`](./modifying/macros-and-klippy-extensions.md). |
| `templates/` | `initial-printer.template.cfg` (seed for a fresh `printer.cfg`) + sensorless-homing snippets. | Only seeds when no `printer.cfg` exists. |
| `hotends/ extruders/ steppers/ z-probe/ sensors/ …` | Hardware fragment libraries the wizard composes from. | JSON/cfg fragments; add a part = add a file. |
| `moonraker.conf` | The Ratical overlay for Moonraker, including the single **baked** `[update_manager ratical]`. | Thin overlay; base `[server]`/`[authorization]` come from KIAUH. |
| `scripts/ratical-install.sh` | The bundled installer the *configurator* ships; step 30 runs it (seeds printer.cfg, udev, beacon, hooks). | Vendored — patched by step 30/36 if needed. |

### How a generated `printer.cfg` is layered

1. The wizard writes `printer.cfg` (top level) which `[include]`s `Ratical.cfg`.
2. `Ratical.cfg` is the **generated** file — it `[include]`s the chosen printer cfg,
   board `config.cfg`, macros, and the klippy-backed sections.
3. Board/printer cfgs start with **`# WARNING. DO NOT EDIT THIS FILE.`** — user overrides
   go in `printer.cfg` (top) or `macros/overrides.cfg`, never in the generated/bundled cfgs.

---

## 4. `configurator/src/` — the web app + CLI

A Next.js 14 (App Router) + tRPC application. It is the brain that turns "I have board X,
toolboard Y, printer Z" into a working `Ratical.cfg`.

| Area | Role |
|---|---|
| `app/` | Next App-Router pages: the setup **wizard**, **calibration** (VAOC visual alignment), **analysis** (realtime input-shaper, uPlot-based), `toolhead/`, `motion/`. |
| `pages/api/` | Legacy API routes (firmware download, debug zip). |
| `server/` | The backend. **`routers/`** = tRPC endpoints (`printer.ts`, `mcu.ts`, `printer.ts`…). **`helpers/`** = the real logic: `klipper-config.ts` (assembles config), `config-generation/` (`toolhead.ts`, `printer.ts`), `metadata.ts` (parses board/printer definitions), `extensions.ts` (register/symlink klippy modules). |
| `zods/` | [Zod](https://zod.dev) schemas = the **contract** for boards, printers, toolheads, hardware, moonraker. Definition JSON is validated against these. |
| `data/` | Static hardware registries: `drivers.ts`, `steppers.ts`, `endstops.ts`, `nozzles.ts`, `fans.tsx`, `accelerometers.ts`. |
| `templates/printers/*.ts` | Per-printer **generator templates** (e.g. `v-core-4.ts`). The `template` field in `printer-definition.json` names one. This is where model-specific config logic lives. |
| `components/` | React UI: `setup-steps/`, `forms/`, `common/`, `ui/` (design-system primitives). |
| `hooks/ recoil/ helpers/ utils/` | Front-end state (Recoil atoms), data-fetching hooks, shared helpers. |
| `cli/` | The `ratical` CLI (`bin/ratical.mjs` is the built bundle): `commands/postprocessor.tsx` (G-code post-processing), `flash`, `update-logs`, extension registration. |
| `moonraker/` | Moonraker API client (websocket/db access). |
| `build/` | **Committed prebuilt output.** The Pi (1 GB) OOMs on `next build`, so the build is done on a dev machine and committed. The installer never builds on-device. |
| `scripts/setup.sh` + `common.sh` | The configurator's own installer (pnpm deps, systemd service, udev, the `config/Ratical` symlink). Run by step 20. `common.sh` derives `BASE_DIR` = the mono-repo root. |

### Runtime environment (`.env`)

The app resolves everything from a handful of env vars (see `configurator/src/.env`):

| Var | Default | Meaning |
|---|---|---|
| `RATICAL_CONFIGURATION_PATH` | `/home/pi/ratical/configuration` | Where board/printer/etc. definitions are read from. |
| `KLIPPER_CONFIG_PATH` | `/home/pi/printer_data/config` | Where generated config is written. |
| `KLIPPER_DIR` / `KLIPPER_ENV` | `/home/pi/klipper` / `klippy-env` | Kalico checkout + its venv. |
| `MOONRAKER_DIR` | `/home/pi/moonraker` | Moonraker checkout. |
| `RATICAL_DATA_DIR` | `/home/pi/printer_data/ratical` | App runtime data. |

---

## 5. How boards & printers are discovered (important!)

There is **no central registry to edit**. The configurator finds hardware by globbing the
filesystem at runtime (`server/routers/printer.ts`):

```
$RATICAL_CONFIGURATION_PATH/boards/*/*-definition.json
$RATICAL_CONFIGURATION_PATH/printers/*/printer-definition.json
```

So **adding a board or printer = dropping a correctly-shaped folder into
`configuration/boards/` or `configuration/printers/`.** Each definition JSON is validated
against the matching Zod schema in `zods/` (and the JSON-schema files next to them,
`board-definition.schema.json` / `printer-definition.schema.json`). If your JSON doesn't
match the schema, the wizard silently skips it — validate against the schema first.

This is the single most important fact for "make it work for my printer": you mostly add
**data files**, not code. Code changes are only needed for genuinely new generation logic
(a new printer template) or new klippy behavior.

---

## 6. Install-time data flow (what `./install.sh` actually does)

1. **00** apt deps, Node 20, pnpm, hardware groups, swap, CPU governor.
2. **10** verify the KIAUH base exists (Kalico + Moonraker + Mainsail). Aborts with
   instructions if not.
3. **20** run the configurator's `setup.sh` **in place**: pnpm deps, install the `ratical`
   CLI, create the systemd service + udev + sudoers, and **symlink `config/Ratical` →
   `configuration/`**. Uses the committed `build/`.
4. **30** run the bundled `ratical-install.sh`: seed `printer.cfg` from template *only if
   absent*, link board udev rules, install beacon + git hooks, register klippy extensions,
   then **symlink extensions into klipper** and run the Kalico API check.
5. **35** build + install the host MCU (`klipper_mcu` linux process).
6. **36** idempotent **Kalico/Trixie compatibility patches** (see the installer guide).
7. **40** nginx `/configure` + `/webcam` proxy with on-demand wake.
8. **50** wire Moonraker (include the overlay, verify `[update_manager ratical]`, perms).
9. **60** extras: Linear Movement Analysis (powers `/analysis`) + crowsnest (webcam).
10. **65** seed Moonraker DB defaults (VAOC camera settings, macro-card layout).
11. **70** step-servo enable-delay extension.
12. **80** register **all** bundled klippy extensions (order-independent safety net).
13. **90** finalize: restart services, leave configurator/crowsnest on-demand, print next
    steps.

Every step is **idempotent** — re-running `./install.sh` (or `./install.sh 65` for one
step) is safe.

---

## 7. Runtime data flow (a print, end to end)

1. You open `/configure/` → nginx `auth_request` wakes `ratical-configurator` (step 40 +
   `ratical-ondemand`).
2. The wizard reads your board/printer definitions, you pick hardware, and the backend
   (`klipper-config.ts` + templates) **writes `Ratical.cfg`**.
3. You flash MCUs (`ratical` CLI or `make flash`), then `G28` / calibrate Beacon /
   `Z_TILT_ADJUST` / bed mesh.
4. Slicer output is post-processed by `ratical postprocess` (adds analysis metadata,
   IDEX handling).
5. Klipper/Kalico runs the print, loading the custom `klippy/*.py` extensions for
   homing, meshing, resonance, VAOC, etc.

---

## 8. Update flow

A single `[update_manager ratical]` in `moonraker.conf` tracks `~/ratical`. Moonraker's
"Update" button (or `cd ~/ratical && git pull && ./install.sh`) pulls the repo and re-runs
the installer. Because every step is idempotent and step 36 re-applies compat patches, an
update self-heals.

---

## Where to go next

- Adapting the whole stack to a printer that isn't already bundled →
  [`docs/adapting-to-your-printer.md`](./adapting-to-your-printer.md)
- Changing one specific area → the guides in [`docs/modifying/`](./modifying/)
- Unfamiliar term → [`docs/glossary.md`](./glossary.md)
</content>
