# Ratical Configurator

Next.js provisioning app for Ratical: printer config generation, board identification,
flashing, and the calibration / analysis / VAOC UI. Served at `/configure`, exposes the
`ratical` CLI.

Part of the [Ratical](https://github.com/coolio986/ratical) mono-repo. The prebuilt app
lives in `src/build/`; the installer runs `src/scripts/setup.sh` in place (the Pi never
builds). To rebuild locally, from the repo root run `scripts/build-configurator.sh`.

## Development

Requirements: Linux/WSL, Node 20.x, [pnpm](https://pnpm.io/installation). From `src/`:

```bash
pnpm install
pnpm dev          # dev server
pnpm test         # tests
pnpm typecheck
pnpm lint
```

Copy `.env` to `.env.local` and set the paths for your setup. Most bash scripts assume a
user named `pi` exists (not needed for most work).

Licensed GPL-3.0-or-later. See [`../LICENSE`](../LICENSE) and [`../NOTICE`](../NOTICE).
