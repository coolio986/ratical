# Glossary

Terms and acronyms used across Ratical, in plain language.

| Term | Meaning |
|---|---|
| **Ratical** | This project: a standalone Klipper/Kalico printer stack (configurator + configuration + installer) that runs on stock Raspberry Pi OS with no dependency on any external Ratical/RatOS server. |
| **Klipper** | The 3D-printer firmware that runs on the Raspberry Pi (host) and talks to the printer's control board (MCU). |
| **Kalico** | A community fork of Klipper (formerly "Danger-Klipper"), maintained by [KalicoCrew](https://github.com/KalicoCrew/kalico). Ratical targets Kalico. Its klippy code is a Python **package** (`from klippy import …`), which is why several compatibility patches exist (step 36). |
| **KIAUH** | *Klipper Installation And Update Helper* ([dw-0/kiauh](https://github.com/dw-0/kiauh)). You use it to install the **base** (Kalico + Moonraker + Mainsail) **before** running Ratical's installer. |
| **Moonraker** | The API server that sits between the web UIs (Mainsail, the configurator) and Klipper. Handles the database, `update_manager`, webcam, etc. |
| **Mainsail** | The main print-management web UI (`http://<pi>/`). Ratical themes it and seeds its macro-card layout. |
| **Configurator** | Ratical's own Next.js web app (`http://<pi>/configure/`). Runs the setup wizard, VAOC, and input-shaper analysis, and **generates** your Klipper config. |
| **`ratical` CLI** | The command-line side of the configurator (`bin/ratical.mjs`): flashing, G-code post-processing, registering klippy extensions. Installed to `/usr/local/bin/ratical`. |
| **klippy** | The host-side Python half of Klipper/Kalico (lives in `klipper/klippy/`). **Extensions** go in `klippy/extras/`, kinematics in `klippy/kinematics/`. |
| **klippy extension** | A Ratical Python module (`configuration/klippy/*.py`) that plugs into klippy — e.g. `ratical_homing.py`, `beacon_mesh.py`. It is *registered* and then *symlinked* into the klipper checkout so Kalico loads it. |
| **kinematics** | The motion model (CoreXY, cartesian, IDEX…). Ratical ships `ratical_hybrid_corexy.py` for hybrid-CoreXY / IDEX printers. |
| **MCU** | *Microcontroller Unit* — the printer's control board (e.g. BTT Octopus) or toolboard, running Klipper firmware. Also the Pi itself runs a "host MCU" (`klipper_mcu`) for GPIO pins. |
| **Control board** | The main MCU that drives the steppers/heaters (e.g. BTT Octopus 1.1). Defined under `configuration/boards/<id>/`. |
| **Toolboard** | A small MCU on the toolhead (e.g. BTT EBB42) for the hotend, part fan, accelerometer, endstop. Also a `boards/<id>/` entry. |
| **`board-definition.json`** | The metadata the wizard reads for a board: pin map (`motorSlots`), driver count, firmware options, flash instructions, images. |
| **`config.cfg`** (in a board dir) | The `[board_pins …]` alias block Klipper includes so config can refer to logical pin names (`x_step_pin`) instead of raw MCU pins (`PF13`). |
| **`printer-definition.json`** | The metadata for a printer model: bed sizes, speed limits, default hardware selection, and which generator `template` to use. |
| **printer template** | A per-model TypeScript generator in `configurator/src/templates/printers/*.ts` (e.g. `v-core-4.ts`), named by the `template` field in the printer definition. |
| **`Ratical.cfg`** | The **generated** Klipper config the wizard writes into `printer_data/config/`. Your `printer.cfg` `[include]`s it. Do not hand-edit it. |
| **`printer.cfg`** | The top-level Klipper config. Yours. Safe to edit — this is where you put overrides. Seeded once from a template, then never overwritten. |
| **`overrides.cfg` / `user-hooks.cfg`** | The user-safe macro edit points in `configuration/macros/`. |
| **VAOC** | *Visual Assisted Offset Calibration* — the camera-based toolhead/nozzle-offset alignment in the configurator's `/calibration` page. Uses an MJPEG webcam stream. |
| **IDEX** | *Independent Dual EXtruder* — two independently-moving X carriages. Ratical supports it via `ratical_hybrid_corexy.py` + `dual_carriage`. |
| **Hybrid CoreXY** | A CoreXY where one axis can be split off (for IDEX or a second toolhead). Ratical's custom kinematics. |
| **Beacon** | An eddy-current bed probe ([beacon3d](https://github.com/beacon3d/beacon_klipper)). Needs a valid proximity **model** before full `G28`/Z homing works. Ratical adds mesh/heat-soak/zero-correction helpers around it. |
| **step-servo** | A closed-loop stepper (servo) that needs ~500 ms after enable before it accepts steps — hence `servo_enable_delay.py` (dwell before homing). |
| **Input-shaper analysis** | Resonance measurement + shaper recommendation. Ratical's `/analysis` page uses [Linear Movement Analysis](https://github.com/worksasintended/klipper_linear_movement_analysis) + uPlot charts (SciChart was removed for licensing). |
| **`update_manager`** | The Moonraker mechanism that updates software from a git repo. Ratical bakes a single `[update_manager ratical]` tracking `~/ratical`. |
| **on-demand wake** | nginx uses an `auth_request` to `ratical-ondemand` so the configurator and webcam only start when you open `/configure` or `/webcam`, then idle-stop — important on a 1 GB Pi. |
| **`config/Ratical`** | A symlink `printer_data/config/Ratical → ~/ratical/configuration`, so `[include Ratical/...]` in Klipper config resolves to this repo. Created by step 20's `setup.sh`. |
| **`RK_*` variables** | Installer configuration in `config.env` (e.g. `RK_USER`, `RK_ROOT`, `RK_CONFIG`). `RK` = Ratical-Kalico. |
| **mono-repo** | This repo bundles the configurator, the configuration, the theme, and the installer together — nothing is cloned at install time. `~/ratical` on the Pi == this repo. |
| **prebuilt `build/`** | The compiled Next.js output, **committed** to the repo because the 1 GB Pi cannot run `next build` without running out of memory. |
</content>
