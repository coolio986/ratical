#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "$(realpath -- "${BASH_SOURCE[0]}")" )" &> /dev/null && pwd )

# shellcheck source=./configuration/scripts/ratical-common.sh
source "$SCRIPT_DIR"/ratical-common.sh

## the TEST_RESONANCES command seems to return before all data is completely
## written. it'd be better to poll for the files to be completely written,
## but this has been reliable for me so far…
sleep 10

outdir="${RATICAL_PRINTER_DATA_DIR}"/config/input_shaper
if [ ! -d "${outdir}" ]; then
    mkdir "${outdir}"
    chown "${RATICAL_USERNAME}:${RATICAL_USERGROUP}" "${outdir}"
fi

NEWUPPER=$(find /tmp -name "raw_data_axis*_belt-tension-upper.csv" -printf '%T@ %p\n' 2> /dev/null | sort -n | tail -1 | cut -f2- -d" ")
NEWLOWER=$(find /tmp -name "raw_data_axis*_belt-tension-lower.csv" -printf '%T@ %p\n' 2> /dev/null | sort -n | tail -1 | cut -f2- -d" ")

# Use klippy-env: Kalico's graph_accelerometer imports klippy → needs cffi (not system python3)
"${KLIPPER_ENV}"/bin/python "${KLIPPER_DIR}"/scripts/graph_accelerometer.py \
    -c "$NEWLOWER" "$NEWUPPER" \
    -o "${outdir}/belt-tension-resonances-$( date +'%Y-%m-%d-%H%M%S' ).png"
