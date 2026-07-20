# Modifying / Adding a Board

A "board" is any MCU the printer uses: a **control board** (e.g. BTT Octopus) or a
**toolboard** (e.g. BTT EBB42). Both live under `configuration/boards/<id>/` and are
**auto-discovered** — you add hardware by adding a folder, not by editing code.

> **Prerequisite reading:** [ARCHITECTURE.md §3 and §5](../ARCHITECTURE.md#5-how-boards--printers-are-discovered-important).

---

## 1. What a board folder contains

Copy the closest existing board and edit it. Here is the anatomy (control board example,
`boards/btt-octopus-11/`):

| File | Required | Purpose |
|---|---|---|
| `board-definition.json` | **yes** | Metadata the wizard reads: id, name, pin map (`motorSlots`), driver count, firmware options, flash scripts, images. Validated against `boards/board-definition.schema.json`. |
| `config.cfg` | yes (control) | The `[board_pins <alias>]` block Klipper includes. Maps logical names (`x_step_pin`) to raw MCU pins (`PF13`). Toolboards use `toolboard-config.cfg` instead. |
| `NN-<id>.rules` | yes | udev rule creating `/dev/<id>` from the USB serial, and (control boards) running `klipper-mcu-added.sh`. |
| `firmware.config` | yes | A saved Klipper `menuconfig` (`.config`) — MCU model, clock, comms. Used by `compile.sh`. |
| `compile.sh` | yes | Builds firmware: copies `firmware.config` → `klipper/.config`, `make`, copies the `.bin` to `printer_data/config/firmware_binaries/<firmwareBinaryName>`. |
| `flash.sh` | recommended | Flashes the built binary to `/dev/<id>` via `scripts/flash-path.sh`. |
| `make-and-flash-mcu.sh` | optional | Convenience wrapper (compile + flash). |
| `board.webp` | recommended | Board photo shown in the wizard. |
| `wiring.drawio.svg`, `dfubooting.*` | optional | Wiring/boot diagrams surfaced in the UI. |

Toolboards additionally set `"isToolboard": true` in the JSON and ship
`toolboard-config.cfg` (hotend/fan/accel pins) instead of a full `config.cfg`.

---

## 2. `board-definition.json` fields

Required (schema `boards/board-definition.schema.json`): `id`, `name`, `manufacturer`,
`firmwareBinaryName`, `compileScript`, `documentationLink`, `driverCount`.

The most useful optional fields:

| Field | Meaning |
|---|---|
| `id` | **Must equal the folder name.** Used everywhere (`/dev/<id>`, `[include Ratical/boards/<id>/config.cfg]`). |
| `motorSlots` | Per-driver pin map (`MOTOR0…N`): `step/dir/enable/uart(or cs)/diag/endstop` + SPI pins. Drives the wizard's driver assignment UI. |
| `driverCount` | Number of onboard stepper drivers. |
| `driverVoltages` | e.g. `[24]` — used for driver current sanity. |
| `firmwareOptions` | Extra Klipper build flags (e.g. `HIGH_PREC_STEP`) surfaced in the flash step. |
| `flashScript` / `flashInstructions` | Script name + human note (e.g. "SD slot must be empty"). |
| `dfu` | DFU flashing block: `flashDevice` USB id, boot0 jumper info, instructions, image. |
| `stepperSPI` / `ADXL345SPI` / `LIS2DW` | SPI wiring for SPI drivers and accelerometers. |
| `isToolboard` / `isHost` | Marks a toolboard, or the Raspberry Pi host MCU. |
| `hasQuirksFiles` | If true, the generator also includes `boards/<id>/quirks.cfg` (control) / `quirks-toolboard.cfg`. |
| `serialPath` / `disableAutoFlash` | Override the serial device / opt out of auto-flash. |

Get pin values from the **manufacturer's pinout diagram**. The `config.cfg` aliases and the
`motorSlots` pins must agree.

---

## 3. Step-by-step: add a new control board

1. **Copy the closest board:**
   ```bash
   cp -r configuration/boards/btt-octopus-11 configuration/boards/my-board
   cd configuration/boards/my-board
   ```
2. **Rename per-file references** so nothing points back at the original:
   - Rename `98-btt-octopus-11.rules` → `NN-my-board.rules`; inside it set
     `ATTRS{serial}=="my-board"` and `SYMLINK+="my-board"`.
   - In `board-definition.json` set `"id": "my-board"`, `name`, `manufacturer`,
     `firmwareBinaryName` (e.g. `firmware-my-board.bin`), and update the `motorSlots` pin
     map to your board's pinout.
   - In `compile.sh` / `flash.sh` replace every `btt-octopus-11` path and the
     `MCU=/dev/btt-octopus-11` line.
3. **Generate `firmware.config`** on the Pi:
   ```bash
   cd ~/klipper && make menuconfig      # pick your MCU/clock/comms, save
   cp .config ~/ratical/configuration/boards/my-board/firmware.config
   ```
4. **Write `config.cfg`** — the `[board_pins my_board]` alias block. Start from the copied
   Octopus block and remap each `*_pin` to your board's pins. Keep the alias **names** the
   same (`x_step_pin`, `z0_dir_pin`, …); only the pin values change.
5. **Validate the JSON** against the schema (any JSON-schema validator, or just load it —
   the wizard skips definitions that don't parse):
   ```bash
   python3 -c "import json;json.load(open('board-definition.json'));print('ok')"
   ```
6. **Install + test:**
   ```bash
   cd ~/ratical && ./install.sh 30      # relinks udev rules
   ```
   Reopen `/configure/` — your board should appear in the board picker. Plug it in and
   confirm `/dev/my-board` exists (`ls -l /dev/my-board`).

---

## 4. Editing an existing board

- **Pin fix:** edit `config.cfg` (the alias) **and** the matching `motorSlots` entry in the
  JSON. They must stay in sync.
- **Firmware change:** re-run `make menuconfig` and re-copy `firmware.config`, or add a flag
  to `firmwareOptions`.
- **Do not** move overrides into the generated `Ratical.cfg`. Board `config.cfg` files carry
  the `# WARNING. DO NOT EDIT THIS FILE.` header for a reason — user tweaks go in the
  top-level `printer.cfg`.

---

## 5. Gotchas

- **`id` ≠ folder name** → the board silently won't appear. They must match.
- **Bad JSON** → the wizard skips it with no error. Validate first.
- **udev didn't take:** run `./install.sh 30` (relinks + `udevadm trigger`) or reboot; the
  symlink `/dev/<id>` won't exist until the rule loads.
- **`config.cfg` alias names changed:** every printer cfg refers to logical names — if you
  rename an alias you break every printer using this board. Change pin *values*, not
  *names*.
- **SPI drivers / accelerometer:** if your board wires TMC SPI or an ADXL/LIS in hardware,
  fill `stepperSPI` / `ADXL345SPI` / `LIS2DW` so the generator emits the right `spi_*`
  lines.
</content>
