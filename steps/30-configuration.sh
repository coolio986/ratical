# 30 — Ratical configuration install (macros, hooks, klippy extensions, printer defs)
# (sourced by install.sh) — requires the configurator up (step 20) so
# `ratical extensions register` works.
#
# NOTE (v2.1.x): config/Ratical is a SYMLINK to the configurator's bundled configuration/,
# created by setup.sh in step 20. We do NOT clone Ratical-configuration here.

RATICAL_CFG_DIR="${RK_CONFIG}/Ratical"
INSTALL="${RATICAL_CFG_DIR}/scripts/ratical-install.sh"
[[ -e "${INSTALL}" ]] || die "config/Ratical not linked (missing ${INSTALL}). Did step 20 run setup.sh? Layout should be: ${RATICAL_CFG_DIR} -> ${RK_ROOT}/configuration"
ok "config/Ratical present -> $(readlink -f "${RATICAL_CFG_DIR}" 2>/dev/null || echo "${RATICAL_CFG_DIR}")"

# Theme (cosmetic mainsail skin) — vendored in-repo at ${RK_ROOT}/theme, symlinked
# to config/.theme. Optional; skipped if not vendored yet (purely cosmetic).
if [[ -d "${RK_ROOT}/theme" ]]; then
  as_user "rm -rf '${RK_CONFIG}/.theme'; ln -s '${RK_ROOT}/theme' '${RK_CONFIG}/.theme'" \
    && ok "theme linked (${RK_CONFIG}/.theme -> ${RK_ROOT}/theme)" \
    || warn "theme symlink failed (non-fatal)"
else
  warn "no vendored theme/ in mono-repo — skipping (cosmetic only)"
fi

# ratical-install.sh will (see configuration/scripts/ratical-common.sh):
#   - write a fresh printer.cfg from templates/initial-printer.template.cfg
#   - symlink board udev rules
#   - install beacon, git hooks, python deps
#   - register klippy extensions via the `ratical` CLI (needs configurator up)
# Workaround: the bundled (deployment) ratical-install.sh reads the printer template from
# "$SCRIPT_DIR/templates" (scripts/templates) but templates live at the repo root.
# Add a compatibility symlink so install_printer_config resolves. (Proper fix: fork.)
REAL_RATICAL="$(readlink -f "${RATICAL_CFG_DIR}")"
if [[ -d "${REAL_RATICAL}/templates" && ! -e "${REAL_RATICAL}/scripts/templates" ]]; then
  as_user "ln -s ../templates '${REAL_RATICAL}/scripts/templates'"
  ok "added scripts/templates -> ../templates compat symlink"
fi

report "Running ratical-install.sh (registers extensions, udev, beacon, hooks)"
if [[ -f "${RK_CONFIG}/printer.cfg" ]] && [[ ! -f "${RK_CONFIG}/printer.cfg.pre-ratical" ]]; then
  warn "existing printer.cfg found — backing up to printer.cfg.pre-ratical"
  as_user "cp '${RK_CONFIG}/printer.cfg' '${RK_CONFIG}/printer.cfg.pre-ratical'"
fi
as_user "bash '${INSTALL}'" || die "ratical-install.sh failed — is the configurator running? (./install.sh 20)"
ok "Ratical configuration installed"

# Extensions are only REGISTERED by ratical-install.sh; they must also be SYMLINKED into
# klipper's klippy/extras + klippy/kinematics so klipper can load them.
report "Materializing registered klippy extensions into klipper (ratical extensions symlink)"
as_user "ratical extensions symlink" || warn "ratical extensions symlink failed — run manually: ratical extensions symlink"
ok "extensions symlinked into klipper"

# The bundled install_udev_rules has a CFG_DIR bug: it creates a single broken symlink
# literally named '*.rules' (unexpanded glob) instead of per-board rules, so /dev/Ratical/*
# and /dev/<board> never appear (breaks flashing + MCU serial paths). Install them right.
report "Installing board udev rules (fixes bundled install_udev_rules bug)"
sudo rm -f "/etc/udev/rules.d/*.rules"
BOARDS_DIR="$(readlink -f "${RATICAL_CFG_DIR}")/boards"
if [[ -d "${BOARDS_DIR}" ]]; then
  for f in "${BOARDS_DIR}"/*/*.rules; do [[ -e "${f}" ]] && sudo ln -sf "${f}" /etc/udev/rules.d/; done
  sudo udevadm control --reload-rules && sudo udevadm trigger --action=add --subsystem-match=tty || true
  ok "board udev rules installed + triggered (/dev/Ratical/* symlinks)"
else
  warn "boards dir not found at ${BOARDS_DIR}"
fi

warn "printer.cfg is now the Ratical TEMPLATE. Your real V-Core 4 IDEX config (from 'Current Configuration/') gets restored in a later step / manually."
