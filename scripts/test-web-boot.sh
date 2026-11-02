#!/bin/bash
# ReadAny web build — boot + golden-path test in a single call
# (sandbox kills all processes at call end, so vite lives only inside here)
set -u
APP=/home/z/my-project/ReadAny/packages/app
LOG=/tmp/vite-web.log
SHOT=/home/z/my-project/download
mkdir -p "$SHOT"

cd "$APP"
READANY_WEB=1 ../../node_modules/.bin/vite --port 5183 --host 127.0.0.1 > "$LOG" 2>&1 &
VITE_PID=$!

for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5183/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 0.5
done
if [ "$code" != "200" ]; then echo "VITE FAILED TO START"; tail -20 "$LOG"; exit 1; fi
echo "== vite up (pid $VITE_PID) =="

# phone-ish viewport for the mobile reading demo
agent-browser set viewport 420 900 > /dev/null 2>&1
agent-browser open http://127.0.0.1:5183 2>&1 | tail -1
sleep 9

echo "== page errors =="
agent-browser errors 2>&1 | head -15
echo "== console (web branch markers) =="
agent-browser console 2>&1 | grep -iE "\[Web\]|\[VectorDB\]|error|failed" | head -20
echo "== title =="
agent-browser get title 2>&1
agent-browser screenshot "$SHOT/readany-web-boot.png" 2>&1 | tail -1

echo "== interactive snapshot (first 60) =="
agent-browser snapshot -i 2>&1 | head -60

kill $VITE_PID 2>/dev/null
wait $VITE_PID 2>/dev/null
echo "== done =="
