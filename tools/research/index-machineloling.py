#!/usr/bin/env python3
"""Index public MachineLoLing uploads and retain local caption evidence."""

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

CHANNEL = "https://www.youtube.com/@MachineLoLing"


def run(executable, arguments):
    return subprocess.run(
        [executable, "--js-runtimes", "node", "--no-warnings", *arguments],
        text=True,
        capture_output=True,
        check=False,
    )


def capture(output):
    executable = shutil.which("yt-dlp")
    if not executable:
        raise ValueError("Install yt-dlp before the public-channel capture.")
    output.mkdir(parents=True, exist_ok=True)
    inventory = {}
    tabs = []
    for tab in ("videos", "shorts", "streams"):
        result = run(executable, ["--flat-playlist", "--dump-single-json", f"{CHANNEL}/{tab}"])
        if result.returncode:
            absent = f"does not have a {tab} tab" in result.stderr.lower()
            tabs.append({"tab": tab, "status": "absent" if absent else "failed", "detail": result.stderr.strip()})
            continue
        data = json.loads(result.stdout)
        entries = data.get("entries", [])
        ids = []
        for entry in entries:
            if entry and entry.get("id"):
                inventory[entry["id"]] = entry
                ids.append(entry["id"])
        tabs.append({"tab": tab, "status": "indexed", "videoIds": ids})
    videos = []
    for video_id in sorted(inventory):
        url = f"https://www.youtube.com/watch?v={video_id}"
        result = run(executable, ["--no-playlist", "--skip-download", "--dump-single-json", url])
        if result.returncode:
            videos.append({"id": video_id, "url": url, "status": "metadata-failed", "detail": result.stderr.strip()})
            continue
        metadata = json.loads(result.stdout)
        if metadata.get("channel_url", "").rstrip("/").split("/")[-1] != "UCh9TecqNflJISfDPqwJwKEw":
            raise ValueError(f"Unexpected channel for video {video_id}")
        captions = run(executable, [
            "--no-playlist", "--skip-download", "--write-subs", "--write-auto-subs",
            "--sub-langs", "en", "--sub-format", "json3", "-o", str(output / "%(id)s.%(ext)s"), url,
        ])
        caption = output / f"{video_id}.en.json3"
        caption_evidence = {"status": "unavailable"}
        if captions.returncode == 0 and caption.is_file() and caption.stat().st_size:
            content = caption.read_bytes()
            parsed = json.loads(content)
            if any(event.get("segs") for event in parsed.get("events", [])):
                caption_evidence = {"status": "captured", "file": caption.name, "sha256": hashlib.sha256(content).hexdigest()}
        videos.append({
            "id": video_id, "url": url, "title": metadata.get("title"),
            "published": metadata.get("upload_date"), "durationSeconds": metadata.get("duration"),
            "description": metadata.get("description"), "chapters": metadata.get("chapters", []),
            "status": "metadata-captured", "captions": caption_evidence,
        })
    complete = not any(tab["status"] == "failed" for tab in tabs) and bool(videos) and all(
        video["status"] == "metadata-captured" and video["captions"]["status"] == "captured" for video in videos
    )
    manifest = {
        "schemaVersion": 1, "channelUrl": CHANNEL,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "publicInventoryComplete": not any(tab["status"] == "failed" for tab in tabs),
        "inventoryAndCaptionsComplete": complete,
        "limits": "Public uploads only. Private, deleted, and unlisted videos are not enumerated. Captions may be automatic and contain errors. No creator website data or scoring files are collected.",
        "tabs": tabs, "videos": videos,
    }
    path = output / "channel-index.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Indexed {len(videos)} public videos. Inventory and captions complete: {complete}. Manifest: {path}")
    return 0 if complete else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Local evidence directory. Keep captions private and outside public assets.")
    args = parser.parse_args()
    try:
        workspace = Path(__file__).resolve().parents[2]
        destination = args.output.resolve()
        if destination == workspace or destination == workspace / "public" or workspace / "public" in destination.parents:
            raise ValueError("Choose an evidence directory outside public assets and the repository root.")
        return capture(destination)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
