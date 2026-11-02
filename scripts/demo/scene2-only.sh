#!/bin/bash
# Scene 2 — reload to reset to Library, then record the import
set -u
DIR=/home/z/my-project/download/demo-assets

refclick() {
  local ref
  ref=$(agent-browser snapshot -i 2>/dev/null | grep -E "$1" | sed 's/.*ref=\([^]]*\)].*/\1/' | head -1)
  if [ -n "$ref" ]; then agent-browser click "$ref" > /dev/null 2>&1; return 0; fi
  return 1
}

agent-browser reload > /dev/null 2>&1
for i in $(seq 1 60); do
  agent-browser snapshot -i 2>/dev/null | grep -q "Import Books" && break
  sleep 1
done
agent-browser find text "Skip" click > /dev/null 2>&1
sleep 2
agent-browser press Escape > /dev/null 2>&1
sleep 1
agent-browser snapshot -i 2>/dev/null | grep -q "Add Book" && echo "library ready" || { echo "STILL NOT LIBRARY"; exit 1; }

agent-browser record start "$DIR/scene-2.webm" > /dev/null 2>&1
sleep 1
refclick '"Add Book"'
sleep 1.5
refclick '"Local Files"'
sleep 1.5
B64=$(base64 -w0 /home/z/my-project/ReadAny/tests/fixtures/test-paper-2.pdf)
agent-browser eval "(async function(){const b=Uint8Array.from(atob('$B64'),c=>c.charCodeAt(0));const f=new File([b],'retrieval-kernels-2026.pdf',{type:'application/pdf'});await window.__readanyResolveFiles([f]);return 1})()" > /dev/null 2>&1
sleep 3
agent-browser press Escape > /dev/null 2>&1
sleep 2
# reload inside the recording: library re-renders with the new book
agent-browser reload > /dev/null 2>&1
for i in $(seq 1 40); do
  agent-browser snapshot -i 2>/dev/null | grep -q "Add Book" && break
  sleep 1
done
sleep 3
agent-browser record stop > /dev/null 2>&1
ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/scene-2.webm"
N=$(ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$DIR/scene-2.webm")
ffmpeg -y -v error -i "$DIR/scene-2.webm" -vf "select=eq(n\,$((N-20)))" -vframes 1 "$DIR/sc2-final.png"
echo "scene-2 done"
