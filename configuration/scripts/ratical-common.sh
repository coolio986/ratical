#!/usr/bin/env bash
SCRIPT_DIR=$( cd -- "$( dirname -- "$(realpath -- "${BASH_SOURCE[0]}")" )" &> /dev/null && pwd )

# shellcheck source=./configuration/scripts/environment.sh
source "$SCRIPT_DIR"/environment.sh

# Helper to conditionally use sudo (for compatibility with systemd-nspawn/containers)
# When running as root (EUID=0), commands are executed directly
# When not root, sudo is used for privilege escalation
if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

# Helper to run commands as a specific user
# Only uses sudo -u if we're not already running as the target user
run_as_user() {
    local username="$1"
    shift
	# If running as root or as a different user, use sudo -u
	if [ "$EUID" -eq 0 ] || [ "$(whoami)" != "$username" ]; then
        # Need to switch users, use sudo -u
        sudo -u "$username" "$@"
    else
        # Already the target user, run directly
        "$@"
    fi
}

# System package requirements for Ratical (read by Moonraker and scripts)
# shellcheck disable=SC2034
PKGLIST="python3-numpy python3-matplotlib curl git libopenblas0-pthread"

report_status()
{
    echo -e "\n\n###### $1"
}

disable_modem_manager()
{
	report_status "Checking if ModemManager is enabled..."
	
	if ! $SUDO systemctl is-enabled ModemManager.service &> /dev/null; then
		report_status "Disabling ModemManager..."
		$SUDO systemctl disable ModemManager.service
	else
		report_status "ModemManager is already disabled.."
	fi
	report_status "Masking ModemManager to ensure it won't start in the future..."
	$SUDO systemctl mask ModemManager.service
}

update_beacon_fw()
{
	report_status "Updating beacon firmware..."
	if [ ! -d "$BEACON_DIR" ] || [ ! -e "$KLIPPER_DIR/klippy/extras/beacon.py" ]; then
		echo "beacon: beacon isn't installed, skipping..."
		return
	fi

	if [ ! -d "$KLIPPER_DIR" ] || [ ! -d "$KLIPPER_ENV" ]; then
		echo "beacon: klipper or klippy env doesn't exist"
		return
	fi

	if [ ! -f "$BEACON_DIR/update_firmware.py" ]; then
		echo "beacon: beacon firmware updater script doesn't exist, skipping..."
		return
	fi

	if [ ! -d /sys/bus/usb/devices ]; then
		echo "beacon: no usb devices present, skipping firmware update..."
		return
	fi

	"$KLIPPER_ENV"/bin/python "$BEACON_DIR"/update_firmware.py update all --no-sudo
}

install_beacon()
{
    report_status "Installing beacon module..."

	if [ -d "$BEACON_DIR" ] || [ -e "$KLIPPER_DIR/klippy/extras/beacon.py" ]; then
		echo "beacon: beacon already installed, skipping..."
		return
	fi

	if [ ! -d "$KLIPPER_DIR" ] || [ ! -d "$KLIPPER_ENV" ]; then
		echo "beacon: klipper or klippy env doesn't exist"
		return
	fi

	git clone https://github.com/beacon3d/beacon_klipper.git "$BEACON_DIR"
	chown -R "${RATICAL_USERNAME}:${RATICAL_USERGROUP}" "$BEACON_DIR"

	# install beacon requirements to env
	echo "beacon: installing python requirements to env."
	if [ "$EUID" -eq 0 ]; then
		# Running as root, use su to run pip as the correct user
		su - "${RATICAL_USERNAME}" -c "\"${KLIPPER_ENV}\"/bin/pip install -r \"${BEACON_DIR}\"/requirements.txt"
	else
		# Running as user, can run pip directly
		"${KLIPPER_ENV}"/bin/pip install -r "${BEACON_DIR}"/requirements.txt
	fi

	# Beacon extension will be registered in verify_registered_extensions
}

regenerate_config() {
    report_status "Regenerating Ratical configuration via Ratical Configurator..."

    ratical config regenerate
}

remove_old_postprocessor()
{
	if [ -L "${KLIPPER_DIR}/klippy/extras/ratical_post_processor.py" ]; then
		report_status "Removing legacy post-processor..."
		rm "${KLIPPER_DIR}/klippy/extras/ratical_post_processor.py"
		echo "Legacy post-processor removed!"
	fi
}

install_hooks()
{
    report_status "Verifying git hooks are installed..."
	# Klipper hook
	klipper_source="$SCRIPT_DIR/klipper-post-merge.sh"
	klipper_target="${KLIPPER_DIR}/.git/hooks/post-merge"
	if [[ ! -L "$klipper_target" ]] || [[ ! "$(readlink "$klipper_target")" = "$klipper_source" ]]
	then
		rm -f "$klipper_target"
		ln -s "$klipper_source" "$klipper_target"
		echo "Klipper git hook installed!"
	fi

	# Moonraker hook
	moonraker_source="$SCRIPT_DIR/moonraker-post-merge.sh"
	moonraker_target="${MOONRAKER_DIR}/.git/hooks/post-merge"
	if [[ ! -L "$moonraker_target" ]] || [[ ! "$(readlink "$moonraker_target")" = "$moonraker_source" ]]
	then
		rm -f "$moonraker_target"
		ln -s "$moonraker_source" "$moonraker_target"
		echo "Moonraker git hook installed!"
	fi

	# Beacon hook
	beacon_source="$SCRIPT_DIR/beacon-post-merge.sh"
	beacon_target="${BEACON_DIR}/.git/hooks/post-merge"
	if [[ ! -L "$beacon_target" ]] || [[ ! "$(readlink "$beacon_target")" = "$beacon_source" ]]
	then
		rm -f "$beacon_target"
		ln -s "$beacon_source" "$beacon_target"
		echo "Beacon git hook installed!"
	fi
	echo "Git hooks are correctly installed!"
}

ensure_service_permission()
{
    report_status "Ensuring moonraker service permissions..."
    
    local asvc_file="${RATICAL_PRINTER_DATA_DIR}/moonraker.asvc"
    
    # Define required service entries
    local required_services=(
        "klipper_mcu"
        "webcamd"
        "MoonCord"
        "KlipperScreen"
        "moonraker-telegram-bot"
        "moonraker-obico"
        "sonar"
        "crowsnest"
        "octoeverywhere"
        "ratical-configurator"
    )
    
    # Create file if it doesn't exist
    if [ ! -e "$asvc_file" ]; then
        touch "$asvc_file"
        echo "Created moonraker service permissions file"
    fi
    
    # Ensure file ends with newline if it has content
    if [ -s "$asvc_file" ] && [ "$(tail -c 1 "$asvc_file" 2>/dev/null | wc -l)" -eq 0 ]; then
        echo "" >> "$asvc_file"
    fi
    
    # Check for missing entries and add them
    local added_count=0
    for service in "${required_services[@]}"; do
        # Check if service exists in file (ignoring leading/trailing whitespace)
        # Use awk to trim whitespace from each line and compare
        if ! awk -v service="$service" 'BEGIN {found=0} {gsub(/^[[:space:]]+|[[:space:]]+$/, ""); if ($0 == service) found=1} END {exit !found}' "$asvc_file" 2>/dev/null; then
            echo "$service" >> "$asvc_file"
            echo "Added service permission: $service"
            ((added_count++))
        fi
    done
    
    # Ensure correct ownership if running as root
    if [ "$EUID" -eq 0 ]; then
        chown "${RATICAL_USERNAME}:${RATICAL_USERGROUP}" "$asvc_file"
    fi
    
    if [ "$added_count" -gt 0 ]; then
        echo "Added $added_count service permission(s) to moonraker.asvc"
    else
        echo "All required service permissions already present"
    fi
}

patch_klipperscreen_service_restarts()
{
	if grep "StartLimitIntervalSec=0" /etc/systemd/system/klipperscreen.service &>/dev/null; then
		report_status "Patching KlipperScreen service restarts..."
		# Fix restarts
		$SUDO sed -i 's/\RestartSec=1/\RestartSec=5/g' /etc/systemd/system/KlipperScreen.service
		$SUDO sed -i 's/\StartLimitIntervalSec=0/\StartLimitIntervalSec=100\nStartLimitBurst=4/g' /etc/systemd/system/KlipperScreen.service
		$SUDO systemctl daemon-reload
		echo "KlipperScreen service patched!"
	fi
}

ensure_sudo_command_whitelisting()
{
    report_status "Updating whitelisted commands"
	# Whitelist Ratical git hook scripts
	if [[ -e /etc/sudoers.d/030-ratical-githooks ]]
	then
		$SUDO rm /etc/sudoers.d/030-ratical-githooks
	fi
	touch /tmp/030-ratical-githooks
	cat <<EOF > /tmp/030-ratical-githooks
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: ${RATICAL_PRINTER_DATA_DIR}/config/Ratical/scripts/ratical-update.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: ${RATICAL_PRINTER_DATA_DIR}/config/Ratical/scripts/klipper-mcu-update.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: ${RATICAL_PRINTER_DATA_DIR}/config/Ratical/scripts/beacon-update.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: ${RATICAL_PRINTER_DATA_DIR}/config/Ratical/scripts/moonraker-update.sh
EOF

	$SUDO chown root:root /tmp/030-ratical-githooks
	$SUDO chmod 440 /tmp/030-ratical-githooks
	$SUDO cp --preserve=mode /tmp/030-ratical-githooks /etc/sudoers.d/030-ratical-githooks

	echo "Ratical git hooks has successfully been whitelisted!"
}

verify_registered_extensions()
{
    report_status "Verifying registered Klipper extensions..."

	RATICAL_USER_HOME=$(getent passwd "${RATICAL_USERNAME}" | cut -d: -f6)

    # Define expected extensions and their relative paths
    declare -A expected_extensions=(
        ["beacon"]=$(realpath "${BEACON_DIR}/beacon.py")
        ["gcode_shell_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/gcode_shell_command.py")
        ["ratical_homing_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/ratical_homing.py")
		["linear_movement_analysis"]=$(realpath "${RATICAL_USER_HOME}/klipper_linear_movement_analysis/linear_movement_vibrations.py")
        ["z_offset_probe_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/z_offset_probe.py")
        ["resonance_generator_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/resonance_generator.py")
        ["ratical_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/ratical.py")
        ["beacon_mesh_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/beacon_mesh.py")
		["beacon_true_zero_correction_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/beacon_true_zero_correction.py")
		["beacon_adaptive_heatsoak_extension"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/beacon_adaptive_heat_soak.py")
		["fastconfig"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/fastconfig.py")
		["named_offsets"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/named_offsets.py")
		["beacon_user_z_offset"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/beacon_user_z_offset.py")
		["ratical_dual_carriage_extras"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/ratical_dual_carriage_extras.py")
    )

	declare -A kinematics_extensions=(
		["ratical_hybrid_corexy"]=$(realpath "${RATICAL_PRINTER_DATA_DIR}/config/Ratical/klippy/kinematics/ratical_hybrid_corexy.py")
	)

	declare -A expected_moonraker_extensions=(
		["timelapse"]=$(realpath "${RATICAL_USER_HOME}/moonraker-timelapse/component/timelapse.py")
	)

    # Track found extensions
    declare -A found_extensions
    declare -A found_kinematics
	declare -A found_moonraker_extensions
    
	declare extension_type="klipper"

	# Check registered extensions
    while IFS= read -r line; do
        # Skip empty lines and check headers
        [[ -z "$line" ]] && continue
        if [[ "$line" == *"Registered Klipper Extensions:"* ]]; then
			extension_type="klipper"
			continue
		fi
        if [[ "$line" == *"Registered Moonraker"* ]]; then
			extension_type="moonraker"
			continue
		fi

        # Extract extension name and filepath
        if [[ "$line" =~ [[:space:]]*([A-Za-z0-9_]+)[[:space:]]*-\>[[:space:]]*([^[:space:]].+)[[:space:]]*$ ]]; then
            ext_name="${BASH_REMATCH[1]}"
            filepath="${BASH_REMATCH[2]}"

			# Check if it's a kinematics extension
			if [[ -v kinematics_extensions["$ext_name"] ]]; then
				found_kinematics["$ext_name"]=1

				# Check if filepath matches expected path
				if [[ "$filepath" != "${kinematics_extensions[$ext_name]}" ]]; then
					echo "WARNING: Kinematics extension $ext_name has unexpected filepath:"
					echo "  Expected: ${kinematics_extensions[$ext_name]}"
					echo "  Found: $filepath"
					echo "Removing extension $ext_name..."
					ratical extensions unregister klipper "$ext_name"
					echo "Reregistering extension $ext_name..."
					EXT_PATH="${kinematics_extensions[$ext_name]}"
					ratical extensions register klipper -k "$ext_name" "$EXT_PATH" "$EXT_FILE"
				fi
				continue
			fi

			# Mark as found
			if [[ "$extension_type" == "klipper" ]]; then
				found_extensions["$ext_name"]=1
			fi
			if [[ "$extension_type" == "moonraker" ]]; then
				found_moonraker_extensions["$ext_name"]=1
			fi

			# Check if extension is expected
			if [[ ! -v expected_extensions["$ext_name"] ]] && [[ ! -v expected_moonraker_extensions["$ext_name"] ]]; then
				echo "WARNING: Unexpected $extension_type extension found: $ext_name. This may have been registered by a third party."
				echo "To remove the extension, run 'ratical extensions unregister $extension_type $ext_name'"
				continue
			fi

			# Check if filepath matches expected path
			if [[ "$filepath" != "${expected_extensions[$ext_name]}" ]] && [[ "$filepath" != "${expected_moonraker_extensions[$ext_name]}" ]]; then
				echo "WARNING: Extension $ext_name has unexpected filepath:"
				echo "  Expected: ${expected_extensions[$ext_name]}"
				echo "  Found: $filepath"
				echo "Removing $extension_type extension $ext_name..."
				ratical extensions unregister "$extension_type" "$ext_name"
				echo "Reregistering $extension_type extension $ext_name..."
				EXT_PATH="${expected_extensions[$ext_name]}"
				ratical extensions register "$extension_type" "$ext_name" "$EXT_PATH"
			fi

			# Check if file exists
			if [ ! -f "$filepath" ]; then
				echo "WARNING: Extension file not found: $filepath. If you keep seeing this message, please report it to Ratical maintainers."
				echo "Unregistering $extension_type extension $ext_name..."
				ratical extensions unregister "$extension_type" "$ext_name"
			fi
        fi
    done < <(ratical extensions list --non-interactive)

    # Check for missing expected extensions
    for ext_name in "${!expected_extensions[@]}"; do
        if [[ ! -v found_extensions["$ext_name"] ]]; then
            echo "Expected klipper extension not registered: $ext_name"
			echo "Registering extension $ext_name..."
			EXT_PATH="${expected_extensions[$ext_name]}"
			ratical extensions register klipper "$ext_name" "$EXT_PATH"
        else
			echo "Klipper extension $ext_name is properly registered."
		fi
    done

	# Check for missing moonraker extensions
	for ext_name in "${!expected_moonraker_extensions[@]}"; do
		if [[ ! -v found_moonraker_extensions["$ext_name"] ]]; then
			echo "Expected moonraker extension not registered: $ext_name"
			echo "Registering extension $ext_name..."
			EXT_PATH="${expected_moonraker_extensions[$ext_name]}"
			ratical extensions register moonraker "$ext_name" "$EXT_PATH"
		else
			echo "Moonraker extension $ext_name is properly registered."
		fi
	done

    # Check for missing kinematics extensions
    for ext_name in "${!kinematics_extensions[@]}"; do
        if [[ ! -v found_kinematics["$ext_name"] ]]; then
            echo "Expected klipper kinematics extension not registered: $ext_name"
			echo "Registering klipper kinematics extension $ext_name..."
			EXT_PATH="${kinematics_extensions[$ext_name]}"
			ratical extensions register klipper -k "$ext_name" "$EXT_PATH"
		else
			echo "Klipper kinematics extension $ext_name is properly registered."
		fi
    done
}

