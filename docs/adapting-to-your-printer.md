# Adapting Ratical to Your Printer

This is the start-to-finish path for getting Ratical running on **your** machine — whether
it's already bundled, close to a bundled one, or completely new. It ties together the
per-area guides; follow the links when you hit a step that needs detail.

> **Read [ARCHITECTURE.md](./ARCHITECTURE.md) first.** The single most important fact: most
> "make it work for my printer" work is **adding data files** (board + printer definitions
> that are auto-discovered), not writing code.

---

## 0. Decide which case you're in

| Your situation | Effort | Jump to |
|---|---|---|
| My exact board **and** printer are already bundled | Just install + run the wizard | §2 |
| My board is bundled, my **printer** isn't (but is similar) | Add a printer *data* folder reusing a template | §4 |
| My **board** isn't bundled | Add a board folder | §3 |
| My printer needs new kinematics / generation logic | New template + rebuild | §4 + [configurator.md](./modifying/configurator.md) |

Check what's bundled:

```bash
ls configuration/boards      # control boards + toolboards
ls configuration/printers    # printer models
```

---

## 1. Install the base + Ratical (everyone does this)

1. **Flash Raspberry Pi OS (64-bit)**, user **`pi`**, enable SSH.
2. **Install the base with KIAUH** — Kalico (not stock Klipper) + Moonraker + Mainsail:
   ```bash
   cd ~ && git clone https://github.com/dw-0/kiauh.git && ./kiauh/kiauh.sh
   ```
   In KIAUH: set the Klipper repo to Kalico (`https://github.com/KalicoCrew/kalico.git`,
   branch `main`), install Klipper, Moonraker, Mainsail. **Say NO to Mainsail-Config** —
   Ratical provides the config.
3. **Install Ratical:**
   ```bash
   git clone https://github.com/coolio986/ratical.git ~/ratical
   cd ~/ratical && ./install.sh
   ```

If your board/printer are already bundled, skip to §2. Otherwise do §3/§4 **before** running
the wizard (you can re-run `./install.sh 30` after adding files).

---

## 2. Run the wizard (bundled hardware)

1. Open `http://<printer-ip>/configure/`.
2. Pick your **control board**, **toolboard(s)**, **printer model + size**, and the default
   hardware (extruder, hotend, probe, endstops). The defaults come from your printer's
   `printer-definition.json`.
3. Finish — the wizard **generates `Ratical.cfg`** into `printer_data/config/`.
4. **Flash the MCUs** (control board + toolboards) from the wizard or with `make flash`.
5. Bring the machine up:
   ```text
   G28 X Y
   BEACON_RATICAL_CALIBRATE          # bed clear — creates the proximity model
   G28                                # full home (needs a valid Beacon model)
   Z_TILT_ADJUST                      # if multi-Z
   ```
   Then a bed mesh. See §6 for the common Beacon error.
6. VAOC (nozzle-offset camera calibration): `http://<printer-ip>/configure/calibration`.
   Analysis: `.../configure/analysis`.

That's it for bundled hardware. §3–§5 are only if you're adding hardware.

---

## 3. Add your control board / toolboard

Full detail: **[modifying/boards.md](./modifying/boards.md).** In short:

```bash
cp -r configuration/boards/<closest> configuration/boards/my-board
cd configuration/boards/my-board
# 1) rename the .rules (serial + SYMLINK = my-board) and per-file paths in compile.sh/flash.sh
# 2) edit board-definition.json: id=my-board, name, driverCount, motorSlots pins
# 3) edit config.cfg: remap [board_pins] aliases to your board's pins (keep alias NAMES)
# 4) generate firmware.config:  (on the Pi)  cd ~/klipper && make menuconfig ; cp .config .../firmware.config
python3 -c "import json;json.load(open('board-definition.json'));print('ok')"
cd ~/ratical && ./install.sh 30      # relinks udev; board now appears in the wizard
```

The `id` **must equal the folder name**, and bad JSON makes the wizard silently skip the
board — validate first.

---

## 4. Add your printer

Full detail: **[modifying/printers.md](./modifying/printers.md).** Reusing an existing
template (no rebuild) is the easy path:

```bash
cp -r configuration/printers/<closest> configuration/printers/my-printer
cd configuration/printers/my-printer && mv <closest>.cfg my-printer.cfg
# edit printer-definition.json: name, sizes, bedMargin, speedLimits, defaults, template
# edit my-printer.cfg + size cfgs (300/400/500) for your bed + limits
python3 -c "import json;json.load(open('printer-definition.json'));print('ok')"
cd ~/ratical && ./install.sh 30
```

If your kinematics differ from every bundled template, you'll write a new
`templates/printers/my-printer.ts` and **rebuild the configurator on a dev PC** (the Pi
can't build) — see [modifying/configurator.md](./modifying/configurator.md) §4.

---

## 5. Printer-specific tuning (macros, extensions)

- Behavior tweaks → **macros**: put overrides in `configuration/macros/overrides.cfg`, custom
  start/end logic in `user-hooks.cfg`. No rebuild. See
  [modifying/macros-and-klippy-extensions.md](./modifying/macros-and-klippy-extensions.md).
- New firmware behavior → a **klippy extension**: add the `.py`, then
  `./install.sh 80 && RESTART`.
- Step-servo axes need `[servo_enable_delay]` (`./install.sh 70` prints the block).

**Never edit files headed `# WARNING. DO NOT EDIT THIS FILE.`** — your changes go in the
top-level `printer.cfg`, `overrides.cfg`, or `user-hooks.cfg`, all of which survive updates.

---

## 6. Common first-run issues

| Symptom | Cause / fix |
|---|---|
| Board doesn't appear in the wizard | `id` ≠ folder name, or invalid `board-definition.json`. Validate; run `./install.sh 30`. |
| `/dev/<board>` missing | udev rule not loaded — `./install.sh 30` (or reboot). |
| Printer doesn't appear | Invalid `printer-definition.json`, or its `template` names a `.ts` not built into the app. |
| `G28` (Z) fails: *"Toolhead stopped below model range"* | Beacon proximity model is stale/out-of-domain. Recover: `BEACON_MODEL_REMOVE NAME=default` then `BEACON_RATICAL_CALIBRATE`, then `G28`. |
| `G28` "Internal error" after a Kalico update | klippy API drift — re-run `./install.sh 30 36`; the API check + compat patches self-heal. |
| Config changes in the UI don't apply | You edited `configurator/src` source without rebuilding — see [configurator.md](./modifying/configurator.md). |
| Shaper/belt graphs fail (`No module named 'cffi'`) | `./install.sh 36` installs `cffi`/`pygam` into `klippy-env`. |

---

## 7. Commit + update loop

Once your hardware works, commit your board/printer folders so Moonraker's `update_manager`
(and a fresh reinstall) keep them:

```bash
cd ~/ratical
git add configuration/boards/my-board configuration/printers/my-printer
git commit -m "feat: add my board + printer"
git push          # to your own fork; set RK_GH_OWNER accordingly
```

Updates: Moonraker "Update", or `cd ~/ratical && git pull && ./install.sh`. Idempotent steps
+ the compat layer make updates self-healing.

---

## Where to go deeper

- Whole-repo map & data flow → [ARCHITECTURE.md](./ARCHITECTURE.md)
- Boards → [modifying/boards.md](./modifying/boards.md)
- Printers → [modifying/printers.md](./modifying/printers.md)
- Macros & klippy extensions → [modifying/macros-and-klippy-extensions.md](./modifying/macros-and-klippy-extensions.md)
- Configurator → [modifying/configurator.md](./modifying/configurator.md)
- Installer → [modifying/installer.md](./modifying/installer.md)
- Terms → [glossary.md](./glossary.md)
</content>
