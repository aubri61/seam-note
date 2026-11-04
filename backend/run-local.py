#!/usr/bin/env python3
"""Run the local backend with backend/.env.local (never execute dotenv as code)."""
import base64
import os
from pathlib import Path
import re
import secrets
import shlex
import sys


def read_env(path):
    values = {}
    if not path.exists():
        return values
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, separator, raw = line.partition("=")
        name = name.strip()
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError(f"Invalid .env.local entry on line {number} (value redacted)")
        try:
            parts = shlex.split(raw, comments=True, posix=True)
        except ValueError:
            raise ValueError(f"Invalid .env.local quoting on line {number} (value redacted)") from None
        if len(parts) > 1:
            raise ValueError(f"Quote values containing spaces on line {number} (value redacted)")
        values[name] = parts[0] if parts else ""
    return values


def main():
    directory = Path(__file__).resolve().parent
    path = directory / ".env.local"
    env = {**read_env(path), **os.environ}  # Explicit shell environment wins.
    profiles = env.get("SPRING_PROFILES_ACTIVE", "").split(",")
    if any(profile.strip() in {"prod", "test"} for profile in profiles):
        raise ValueError("run-local.py is only for local development; prod/test profiles are not allowed")
    if not env.get("AUTH_JWT_SECRET_BASE64"):
        key = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
        # Persist once so ordinary restarts do not invalidate local tokens.
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(f"\nAUTH_JWT_SECRET_BASE64={key}\n")
        env["AUTH_JWT_SECRET_BASE64"] = key
        print("Created local JWT key in backend/.env.local (value hidden).", flush=True)
    os.chdir(directory)
    os.execvpe("./gradlew", ["./gradlew", "bootRun", *sys.argv[1:]], env)


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        sys.exit(str(error))
