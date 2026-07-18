#!/usr/bin/env bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
SRC_DIR=$(realpath "$SCRIPT_DIR/..")
# Ratical mono-repo layout: <repo>/configurator/src/scripts.
# BASE_DIR must be the mono-repo root (holds .git + configuration/), i.e. two levels
# above SRC_DIR — NOT one (that would be the intermediate 'configurator/' dir).
# This makes configuration=<repo>/configuration and .git=<repo>/.git, matching the
# single moonraker [update_manager ratical] that tracks the whole repo at ~/ratical.
BASE_DIR=$(realpath "$SRC_DIR/../..")
GIT_DIR=$BASE_DIR/.git

source "$BASE_DIR/configuration/scripts/environment.sh"

report_status()
{
    echo -e "\n\n###### $1"
}

update_package_managers()
{
    report_status "Updating npm and pnpm..."
    npm update -g npm pnpm
}

install_or_update_service_file()
{
	report_status "Updating service file..."

    sudo groupadd -f ratical-configurator

	SERVICE_FILE="/etc/systemd/system/ratical-configurator.service"
	SERVICE_FILE_TEMPLATE="${SCRIPT_DIR}/service-template.service"

	cp "${SERVICE_FILE_TEMPLATE}" /tmp/ratical-configurator.service
	
	sed -i "s|__SRC_DIR__|${SRC_DIR}|g" /tmp/ratical-configurator.service
	sed -i "s|__RATICAL_USERNAME__|${RATICAL_USERNAME}|g" /tmp/ratical-configurator.service
	
	if [ -f "${SERVICE_FILE}" ]; then
		if [ "$(md5sum "${SERVICE_FILE_TEMPLATE}")" != "$(md5sum "${SERVICE_FILE}")" ]; then
			sudo mv /tmp/ratical-configurator.service "${SERVICE_FILE}"
			sudo systemctl daemon-reload
			echo "Service file updated!"
		else
			echo "Service file is already up to date!"
		fi
	else
		echo "Service file does not exist, installing..."
		sudo mv /tmp/ratical-configurator.service "${SERVICE_FILE}"
		sudo systemctl enable ratical-configurator.service
		sudo systemctl daemon-reload
		echo "Service file installed!"
	fi
}

pnpm_install() {
	report_status "Installing pnpm dependencies..."
    pushd "$SRC_DIR" || exit 1
	if [ -d "$BASE_DIR/node_modules" ]; then
		report_status "Moving node_modules from git directory to src directory"
		mv "$BASE_DIR/node_modules" "$SRC_DIR"
	fi
	if [ "$EUID" -eq 0 ]; then
		# Check if node_modules is owned by root and delete
		# Fixes old 2.0 installations
		if [ -d "$SRC_DIR/node_modules" ] && [ "$(stat -c %U "$SRC_DIR/node_modules")" == "root" ]; then
			report_status "Deleting root owned node_modules"
			rm -rf "$SRC_DIR/node_modules"
		fi
        sudo -u "${RATICAL_USERNAME}" pnpm install --frozen-lockfile --aggregate-output --no-color --config.confirmModulesPurge=false
    else
		pnpm install --frozen-lockfile --aggregate-output --no-color --config.confirmModulesPurge=false
	fi
    popd || exit 1
}

ensure_pnpm_installation() {
	if ! which pnpm &> /dev/null; then
		report_status "Installing pnpm"
		npm install -g pnpm
		# remove old node modules
		rm -rf "$SRC_DIR/node_modules"
		pnpm_install
	fi
}

ensure_service_permission()
{
	if ! grep -q "ratical-configurator" "${RATICAL_PRINTER_DATA_DIR}/moonraker.asvc"; then
		report_status "Updatin moonraker service permissions"
		printf '\nratical-configurator' >> "${RATICAL_PRINTER_DATA_DIR}/moonraker.asvc"
		echo "Ratical added to moonraker service permissions!"
	fi
}

install_hooks()
{
    report_status "Installing git hooks"
	if [ -L "$GIT_DIR/hooks/post-merge" ]; then
 	   rm "$GIT_DIR/hooks/post-merge"
	fi
	# Mono-repo: do NOT install the configurator's legacy self-update post-merge
	# hook. Updates run via `./install.sh` (also the moonraker [update_manager
	# ratical] install_script). The old hook runs klipper-fork-migration and
	# node18/nodesource logic that does not apply to a Kalico/Trixie mono-repo and
	# errors on every `git pull`. The block above removes any stale hook.
	echo "Skipping legacy post-merge self-update hook (mono-repo updates via install.sh)"
}

install_logrotation() {
    LOGROTATE_FILE="/etc/logrotate.d/ratical-configurator"
    LOGFILE="${RATICAL_PRINTER_DATA_DIR}/logs/ratical-configurator.log"
    report_status "Installing Ratical Configurator log rotation script..."
    sudo /bin/sh -c "cat > ${LOGROTATE_FILE}" << __EOF
#### Ratical-configurator
####
#### Written by Mikkel Schmidt <mikkel.schmidt@gmail.com>
#### Copyright 2022
#### https://github.com/coolio986/ratical
####
#### This File is distributed under GPLv3
####


${LOGFILE} {
    rotate 3
    missingok
    notifempty
    copy
    daily
    dateext
    dateformat .%Y-%m-%d
    maxsize 10M
}
__EOF
    sudo chmod 644 "$LOGROTATE_FILE"
}

patch_log_rotation() {
	if [ -e /etc/logrotate.d/ratical-configurator ]; then
		if grep -q "${RATICAL_PRINTER_DATA_DIR}/logs/ratical-configurator.log" /etc/logrotate.d/ratical-configurator; then
			report_status "Patching log rotation"
			sudo sed -i 's|rotate 4|rotate 3|g' /etc/logrotate.d/ratical-configurator
			sudo sed -i "s|${RATICAL_PRINTER_DATA_DIR}/logs/configurator.log|${RATICAL_PRINTER_DATA_DIR}/logs/ratical-configurator.log|g" /etc/logrotate.d/ratical-configurator
		fi
	else
		install_logrotation
	fi
}

symlink_configuration() {
	report_status "Symlinking configuration"
	[ -z "$RATICAL_PRINTER_DATA_DIR" ] && { echo "Error: RATICAL_PRINTER_DATA_DIR not set" >&2; return 1; }
	[ -z "$BASE_DIR" ] && { echo "Error: BASE_DIR not set" >&2; return 1; }
	
	sudo=""
	[ "$EUID" -ne 0 ] && sudo="sudo"
	
	target="${RATICAL_PRINTER_DATA_DIR}/config/Ratical"
	source="$BASE_DIR/configuration"
	if [ ! -L "$target" ] || [ ! "$(readlink "$target")" = "$source" ]; then
		$sudo rm -rf "$target" || { echo "Failed to remove old configuration" >&2; return 1; }
		$sudo ln -s "$source" "$target" || { echo "Failed to create symlink" >&2; return 1; }
		echo "Configuration symlink created successfully"
	else
		echo "Configuration already linked, skipping..."
	fi
}

install_cli()
{
	sudo=""
	[ "$EUID" -ne 0 ] && sudo="sudo"
	
	target="/usr/local/bin/ratical"
	source="$SRC_DIR/bin/ratical"
	if [ ! -L "$target" ] || [ ! "$(readlink "$target")" = "$source" ]; then
		report_status "Installing Ratical CLI"
		$sudo rm -f "$target"
		$sudo ln -s "$source" "$target"
		$sudo chmod a+x "$target"
	else
		echo "Ratical CLI already installed, skipping..."
	fi
}

verify_users()
{
	if ! id "${RATICAL_USERNAME}" &>/dev/null; then
		echo "User ${RATICAL_USERNAME} is not present on the system"
		exit 1
	fi
}

install_udev_rule()
{

	sudo=""
	[ "$EUID" -ne 0 ] && sudo="sudo"

	ratical_source="$SCRIPT_DIR/ratical.rules"
	ratical_target="/etc/udev/rules.d/97-ratical.rules"
	if [ ! -f "$ratical_source" ]; then
		echo "Error: Ratical udev rules source file not found at $ratical_source" >&2
		return 1
	fi
	if [ ! -L "$ratical_target" ] || [ ! "$(readlink "$ratical_target")" = "$ratical_source" ]; then
		report_status "Installing Ratical udev rule"
		$sudo rm -f "$ratical_target"
		$sudo ln -s "$ratical_source" "$ratical_target"
		echo "Ratical udev rule installed!"
	fi

	vaoc_source="$SCRIPT_DIR/vaoc.rules" 
	vaoc_target="/etc/udev/rules.d/97-vaoc.rules"
	if [ ! -f "$vaoc_source" ]; then
		echo "Error: VAOC udev rules source file not found at $vaoc_source" >&2
		return 1
	fi
	if [ ! -L "$vaoc_target" ] || [ ! "$(readlink "$vaoc_target")" = "$vaoc_source" ]; then
		report_status "Installing VAOC udev rule"
		$sudo rm -f "$vaoc_target"
		$sudo ln -s "$vaoc_source" "$vaoc_target"
		echo "VAOC udev rule installed!"
	fi
}

ensure_sudo_command_whitelisting()
{

	sudo=""
	[ "$EUID" -ne 0 ] && sudo="sudo"

    report_status "Updating whitelisted commands"
	# Whitelist Ratical configurator git hook scripts
	if [[ -e /etc/sudoers.d/030-ratical-configurator-githooks ]]
	then
		$sudo rm /etc/sudoers.d/030-ratical-configurator-githooks
	fi
	touch /tmp/030-ratical-configurator-githooks
	cat << __EOF > /tmp/030-ratical-configurator-githooks
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: $SCRIPT_DIR/update.sh
__EOF

	$sudo chown root:root /tmp/030-ratical-configurator-githooks
	$sudo chmod 440 /tmp/030-ratical-configurator-githooks
	$sudo cp --preserve=mode /tmp/030-ratical-configurator-githooks /etc/sudoers.d/030-ratical-configurator-githooks

	echo "Ratical configurator git hooks has successfully been whitelisted!"

	# Whitelist configurator scripts
	if [[ -e /etc/sudoers.d/030-ratical-configurator-scripts ]]
	then
		$sudo rm /etc/sudoers.d/030-ratical-configurator-scripts
	fi
	touch /tmp/030-ratical-configurator-scripts
	cat << __EOF > /tmp/031-ratical-configurator-scripts
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: $SCRIPT_DIR/add-wifi-network.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: $SCRIPT_DIR/change-hostname.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: $SCRIPT_DIR/dfu-flash.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: $SCRIPT_DIR/board-script.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: $SCRIPT_DIR/flash-path.sh
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: $SCRIPT_DIR/klipper-compile.sh
__EOF

	$sudo chown root:root /tmp/031-ratical-configurator-scripts
	$sudo chmod 440 /tmp/031-ratical-configurator-scripts
	$sudo cp --preserve=mode /tmp/031-ratical-configurator-scripts /etc/sudoers.d/031-ratical-configurator-scripts

	echo "Ratical configurator scripts has successfully been whitelisted!"

	# Whitelist configurator commands
	if [[ -e /etc/sudoers.d/031-ratical-configurator-wifi ]]
	then
		$sudo rm /etc/sudoers.d/031-ratical-configurator-wifi
	fi
	touch /tmp/031-ratical-configurator-wifi
	cat << __EOF > /tmp/031-ratical-configurator-wifi
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: /usr/sbin/iw
${RATICAL_USERNAME}  ALL=(ALL) NOPASSWD: /usr/sbin/wpa_cli
__EOF

	$sudo chown root:root /tmp/031-ratical-configurator-wifi
	$sudo chmod 440 /tmp/031-ratical-configurator-wifi
	$sudo cp --preserve=mode /tmp/031-ratical-configurator-wifi /etc/sudoers.d/031-ratical-configurator-wifi

	echo "Ratical configurator commands has successfully been whitelisted!"
}
