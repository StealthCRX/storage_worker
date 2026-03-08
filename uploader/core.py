"""Core business logic for the Insta360 uploader. No print/sys.exit — uses callbacks."""

import math
import mimetypes
import os
import re
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import requests

INSTA360_EXTENSIONS = {".insv", ".insp", ".lrv"}
DEFAULT_CHUNK_SIZE = 50 * 1024 * 1024  # 50MB

ProgressCallback = Callable[[str, str, float], None]
"""(stage, message, percent 0-100)"""


@dataclass
class StitchConfig:
    stitch_type: str = "optflow"
    output_size: str = "3840x1920"
    enable_flowstate: bool = True
    enable_colorplus: bool = True
    stitcher_path: str = ""
    output_dir: str = "/tmp/stitched"
    extra_options: str = ""


def scan_directory(directory: str) -> list[str]:
    """Find all Insta360 files in directory."""
    files = []
    for entry in sorted(os.listdir(directory)):
        full_path = os.path.join(directory, entry)
        if os.path.isfile(full_path):
            _, ext = os.path.splitext(entry)
            if ext.lower() in INSTA360_EXTENSIONS:
                files.append(full_path)
    return files


def pair_insv_files(paths: list[str]) -> list[list[str]]:
    """Group dual-lens .insv files by timestamp."""
    lens_pattern = re.compile(r"^(.+)_(00|10)_(.+\.insv)$", re.IGNORECASE)
    groups: dict[str, dict[str, str]] = {}
    ungrouped: list[str] = []

    for path in paths:
        basename = os.path.basename(path)
        match = lens_pattern.match(basename)
        if match:
            prefix, lens_id, suffix = match.groups()
            key = f"{os.path.dirname(path)}|{prefix}_{suffix}"
            if key not in groups:
                groups[key] = {}
            groups[key][lens_id] = path
        else:
            ungrouped.append(path)

    result: list[list[str]] = []
    for key in sorted(groups.keys()):
        lenses = groups[key]
        if "00" in lenses and "10" in lenses:
            result.append([lenses["00"], lenses["10"]])
        else:
            for path in sorted(lenses.values()):
                result.append([path])

    for path in ungrouped:
        result.append([path])

    return result


def suggest_output_path(input_path: str, output_dir: str) -> str:
    """Generate stitched output filename."""
    basename = os.path.basename(input_path)
    name, _ = os.path.splitext(basename)
    return os.path.join(output_dir, f"{name}_stitched.mp4")


def stitch_group(
    group: list[str],
    config: StitchConfig,
    on_progress: Optional[ProgressCallback] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Optional[str]:
    """Run the stitcher CLI on a paired group. Returns output path or None."""
    if len(group) != 2:
        return None

    if not all(f.lower().endswith(".insv") for f in group):
        return None

    if not config.stitcher_path:
        raise ValueError("Stitcher path not configured")

    os.makedirs(config.output_dir, exist_ok=True)
    output_path = suggest_output_path(group[0], config.output_dir)

    if os.path.exists(output_path):
        if on_progress:
            on_progress("stitch", f"Already stitched: {os.path.basename(output_path)}", 100)
        return output_path

    cmd = [
        config.stitcher_path,
        "-inputs", group[0], group[1],
        "-output", output_path,
        "-stitch_type", config.stitch_type,
        "-output_size", config.output_size,
    ]

    if config.enable_flowstate:
        cmd.append("-enable_flowstate")
    if config.enable_colorplus:
        cmd.append("-enable_colorplus")
    if config.extra_options:
        cmd.extend(config.extra_options.split())

    if on_progress:
        on_progress("stitch", f"Stitching: {os.path.basename(group[0])}", 0)

    try:
        process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        for line in process.stdout:
            if cancel_event and cancel_event.is_set():
                process.kill()
                if os.path.exists(output_path):
                    os.remove(output_path)
                raise CancelledError("Stitch cancelled")

            line = line.strip()
            if line:
                pct_match = re.search(r"(\d+)%", line)
                if pct_match and on_progress:
                    on_progress("stitch", f"Stitching: {os.path.basename(group[0])}", int(pct_match.group(1)))

        process.wait()

        if process.returncode != 0:
            raise RuntimeError(f"Stitcher exited with code {process.returncode}")

        if not os.path.exists(output_path):
            raise RuntimeError("Output file not created")

        if on_progress:
            on_progress("stitch", f"Stitched: {os.path.basename(output_path)}", 100)

        return output_path

    except FileNotFoundError:
        raise RuntimeError(f"Stitcher not found at {config.stitcher_path}")


class CancelledError(Exception):
    pass


def get_content_type(filepath: str) -> str:
    """Guess MIME type for a file."""
    mime, _ = mimetypes.guess_type(filepath)
    if mime:
        return mime
    ext = os.path.splitext(filepath)[1].lower()
    types = {
        ".insv": "video/mp4",
        ".insp": "image/jpeg",
        ".lrv": "video/mp4",
        ".mp4": "video/mp4",
    }
    return types.get(ext, "application/octet-stream")


def authenticate(api_url: str, name: str) -> str:
    """Authenticate and return JWT token. Raises on failure."""
    resp = requests.post(f"{api_url}/api/auth/verify", json={"name": name})
    if resp.status_code != 200:
        raise RuntimeError(f"Authentication failed: {resp.text}")
    return resp.json()["token"]


def create_upload_session(api_url: str, token: str, files_manifest: list[dict]) -> dict:
    """Create an upload session with the API. Raises on failure."""
    resp = requests.post(
        f"{api_url}/api/upload/session",
        json={"files": files_manifest},
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to create upload session: {resp.text}")
    return resp.json()


def upload_file_chunks(
    filepath: str,
    urls: list[str],
    chunk_size: int,
    on_progress: Optional[ProgressCallback] = None,
    cancel_event: Optional[threading.Event] = None,
) -> list[dict]:
    """Upload a file in chunks using presigned URLs. Returns list of {partNumber, etag}."""
    file_size = os.path.getsize(filepath)
    file_label = os.path.basename(filepath)
    parts = []

    with open(filepath, "rb") as f:
        for i, url in enumerate(urls):
            if cancel_event and cancel_event.is_set():
                raise CancelledError("Upload cancelled")

            part_number = i + 1
            chunk = f.read(chunk_size)
            if not chunk:
                break

            for attempt in range(3):
                try:
                    resp = requests.put(url, data=chunk, timeout=300)
                    if resp.status_code == 200:
                        etag = resp.headers.get("ETag", "")
                        parts.append({"partNumber": part_number, "etag": etag})

                        uploaded = min(part_number * chunk_size, file_size)
                        pct = int(uploaded / file_size * 100)
                        if on_progress:
                            on_progress("upload", f"Uploading {file_label}", pct)
                        break
                    else:
                        if attempt == 2:
                            raise RuntimeError(f"Part {part_number} failed (HTTP {resp.status_code})")
                except requests.RequestException as e:
                    if attempt == 2:
                        raise RuntimeError(f"Part {part_number} error: {e}")

                time.sleep(2 ** attempt)

    return parts


def complete_file_upload(
    api_url: str, token: str, session_id: str, file_id: str, upload_id: str, parts: list[dict]
) -> bool:
    """Complete a single file's multipart upload."""
    resp = requests.post(
        f"{api_url}/api/upload/complete-file",
        json={
            "sessionId": session_id,
            "fileId": file_id,
            "uploadId": upload_id,
            "parts": parts,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to complete upload: {resp.text}")
    return True


def run_full_pipeline(
    directory: str,
    api_url: str,
    name: str,
    stitch_config: StitchConfig,
    skip_stitch: bool = False,
    on_progress: Optional[ProgressCallback] = None,
    cancel_event: Optional[threading.Event] = None,
) -> str:
    """Run the full scan → stitch → upload pipeline. Returns summary string."""

    def progress(stage: str, msg: str, pct: float):
        if on_progress:
            on_progress(stage, msg, pct)

    # Scan — accept a single file or a directory
    if os.path.isfile(directory):
        all_files = [directory]
        progress("scan", f"Single file: {os.path.basename(directory)}", 100)
    else:
        progress("scan", f"Scanning {directory}...", 0)
        all_files = scan_directory(directory)
        if not all_files:
            raise RuntimeError("No Insta360 files found.")
        progress("scan", f"Found {len(all_files)} files", 100)

    # Pair
    insv_files = [f for f in all_files if f.lower().endswith(".insv")]
    groups = pair_insv_files(insv_files)

    # Stitch
    converted_files: list[str] = []
    if not skip_stitch:
        for i, group in enumerate(groups):
            if cancel_event and cancel_event.is_set():
                raise CancelledError("Cancelled")
            if len(group) == 2:
                def stitch_progress(stage, msg, pct):
                    progress("stitch", f"[{i+1}/{len(groups)}] {msg}", pct)
                output = stitch_group(group, stitch_config, stitch_progress, cancel_event)
                if output:
                    converted_files.append(output)

    # Build manifest
    files_manifest = []
    upload_paths = []

    for filepath in all_files:
        files_manifest.append({
            "name": os.path.basename(filepath),
            "size": os.path.getsize(filepath),
            "contentType": get_content_type(filepath),
            "category": "original",
        })
        upload_paths.append(filepath)

    for filepath in converted_files:
        files_manifest.append({
            "name": os.path.basename(filepath),
            "size": os.path.getsize(filepath),
            "contentType": "video/mp4",
            "category": "converted",
        })
        upload_paths.append(filepath)

    total_size = sum(f["size"] for f in files_manifest)
    progress("upload", f"Total: {len(files_manifest)} files, {total_size / (1024*1024*1024):.2f} GB", 0)

    # Authenticate
    progress("auth", "Authenticating...", 0)
    token = authenticate(api_url, name)
    progress("auth", f"Authenticated as {name}", 100)

    # Create session
    if cancel_event and cancel_event.is_set():
        raise CancelledError("Cancelled")
    progress("session", "Creating upload session...", 0)
    session_data = create_upload_session(api_url, token, files_manifest)
    session_id = session_data["sessionId"]
    progress("session", f"Session: {session_id}", 100)

    # Upload each file
    total_files = len(session_data["files"])
    success_count = 0

    for i, file_info in enumerate(session_data["files"]):
        if cancel_event and cancel_event.is_set():
            raise CancelledError("Cancelled")

        file_id = file_info["fileId"]
        upload_id = file_info["uploadId"]
        urls = file_info["urls"]
        chunk_size = file_info["chunkSize"]
        filepath = upload_paths[i]
        label = os.path.basename(filepath)

        def file_progress(stage, msg, pct):
            progress("upload", f"[{i+1}/{total_files}] {msg}", pct)

        parts = upload_file_chunks(filepath, urls, chunk_size, file_progress, cancel_event)
        complete_file_upload(api_url, token, session_id, file_id, upload_id, parts)
        success_count += 1
        progress("upload", f"Completed: {label}", 100)

    summary = f"Uploaded {success_count}/{total_files} files to session {session_id}"
    progress("done", summary, 100)
    return summary
