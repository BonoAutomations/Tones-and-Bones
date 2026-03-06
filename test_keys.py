#!/usr/bin/env python3
"""
Verify that environment variables are loaded correctly.

Prints the status of each key (set / not set) without revealing actual values.
Usage:
    python test_keys.py
"""

from config import load_env, validate_env, env_summary


def main() -> None:
    load_env()

    print("=== Tones-and-Bones: Environment Key Check ===\n")

    summary = env_summary()
    for key, status in summary.items():
        indicator = "[OK]" if status == "set" else "[MISSING]"
        print(f"  {indicator}  {key}")

    missing_required, missing_optional = validate_env()

    print()
    if missing_required:
        print(f"ERROR: {len(missing_required)} required key(s) missing: "
              f"{', '.join(missing_required)}")
        print("Copy .env.example to .env and fill in your keys.")
        raise SystemExit(1)
    else:
        print("All required keys are set.")

    if missing_optional:
        print(f"Note: {len(missing_optional)} optional key(s) not set: "
              f"{', '.join(missing_optional)}")

    print("\nEnvironment is ready.")


if __name__ == "__main__":
    main()
