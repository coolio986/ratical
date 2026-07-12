#!/usr/bin/env bash

if [ "$EUID" -ne 0 ]
  then echo "ERROR: Please run as root"
  exit
fi

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
# shellcheck source=./src/scripts/common.sh
source "$SCRIPT_DIR/common.sh"

pushd "${KLIPPER_DIR}" || exit 1
chown "${RATICAL_USERNAME}":"${RATICAL_USERGROUP}" -R "${KLIPPER_DIR}"
sudo -u "${RATICAL_USERNAME}" make olddefconfig
sudo -u "${RATICAL_USERNAME}" make clean
sudo -u "${RATICAL_USERNAME}" make

popd || exit 1