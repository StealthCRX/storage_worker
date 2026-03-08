"""Settings persistence for the Insta360 uploader."""

import json
import os
import platform
import tempfile


DEFAULT_CONFIG = {
    "api_url": "https://insta-upload.stealthcrx.workers.dev",
    "name": "",
    "stitcher_path": "/home/samarth/Desktop/insta360-stitcher/build/insta360-stitch",
    "stitch_output_dir": "/tmp/stitched",
    "stitch_type": "optflow",
    "output_size": "3840x1920",
    "enable_flowstate": True,
    "enable_colorplus": True,
    "extra_stitch_options": "",
    "skip_stitch": False,
    "last_directory": "",
}


def get_config_path() -> str:
    """Return platform-appropriate config file path."""
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    elif system == "Darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_CONFIG_HOME", os.path.join(os.path.expanduser("~"), ".config"))
    config_dir = os.path.join(base, "insta360-uploader")
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, "config.json")


def load_config() -> dict:
    """Load config from JSON file, returning defaults for missing keys."""
    config = dict(DEFAULT_CONFIG)
    path = get_config_path()
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                saved = json.load(f)
            config.update(saved)
        except (json.JSONDecodeError, OSError):
            pass
    return config


def save_config(config: dict) -> None:
    """Write config to JSON file."""
    path = get_config_path()
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
