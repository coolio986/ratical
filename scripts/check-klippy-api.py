#!/usr/bin/env python3
# Guard against Kalico/Klipper core-API drift in Ratical's custom klippy extensions.
#
# Ratical ships forked kinematics/homing modules that plug into Kalico core. When the
# Kalico branch changes, the core API can change under them and the mismatch only
# surfaces at runtime (e.g. a G28 "Internal error"). This linter catches the known
# axis-API drift statically so install.sh can fail loudly instead.
#
# Current rule set: the homing-axis convention. Modern Kalico passes axis *indices*
# (ints: 0,1,2) to set_position(homing_axes=...) / clear_homing_state(...) / set_axes(...),
# and overrides must treat them as ints. The old API used axis *letters* ('x','y','z').
# If the installed core uses the int API but a custom module still uses the letter
# convention, that module is broken.
#
# Usage:  check-klippy-api.py <klipper_dir> <ratical_klippy_dir>
# Exit:   0 = ok/skipped, 1 = drift found (prints file:line + fix hint)
import ast
import os
import sys

# Overrides of these core methods receive integer axis indices in the modern API.
AXIS_METHODS = {"set_position", "clear_homing_state", "note_z_not_homed"}
# Calls to these pass axis indices; a string literal argument is the old letter API.
STR_ARG_METHODS = {"clear_homing_state", "set_axes"}


def core_uses_int_axis_api(klipper_dir):
    """True if the installed core builds homing_axes as integer indices."""
    homing = os.path.join(klipper_dir, "klippy", "extras", "homing.py")
    try:
        with open(homing, encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return None  # can't tell
    # Modern home_rails(): homing_axes = [axis for axis in range(3) if forcepos[...]]
    return "for axis in range(3)" in src and "homing_axes" in src


def _is_axis_letter_const(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value.lower() in (
        "x", "y", "z", "xy", "xz", "yz", "xyz",
    )


def _letter_axis_ops_in(func_node):
    """Yield line numbers where a flagged method treats axes as letters."""
    for n in ast.walk(func_node):
        # "xyz".index(...) / "xyz".find(...)
        if (
            isinstance(n, ast.Call)
            and isinstance(n.func, ast.Attribute)
            and n.func.attr in ("index", "find")
            and isinstance(n.func.value, ast.Constant)
            and isinstance(n.func.value.value, str)
            and set(n.func.value.value.lower()) <= set("xyz")
            and n.func.value.value
        ):
            yield n.lineno
        # enumerate("xyz")
        elif (
            isinstance(n, ast.Call)
            and isinstance(n.func, ast.Name)
            and n.func.id == "enumerate"
            and n.args
            and isinstance(n.args[0], ast.Constant)
            and isinstance(n.args[0].value, str)
            and set(n.args[0].value.lower()) <= set("xyz")
        ):
            yield n.lineno


def _string_axis_calls(tree):
    """Yield (lineno, detail) for calls passing letter axes into the int API."""
    for n in ast.walk(tree):
        if not (isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)):
            continue
        attr = n.func.attr
        if attr == "set_position":
            for kw in n.keywords:
                if kw.arg == "homing_axes" and _is_axis_letter_const(kw.value):
                    yield n.lineno, f'set_position(homing_axes="{kw.value.value}") — pass an int list, e.g. [2]'
            if len(n.args) >= 2 and _is_axis_letter_const(n.args[1]):
                yield n.lineno, f'set_position(..., "{n.args[1].value}") — pass an int list, e.g. [2]'
        elif attr in STR_ARG_METHODS:
            if n.args and _is_axis_letter_const(n.args[0]):
                yield n.lineno, f'{attr}("{n.args[0].value}") — pass int axis indices, e.g. [2]'


def check_file(path):
    problems = []
    try:
        with open(path, encoding="utf-8") as f:
            tree = ast.parse(f.read(), filename=path)
    except SyntaxError as e:
        return [(e.lineno or 0, f"syntax error: {e.msg}")]
    except OSError as e:
        return [(0, f"cannot read: {e}")]
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name in AXIS_METHODS:
            for lineno in _letter_axis_ops_in(node):
                problems.append((lineno, f'{node.name}() indexes axes by letter — core now passes int indices'))
    for lineno, detail in _string_axis_calls(tree):
        problems.append((lineno, detail))
    return problems


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: check-klippy-api.py <klipper_dir> <ratical_klippy_dir>\n")
        return 2
    klipper_dir, klippy_src = sys.argv[1], sys.argv[2]

    int_api = core_uses_int_axis_api(klipper_dir)
    if int_api is None:
        print("check-klippy-api: could not read core homing.py; skipping.")
        return 0
    if not int_api:
        print("check-klippy-api: core uses the legacy letter-axis API; nothing to check.")
        return 0

    found = False
    for root, _dirs, files in os.walk(klippy_src):
        for fn in files:
            if not fn.endswith(".py"):
                continue
            path = os.path.join(root, fn)
            for lineno, detail in check_file(path):
                found = True
                rel = os.path.relpath(path, klippy_src)
                print(f"  {rel}:{lineno}: {detail}")
    if found:
        sys.stderr.write(
            "check-klippy-api: custom klippy extension(s) use the legacy letter-axis homing API,\n"
            "but the installed Kalico core passes integer axis indices. Homing (G28) will fail.\n"
        )
        return 1
    print("check-klippy-api: custom klippy extensions match the installed Kalico axis API.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
