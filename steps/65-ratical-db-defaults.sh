# 65 — seed Ratical moonraker DB defaults needed by /configure UIs
# (sourced by install.sh). Fresh installs have wizard printer keys but not VAOC
# camera-settings; missing keys spam console errors and can leave calibration UI
# half-initialized.
#
# Moonraker may be briefly unreachable here (e.g. it was just restarted after
# crowsnest edited moonraker.conf), so wait for it and retry the writes. All
# failures are non-fatal — camera settings can also be set in the VAOC UI, and
# this step can be re-run any time: ./install.sh 65

MOON="http://127.0.0.1:7125"

# Wait until moonraker answers (up to ~60s).
wait_for_moonraker() {
  local i
  for i in $(seq 1 30); do
    curl -sf "${MOON}/server/info" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

if ! wait_for_moonraker; then
  warn "moonraker not reachable at ${MOON} after ~60s — skipping VAOC DB seed"
  warn "set camera settings in the VAOC UI, or re-run once moonraker is up: ./install.sh 65"
  return 0 2>/dev/null || true
fi

seed_item() {
  local ns="$1"
  local key="$2"
  local json_value="$3"
  local existing i
  existing="$(curl -sf "${MOON}/server/database/item?namespace=${ns}&key=${key}" 2>/dev/null || true)"
  if echo "${existing}" | grep -q '"value"'; then
    ok "${ns}/${key} already present"
    return 0
  fi
  report "Seeding ${ns}/${key}"
  for i in 1 2 3; do
    if curl -sf -X POST "${MOON}/server/database/item" \
        -H "Content-Type: application/json" \
        -d "{\"namespace\":\"${ns}\",\"key\":\"${key}\",\"value\":${json_value}}" >/dev/null 2>&1; then
      ok "${ns}/${key} seeded"
      return 0
    fi
    sleep 2
  done
  warn "Failed to seed ${ns}/${key} after retries — re-run: ./install.sh 65"
}

# VAOC visual calibration defaults (pixelPrMm tuned later in UI)
seed_item "Ratical" "camera-settings" '{"flipHorizontal":false,"flipVertical":false,"pixelPrMm":160,"outerNozzleDiameter":1}'
seed_item "Ratical" "camera-stream-settings" '{}'

# Mainsail 'general' — the configurator reads mainsail/general (e.g. printername).
# A fresh Mainsail hasn't created it yet, so the read throws
# "Key 'general' in namespace 'mainsail' not found". Seed a minimal default;
# Mainsail overwrites it once the user changes any Mainsail setting.
seed_item "mainsail" "general" '{"printername":"Ratical"}'
