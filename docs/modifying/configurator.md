# Modifying the Configurator (web app + `ratical` CLI)

The configurator is a **Next.js 14 + tRPC** app in `configurator/src/`. It runs the setup
wizard, VAOC, and input-shaper analysis, and it **generates your Klipper config**. Its
compiled output (`build/`) is **committed** to the repo because the 1 GB Pi cannot run
`next build`.

> **The golden rule:** any change to `configurator/src` source only takes effect on the Pi
> after you **rebuild on a dev machine and commit the new `build/`**. Editing source and
> pulling is not enough. See §4.

> **Prerequisite reading:** [ARCHITECTURE.md §4–§5](../ARCHITECTURE.md#4-configuratorsrc--the-web-app--cli).

---

## 1. Where things live

| You want to change… | Edit here |
|---|---|
| A wizard step / page (UI) | `app/` (App Router): `wizard/`, `calibration/` (VAOC), `analysis/`, `toolhead/`, `motion/`. |
| A React component | `components/` — `setup-steps/`, `forms/`, `common/`, `ui/` (design primitives). |
| **How config is generated** | `server/helpers/klipper-config.ts` (the `KlipperConfigHelper` + section renderers) and `server/helpers/config-generation/` (`toolhead.ts`, `printer.ts`). |
| A per-printer generator | `templates/printers/<name>.ts` (see [printers.md](./printers.md)). |
| The data contract (validation) | `zods/` — `boards.tsx`, `printer.tsx`, `toolhead.tsx`, `hardware.tsx`, `moonraker.tsx`. |
| Static hardware lists | `data/` — `drivers.ts`, `steppers.ts`, `endstops.ts`, `nozzles.ts`, `fans.tsx`, `accelerometers.ts`. |
| A backend endpoint | `server/routers/` (tRPC): `printer.ts`, `mcu.ts`, plus `index.ts`. |
| The `ratical` CLI | `cli/` — `commands/postprocessor.tsx`, `flash`, `update-logs`, `frontend`. |
| Moonraker access | `moonraker/` (API client). |
| Front-end state / data fetching | `recoil/` (atoms), `hooks/`. |
| Runtime paths | `.env` (see §2). |

The definition **schemas** exist twice: as Zod (`zods/`, used at runtime) and as JSON-schema
files next to the data (`board-definition.schema.json`, `printer-definition.schema.json`, for
editor autocomplete). Keep them consistent when you add a field.

---

## 2. Runtime configuration (`.env`)

The app reads everything from env vars (validated by `env/schema.mjs`):

| Var | Default | Meaning |
|---|---|---|
| `RATICAL_CONFIGURATION_PATH` | `/home/pi/ratical/configuration` | Where definitions are read. |
| `KLIPPER_CONFIG_PATH` | `/home/pi/printer_data/config` | Where generated config is written. |
| `KLIPPER_DIR` / `KLIPPER_ENV` | `/home/pi/klipper` / `klippy-env` | Kalico + venv. |
| `MOONRAKER_DIR` | `/home/pi/moonraker` | Moonraker checkout. |
| `RATICAL_DATA_DIR` | `/home/pi/printer_data/ratical` | App data. |
| `RATICAL_SCRIPT_DIR` | `…/configurator/src/scripts` | Bundled scripts. |

**All paths hardcode `/home/pi`.** If you ever move off user `pi`, change `.env` here **and**
`config.env` (`RK_USER`) — see [installer.md](./installer.md).

---

## 3. Develop locally

On a machine with Node 20 + pnpm:

```bash
cd configurator/src
pnpm install
pnpm dev            # Next dev server (hot reload) on :3000
```

Point `.env` at a local copy of `configuration/` (or a mounted Pi). Tests:

```bash
pnpm test           # vitest; see src/__tests__/
```

Type/build check without shipping:

```bash
pnpm build          # next build (this is what OOMs on a Pi — run it on your PC)
```

`next.config.mjs` sets `ignoreBuildErrors` for TS/ESLint, so a green build does **not**
guarantee type-clean code — run `pnpm test` and eyeball `tsc` output too.

---

## 4. Ship a change to the Pi (the rebuild workflow)

```bash
# on your dev PC, from the repo root
scripts/build-configurator.sh
#   → runs `pnpm build` + `pnpm build:cli`, writes configurator/src/build + bin/ratical.mjs
#   → refuses to finish if SciChart wasm sneaks into the build (OSS uses uPlot)

git add configurator/src/build configurator/src/bin   # + any source you changed
git commit -m "chore: refresh prebuilt configurator"
git push
```

Then on the Pi:

```bash
cd ~/ratical && git pull && ./install.sh 20   # 20 re-runs setup.sh in place
```

`./install.sh 20` restarts `ratical-configurator.service`; nginx also auto-wakes it when you
open `/configure/`.

---

## 5. Keeping up with upstream

`scripts/sync-configurator-upstream.sh` helps pull selected changes from the original
RatOS-configurator source. Ratical is **de-branded** — when you sync, keep the rename map in
mind (`RatOS`→`Ratical`, `ratos`→`ratical`, VAOC ids `ratical_vaoc_*`) and never re-introduce
`ratos`/`ratrig` runtime strings. Legal copyright headers stay (GPL requires them).

---

## 6. Gotchas

- **Forgetting to rebuild** is the #1 mistake: source edits do nothing on the Pi until
  `build/` is rebuilt and committed. There is no on-device build.
- **`ignoreBuildErrors`** means `pnpm build` can succeed with type errors — don't treat a
  green build as a type check.
- **The CLI is a separate bundle** (`bin/ratical.mjs` via `build:cli`). If you change
  `cli/`, rebuild the CLI too (the script does both). A past EXDEV bug was fixed in both the
  source *and* the compiled bundle — remember the bundle is what actually runs.
- **New definition field?** Update the Zod schema in `zods/` (runtime validation) *and* the
  JSON-schema file next to the data (editor help). A field only in the JSON-schema won't be
  parsed; a field only in Zod won't autocomplete.
- **Never commit `build/cache/`** (webpack cache, ~700 MB) — it's git-ignored and not needed
  for `next start`.
</content>
