#!/usr/bin/env python3
# Detect the advanced Kalico/Klipper menuconfig options available for a board.
#
# Loads the board's base firmware.config into Kalico's own vendored kconfiglib,
# then reports the boolean/tristate feature toggles whose dependencies are
# satisfied for that board on the installed Kalico branch. The identity radios
# (MCU arch/model, flash offset, clock reference, communication interface) are
# Kconfig `choice` members and are excluded, so only genuine opt-in features
# (accelerometers, sensors, stepper optimizations, etc.) are returned.
#
# Output: JSON array on stdout, one object per available option:
#   { "symbol", "config", "name", "help", "type", "value", "enabled" }
#
# Requires env KLIPPER_DIR. Run with the klipper python env so kconfiglib and
# its dependencies resolve the same way `make menuconfig` does.
import sys
import os
import json
import argparse

KLIPPER_DIR = os.path.abspath(os.environ['KLIPPER_DIR'])
# Kconfig reads $srctree for relative source paths, exactly like the Makefile.
os.environ['srctree'] = KLIPPER_DIR
sys.path.insert(0, os.path.join(KLIPPER_DIR, 'lib', 'kconfiglib'))
import kconfiglib  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base_config', help="Path to the board's base firmware.config")
    parser.add_argument(
        '--only',
        default=None,
        help='Comma separated allowlist of symbol names (without CONFIG_ prefix). '
        'If given, only these symbols are considered.',
    )
    args = parser.parse_args()

    allow = None
    if args.only:
        allow = {s.strip().replace('CONFIG_', '') for s in args.only.split(',') if s.strip()}

    kconf = kconfiglib.Kconfig(os.path.join(KLIPPER_DIR, 'src', 'Kconfig'))
    kconf.load_config(args.base_config)

    options = []
    for sym in kconf.unique_defined_syms:
        if sym.type not in (kconfiglib.BOOL, kconfiglib.TRISTATE):
            continue
        # Identity groups (MCU/flash/clock/comm) are mutually-exclusive `choice`
        # members and must not be exposed as free toggles.
        if sym.choice is not None:
            continue
        if sym.name == 'LOW_LEVEL_OPTIONS':
            continue
        if allow is not None and sym.name not in allow:
            continue
        # A visible prompt means the dependencies are met for this board+branch.
        prompt = None
        help_text = None
        for node in sym.nodes:
            if node.prompt is not None:
                prompt = node.prompt[0]
                help_text = node.help
                break
        if prompt is None or sym.visibility <= 0:
            continue
        options.append(
            {
                'symbol': sym.name,
                'config': 'CONFIG_' + sym.name,
                'name': prompt,
                'help': help_text,
                'type': kconfiglib.TYPE_TO_STR[sym.type],
                'value': sym.str_value,
                'enabled': sym.str_value in ('y', 'm'),
            }
        )

    json.dump(options, sys.stdout)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
