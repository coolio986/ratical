# 50 — wire moonraker: include Ratical config, verify the baked single
# [update_manager ratical], grant service permissions.
# (sourced by install.sh)

MOON_TOP="${RK_CONFIG}/moonraker.conf"
MOON_RATICAL="${RK_CONFIG}/Ratical/moonraker.conf"

# 1) top-level moonraker.conf must include Ratical/moonraker.conf
report "Ensuring ${MOON_TOP} includes Ratical/moonraker.conf"
if [[ ! -f "${MOON_TOP}" ]]; then
  as_user "printf '[include Ratical/moonraker.conf]\n' > '${MOON_TOP}'"
  ok "created moonraker.conf with Ratical include"
elif ! grep -q 'include Ratical/moonraker.conf' "${MOON_TOP}"; then
  as_user "sed -i '1i [include Ratical/moonraker.conf]' '${MOON_TOP}'"
  ok "prepended Ratical include"
else
  ok "Ratical include already present"
fi

# 2) update_manager is BAKED into configuration/moonraker.conf as a single
#    [update_manager ratical] git_repo tracking ~/ratical (${RK_GH_OWNER}/ratical).
#    No runtime origin-repoint needed — just sanity-check it survived.
if [[ -f "${MOON_RATICAL}" ]]; then
  if grep -q '^\[update_manager ratical\]' "${MOON_RATICAL}"; then
    ok "[update_manager ratical] present -> $(grep -m1 'origin:' "${MOON_RATICAL}" | tr -d ' ' || true)"
  else
    warn "[update_manager ratical] missing from ${MOON_RATICAL} (unexpected — check the bake)"
  fi
else
  warn "${MOON_RATICAL} not found — did step 30 run?"
fi

# 3) moonraker service-permission allowlist (lets moonraker restart the configurator)
ASVC="${RK_PRINTER_DATA}/moonraker.asvc"
report "Ensuring moonraker.asvc grants ratical-configurator + klipper_mcu"
for svc in klipper_mcu ratical-configurator crowsnest sonar webcamd; do
  if [[ ! -f "${ASVC}" ]] || ! grep -qx "${svc}" "${ASVC}"; then
    as_user "printf '%s\n' '${svc}' >> '${ASVC}'"
  fi
done
ok "moonraker.asvc updated"
