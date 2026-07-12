# 20 — Ratical Configurator (Next.js app on :3000, provides /configure + `ratical` CLI)
# (sourced by install.sh) — uses the PREBUILT deployment branch.
# The deployment layout is: app/ (prebuilt app) + configuration/ (bundled config repo).
# app/scripts/setup.sh does everything: pnpm deps, `ratical` CLI, systemd service, udev
# rules, sudoers, and SYMLINKS config/Ratical -> configuration/ (so step 30 must not clone).

need_cmd node
need_cmd pnpm
# Mono-repo: the configurator is vendored in-repo (${RK_CONFIGURATOR_APP}) with a
# committed prebuilt build/. Nothing is cloned — setup.sh runs in place.

# The configurator bundles configuration/ (incl. klippy kinematics/extensions symlinked into
# klipper). A redeploy updates those .py files, but Python won't reliably invalidate klipper's
# __pycache__ for symlinked, in-place-updated modules — a stale .pyc can then mask the update.
# Clear it so the next klipper (process) restart loads the updated modules.
find "${RK_KLIPPER_DIR}/klippy" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

SETUP="${RK_CONFIGURATOR_APP}/scripts/setup.sh"
[[ -f "${SETUP}" ]] || die "configurator setup.sh not found at ${SETUP} — is the mono-repo intact? (expected vendored configurator/src)"
[[ -d "${RK_CONFIGURATOR_APP}/build" ]] || die "prebuilt configurator build/ missing at ${RK_CONFIGURATOR_APP}/build — the mono-repo must commit the prebuilt build (Pi cannot build; 1GB OOM)"

# Workaround: configurator setup.sh install_cli runs `rm` (no -f) on the CLI path,
# which aborts on a fresh box where /usr/local/bin/ratical doesn't exist yet.
# Ensure a plain file is present so that rm succeeds. (Proper fix: `rm -f` in the fork.)
sudo sh -c 'rm -f /usr/local/bin/ratical; : > /usr/local/bin/ratical'
# A partially-failed setup.sh leaves root-owned /tmp/03*-ratical-configurator-* files
# that then block `touch` on the next run. Clear them so re-runs are clean.
sudo rm -f /tmp/03*-ratical-configurator-* 2>/dev/null || true

report "Running configurator setup.sh (pnpm deps, ratical CLI, service, udev, symlink config)"
# runs as the printer user; refuses root. it uses sudo internally (passwordless).
as_user "bash '${SETUP}'" || die "configurator setup.sh failed — inspect: sudo journalctl -u ratical-configurator -n 100 ; rerun: ./install.sh 20"

report "Starting ratical-configurator.service (install only — nginx auto-wakes later; not enabled on boot)"
sudo systemctl daemon-reload || true
# Do not enable on boot: woken by nginx auth_request → ratical-ondemand on /configure.
sudo systemctl disable ratical-configurator.service 2>/dev/null || true
sudo systemctl restart ratical-configurator.service 2>/dev/null || warn "could not (re)start service via systemctl"

wait_for_configurator

if command -v ratical >/dev/null 2>&1; then
  ok "ratical CLI available: $(command -v ratical)"
else
  warn "ratical CLI not on PATH — step 30 (extension registration) needs it. setup.sh symlinks it to /usr/local/bin/ratical."
fi
