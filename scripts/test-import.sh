#!/bin/bash
# Golden path v2: clear console -> skip onboarding -> import via dialog shim -> library
set -u
APP=/home/z/my-project/ReadAny/packages/app
LOG=/tmp/vite-web.log
SHOT=/home/z/my-project/download
PDF=/home/z/my-project/ReadAny/tests/fixtures/test-paper.pdf

# kill any orphaned vite holding the port, then verify it is actually free
pkill -f "vite --port 5183" 2>/dev/null
sleep 1.5
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:5183/ 2>/dev/null)
  [ "$code" != "200" ] && break
  pkill -9 -f "vite --port 5183" 2>/dev/null
  sleep 1
done

/home/z/my-project/ReadAny/scripts/dev-web-ctl.sh start || exit 1

agent-browser close > /dev/null 2>&1
agent-browser set viewport 420 900 > /dev/null 2>&1
agent-browser open http://127.0.0.1:5183 2>&1 | tail -1

echo "== wait for app render (up to 75s) =="
READY=0
for i in $(seq 1 75); do
  if agent-browser snapshot -i 2>/dev/null | grep -q 'Import Books'; then READY=1; break; fi
  sleep 1
done
[ "$READY" = "1" ] || { echo "APP DID NOT RENDER"; agent-browser errors 2>&1 | head -8; agent-browser console 2>&1 | tail -8; kill $VITE_PID 2>/dev/null; exit 1; }
echo "app rendered after ${i}s"

echo "== FRESH console (boot) =="
agent-browser console 2>&1 | grep -iE "\[Web\]|\[VectorDB\]|no such table|error" | head -10

echo "== skip onboarding (if present) =="
agent-browser find text "Skip" click 2>&1 | tail -1

REF=$(agent-browser snapshot -i 2>/dev/null | grep 'Import Books' | sed 's/.*ref=\([^]]*\)].*/\1/' | head -1)
echo "import ref: $REF"
[ -n "$REF" ] && agent-browser click "$REF" 2>&1 | tail -1
sleep 1.5

echo "== menu items =="
agent-browser snapshot -i 2>&1 | grep -iE "import|local|url|webdav|menuitem|option|file" | head -12
agent-browser screenshot "$SHOT/readany-import-menu.png" > /dev/null 2>&1

echo "== click local import item =="
CLICKREF=$(agent-browser snapshot -i 2>/dev/null | grep -iE 'local|from file|device' | sed 's/.*ref=\([^]]*\)].*/\1/' | head -1)
echo "local item ref: $CLICKREF"
[ -n "$CLICKREF" ] && agent-browser click "$CLICKREF" 2>&1 | tail -1
sleep 1.5

echo "== resolve dialog via automation seam =="
B64=$(base64 -w0 "$PDF")
agent-browser eval "(async function(){const b=Uint8Array.from(atob('$B64'),c=>c.charCodeAt(0));const f=new File([b],'sparse-scheduling-paper.pdf',{type:'application/pdf'});if(!window.__readanyResolveFiles)return 'NO HOOK';const paths=await window.__readanyResolveFiles([f]);return 'resolved: '+JSON.stringify(paths);})()" 2>&1 | tail -2

echo "== wait for library card (up to 40s) =="
CARD=0
for i in $(seq 1 40); do
  if agent-browser snapshot -i 2>/dev/null | grep -qiE 'sparse|paper'; then CARD=1; break; fi
  sleep 1
done
echo "card detected: $CARD after ${i}s"
sleep 3

echo "== console after import =="
agent-browser console 2>&1 | grep -iE "import|error|fail|books" | head -15
agent-browser errors 2>&1 | head -6
agent-browser screenshot "$SHOT/readany-import.png" 2>&1 | tail -1

echo "== library =="
agent-browser snapshot -i 2>&1 | grep -iE "sparse|paper|reading|unread|\.pdf" | head -8

echo "== done (server left running via dev-web-ctl) =="
