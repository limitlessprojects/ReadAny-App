#!/usr/bin/env python3
"""
Compose the Cerebras mobile-reading demo video.

- Draws a phone bezel background (1080x1920, dark, rounded)
- Per scene: pads/trims the screen recording to the narration length,
  scales it into the phone screen, mixes narration starting at +0.4s
- Scene 6 gets a closing text overlay (repo + hashtag)
- Concatenates everything into download/demo-video.mp4 (≈90s)
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

ASSETS = "/home/z/my-project/download/demo-assets"
VOICE = f"{ASSETS}/voice"
OUT = "/home/z/my-project/download"
W, H = 1080, 1920
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

SCENES = [
    # (name, video, narration parts, pad-to hint)
    ("scene-1", f"{ASSETS}/scene-1.webm", ["scene-1.mp3"]),
    ("scene-2", f"{ASSETS}/scene-2.webm", ["scene-2.mp3"]),
    ("scene-3", f"{ASSETS}/scene-3.webm", ["scene-3.mp3"]),
    ("scene-4", f"{ASSETS}/scene-4.webm", ["scene-4.mp3"]),
    ("scene-5", f"{ASSETS}/scene-5.webm", ["scene-5-en.mp3", "scene-5-sw.mp3"]),
    ("scene-6", f"{ASSETS}/scene-6.webm", ["scene-6.mp3"]),
]

LEAD_IN = 0.4  # narration starts this many seconds into each scene


def probe(path: str) -> float:
    try:
        return float(
            subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
        )
    except Exception:
        return 0.0


def make_background() -> str:
    """1080x1920 dark backdrop with a phone bezel; screen hole matches video box."""
    bg = Image.new("RGB", (W, H), "#0e1013")
    d = ImageDraw.Draw(bg)
    # subtle vertical gradient
    for y in range(H):
        shade = 14 + int(10 * (y / H))
        d.line([(0, y), (W, y)], fill=(shade, shade + 3, shade + 7))
    # phone body (rounded rect)
    body_box = (110, 80, 970, 1840)
    d.rounded_rectangle(body_box, radius=64, fill="#05060a", outline="#3c4250", width=3)
    # inner bezel edge
    d.rounded_rectangle((122, 92, 958, 1828), radius=54, outline="#22262e", width=2)
    bg_path = f"{ASSETS}/phone-bg.png"
    bg.save(bg_path)
    return bg_path


def screen_box(video_w=420, video_h=900):
    """Fit the video inside the phone screen area, centered."""
    screen = (138, 108, 942, 1812)  # matches background insets
    sw, sh = screen[2] - screen[0], screen[3] - screen[1]
    scale = min(sw / video_w, sh / video_h)
    w, h = int(video_w * scale), int(video_h * scale)
    x = screen[0] + (sw - w) // 2
    y = screen[1] + (sh - h) // 2
    return x, y, w, h


def build_scene(name: str, video: str, parts: list[str], bg: str) -> str:
    out = f"{ASSETS}/{name}-framed.mp4"
    x, y, w, h = screen_box()
    vdur = probe(video)

    # narration duration (concat parts if multiple)
    if len(parts) == 1:
        ndur = probe(f"{VOICE}/{parts[0]}")
        audio_args = ["-i", f"{VOICE}/{parts[0]}"]
        aindex = 2
    else:
        # concat with a 0.45s gap between EN and SW
        ndur = sum(probe(f"{VOICE}/{p}") for p in parts) + 0.45 * (len(parts) - 1)

    target = max(vdur, ndur + LEAD_IN + 0.6)

    if len(parts) == 1:
        af = f"[{aindex}:a]adelay={int(LEAD_IN*1000)}|{int(LEAD_IN*1000)},apad,atrim=0:{target:.2f}[aout]"
        fc = (
            f"[0:v]tpad=stop_mode=clone:stop_duration={target + 2:.2f},"
            f"scale={w}:{h}:flags=lanczos,setsar=1[pv];"
            f"[1:v][pv]overlay={x}:{y}:shortest=0,format=yuv420p[vout];"
            f"{af}"
        )
        cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-i", video,
            "-loop", "1", "-i", bg,
            "-i", f"{VOICE}/{parts[0]}",
            "-filter_complex", fc,
            "-map", "[vout]", "-map", "[aout]",
            "-t", f"{target:.2f}",
            "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
            out,
        ]
        subprocess.run(cmd, check=True)
    else:
        # multi-part narration (scene 5: EN + SW with a gap)
        fc = (
            f"[0:v]tpad=stop_mode=clone:stop_duration={target + 2:.2f},"
            f"scale={w}:{h}:flags=lanczos,setsar=1[pv];"
            f"[1:v][pv]overlay={x}:{y}:shortest=0,format=yuv420p[vout];"
            f"anullsrc=r=44100:cl=stereo:d=0.45[sil];"
            f"[2:a][sil][3:a]concat=n=3:v=0:a=1[narr0];"
            f"[narr0]adelay={int(LEAD_IN*1000)}|{int(LEAD_IN*1000)},apad,atrim=0:{target:.2f}[aout]"
        )
        cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-i", video,
            "-loop", "1", "-i", bg,
            "-i", f"{VOICE}/{parts[0]}",
            "-i", f"{VOICE}/{parts[1]}",
            "-filter_complex", fc,
            "-map", "[vout]", "-map", "[aout]",
            "-t", f"{target:.2f}",
            "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
            out,
        ]
        subprocess.run(cmd, check=True)
    print(f"{name}: video {vdur:.1f}s narration {ndur:.1f}s -> {target:.1f}s")
    return out


def add_closing_text(scene_path: str) -> str:
    """Overlay repo + hashtag on the last 6 seconds of scene 6."""
    out = f"{ASSETS}/scene-6-text.mp4"
    dur = probe(scene_path)
    start = max(0.0, dur - 6.5)
    vf = (
        f"drawtext=fontfile={FONT}:text='github.com/limitlessprojects/ReadAny':"
        f"fontcolor=white:fontsize=40:x=(w-text_w)/2:y=1738:"
        f"box=1:boxcolor=0x0e1013B3:boxborderw=14:enable='gte(t,{start})',"
        f"drawtext=fontfile={FONT}:text=#bigchipenergy:"
        f"fontcolor=0xF5A623:fontsize=36:x=(w-text_w)/2:y=1802:"
        f"box=1:boxcolor=0x0e1013B3:boxborderw=12:enable='gte(t,{start})'"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", scene_path,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-c:a", "copy",
            out,
        ],
        check=True,
    )
    return out


def main() -> None:
    bg = make_background()
    framed = []
    for name, video, parts in SCENES:
        cached = f"{ASSETS}/{name}-framed.mp4"
        if os.path.exists(cached) and probe(cached) > 3:
            print(f"{name}: cached")
            framed.append(cached)
            continue
        framed.append(build_scene(name, video, parts, bg))
    # swap scene 6 for the text version
    framed[-1] = add_closing_text(framed[-1])

    # concat
    list_file = f"{ASSETS}/concat.txt"
    with open(list_file, "w") as f:
        for path in framed:
            f.write(f"file '{path}'\n")
    final = f"{OUT}/demo-video.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list_file,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", "30",
         "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
         final],
        check=True,
    )
    print(f"FINAL: {final} ({probe(final):.1f}s)")


if __name__ == "__main__":
    main()
