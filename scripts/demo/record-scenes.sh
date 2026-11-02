#!/bin/bash
# Record all demo scenes (agent-browser, phone viewport, one call)
set -u
DIR=/home/z/my-project/download/demo-assets
mkdir -p "$DIR"

rec() { # rec <name>
  agent-browser record start "$DIR/$1.webm" > /dev/null 2>&1
}

stop() {
  agent-browser record stop > /dev/null 2>&1
}

clickref() { # clickref <grep-pattern>
  local ref
  ref=$(agent-browser snapshot -i 2>/dev/null | grep -E "$1" | sed 's/.*ref=\([^]]*\)].*/\1/' | head -1)
  [ -n "$ref" ] && agent-browser click "$ref" > /dev/null 2>&1
}

js() { agent-browser eval "$1" > /dev/null 2>&1; }

waitfor() { # waitfor <grep> [timeout]
  local timeout=${2:-30}
  for i in $(seq 1 "$timeout"); do
    agent-browser snapshot -i 2>/dev/null | grep -qE "$1" && return 0
    sleep 1
  done
  return 1
}

# ---------------- SCENE 1: reader (paper on a phone) ----------------
echo "== scene 1 =="
CARD=$(agent-browser snapshot -i 2>/dev/null | grep -oE 'generic "Systolic[^"]*" \[ref=[^]]*\]' | grep -oE 'ref=[^]]*' | head -1 | cut -d= -f2)
rec scene-1
sleep 1
agent-browser click "$CARD" > /dev/null 2>&1
sleep 5
js "(function(){const x=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='×');x&&x.click();return 1})()"
sleep 2
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('Next')||x.getAttribute('aria-label')?.includes('Next'));b&&b.click();return 1})()"
sleep 3
stop
echo "scene-1 done"

# ---------------- SCENE 2: import flow ----------------
echo "== scene 2 =="
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>(x.title||x.textContent).match(/Back/)&&x.offsetParent);b&&b.click();return 1})()"
sleep 2.5
waitfor "Import Books|Add Book" 20
rec scene-2
sleep 1
# open Add Book dropdown (library page) or Import Books
clickref 'Add Book|Import Books'
sleep 1.2
clickref 'Local Files'
sleep 1.5
B64=$(base64 -w0 /home/z/my-project/ReadAny/tests/fixtures/test-paper.pdf)
js "(async function(){const b=Uint8Array.from(atob('$B64'),c=>c.charCodeAt(0));const f=new File([b],'sparse-scheduling-2026.pdf',{type:'application/pdf'});await window.__readanyResolveFiles([f]);return 1})()"
sleep 6
stop
echo "scene-2 done"

# ---------------- SCENE 3: Cerebras speed (global chat) ----------------
echo "== scene 3 =="
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
rec scene-3
sleep 1
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='New Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 1.5
TA=$(agent-browser snapshot -i 2>/dev/null | grep -E "textbox" | tail -1 | grep -oE 'ref=[^]]*' | cut -d= -f2)
agent-browser click "$TA" > /dev/null 2>&1
agent-browser type "$TA" "Summarize this paper's key findings" 2>&1 | tail -1
agent-browser press Enter > /dev/null 2>&1
for i in $(seq 1 30); do
  agent-browser eval "document.body.innerText.includes('TTFT')?1:0" 2>/dev/null | grep -q 1 && break
  sleep 1
done
sleep 3
stop
echo "scene-3 done"

# ---------------- SCENE 4: grounded reader AI ----------------
echo "== scene 4 =="
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Library'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
CARD=$(agent-browser snapshot -i 2>/dev/null | grep -oE 'generic "Systolic[^"]*" \[ref=[^]]*\]' | grep -oE 'ref=[^]]*' | head -1 | cut -d= -f2)
agent-browser click "$CARD" > /dev/null 2>&1
sleep 5
rec scene-4
sleep 1
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='Ask AI'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
js "(function(){const ta=document.querySelector('textarea');if(!ta)return 0;ta.focus();return 1})()"
TA=$(agent-browser snapshot -i 2>/dev/null | grep -E "textbox" | tail -1 | grep -oE 'ref=[^]]*' | cut -d= -f2)
agent-browser click "$TA" > /dev/null 2>&1
agent-browser type "$TA" "What problem does the scheduler solve and how?" 2>&1 | tail -1
agent-browser press Enter > /dev/null 2>&1
sleep 12
stop
echo "scene-4 done"

# ---------------- SCENE 5: Swahili + TTS ----------------
echo "== scene 5 =="
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
rec scene-5
sleep 1
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='New Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 1.5
TA=$(agent-browser snapshot -i 2>/dev/null | grep -E "textbox" | tail -1 | grep -oE 'ref=[^]]*' | cut -d= -f2)
agent-browser click "$TA" > /dev/null 2>&1
agent-browser type "$TA" "Eleza hii karatasi kwa Kiswahili rahisi tafadhali" 2>&1 | tail -1
agent-browser press Enter > /dev/null 2>&1
for i in $(seq 1 25); do
  agent-browser eval "document.body.innerText.includes('Kilichothibitishwa')?1:0" 2>/dev/null | grep -q 1 && break
  sleep 1
done
sleep 2
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='Read aloud'&&x.offsetParent);b&&b.click();return 1})()"
sleep 9
stop
echo "scene-5 done"

# ---------------- SCENE 6: closing hold ----------------
echo "== scene 6 =="
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Library'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
rec scene-6
sleep 3
CARD=$(agent-browser snapshot -i 2>/dev/null | grep -oE 'generic "Systolic[^"]*" \[ref=[^]]*\]' | grep -oE 'ref=[^]]*' | head -1 | cut -d= -f2)
agent-browser click "$CARD" > /dev/null 2>&1
sleep 9
stop
echo "scene-6 done"

ls -la "$DIR"/*.webm 2>/dev/null
echo "ALL SCENES RECORDED"
