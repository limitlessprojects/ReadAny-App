#!/bin/bash
# Re-record scenes 2-6 with clean-state verification
set -u
DIR=/home/z/my-project/download/demo-assets
mkdir -p "$DIR"

rec() { agent-browser record start "$DIR/$1.webm" > /dev/null 2>&1; }
stop() { agent-browser record stop > /dev/null 2>&1; }
js() { agent-browser eval "$1" > /dev/null 2>&1; }
jsr() { agent-browser eval "$1" 2>&1 | tail -1; }

cleanup() {
  # close any open dropdown/popover/driver tour + the sidebar drawer
  agent-browser press Escape > /dev/null 2>&1
  js "(function(){document.querySelectorAll('.driver-popover, [class*=driver-popover]').forEach(e=>e.remove());const x=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='×');x&&x.click();return 1})()"
  js "(function(){const m=document.querySelector('button svg.lucide-menu');const btn=m?m.closest('button'):null;const drawer=document.querySelector('[class*=sidebar],[data-state=open]');if(btn&&drawer&&drawer.offsetParent){btn.click();return 1}return 0})()"
  sleep 1
}

TA() { agent-browser snapshot -i 2>/dev/null | grep -E "textbox" | tail -1 | grep -oE 'ref=[^]]*' | cut -d= -f2; }

# ---------------- SCENE 2: import flow (clean) ----------------
echo "== scene 2 =="
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Library'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
cleanup
sleep 1
rec scene-2
sleep 1
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>(x.title==='Add Book'||x.textContent.trim().includes('Add Book')||x.textContent.trim().includes('Import Books'))&&x.offsetParent);b&&b.click();return 1})()"
sleep 1.5
js "(function(){const b=[...document.querySelectorAll('*')].filter(x=>x.offsetParent&&x.children.length===0&&x.textContent.trim()==='Local Files');const el=b[b.length-1];el&&el.click();return 1})()"
sleep 1.5
B64=$(base64 -w0 /home/z/my-project/ReadAny/tests/fixtures/test-paper-2.pdf)
js "(async function(){const b=Uint8Array.from(atob('$B64'),c=>c.charCodeAt(0));const f=new File([b],'retrieval-kernels-2026.pdf',{type:'application/pdf'});await window.__readanyResolveFiles([f]);return 1})()"
sleep 7
stop
echo "scene-2 done"

# ---------------- SCENE 3: Cerebras speed ----------------
echo "== scene 3 =="
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2.5
cleanup
sleep 0.5
rec scene-3
sleep 1
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='New Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 1.5
T=$(TA)
agent-browser click "$T" > /dev/null 2>&1
agent-browser type "$T" "Summarize this paper's key findings" 2>&1 | tail -1
agent-browser press Enter > /dev/null 2>&1
for i in $(seq 1 30); do
  agent-browser eval "document.body.innerText.includes('TTFT')?1:0" 2>/dev/null | grep -q 1 && break
  sleep 1
done
sleep 3
stop
echo "scene-3 done (badge: $(jsr "document.body.innerText.includes('TTFT')?1:0"))"

# ---------------- SCENE 4: grounded reader AI ----------------
echo "== scene 4 =="
cleanup
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Library'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
cleanup
sleep 0.5
js "(function(){const c=[...document.querySelectorAll('*')].filter(x=>x.offsetParent&&x.children.length===0&&/Systolic Array/.test(x.textContent||''));const el=c[c.length-1];el&&el.click();return 1})()"
sleep 6
js "(function(){const x=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='×');x&&x.click();return 1})()"
sleep 1
rec scene-4
sleep 1
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='Ask AI'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2.5
T=$(TA)
agent-browser click "$T" > /dev/null 2>&1
agent-browser type "$T" "What problem does the scheduler solve?" 2>&1 | tail -1
agent-browser press Enter > /dev/null 2>&1
sleep 14
stop
echo "scene-4 done"

# ---------------- SCENE 5: Swahili + TTS ----------------
echo "== scene 5 =="
cleanup
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2.5
cleanup
sleep 0.5
rec scene-5
sleep 1
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='New Chat'&&x.offsetParent);b&&b.click();return 1})()"
sleep 1.5
T=$(TA)
agent-browser click "$T" > /dev/null 2>&1
agent-browser type "$T" "Eleza hii karatasi kwa Kiswahili rahisi tafadhali" 2>&1 | tail -1
agent-browser press Enter > /dev/null 2>&1
for i in $(seq 1 25); do
  agent-browser eval "document.body.innerText.includes('Kilichothibitishwa')?1:0" 2>/dev/null | grep -q 1 && break
  sleep 1
done
sleep 2
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.title==='Read aloud'&&x.offsetParent);b&&b.click();return 1})()"
sleep 10
stop
echo "scene-5 done"

# ---------------- SCENE 6: closing hold ----------------
echo "== scene 6 =="
cleanup
js "(function(){const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Library'&&x.offsetParent);b&&b.click();return 1})()"
sleep 2
cleanup
sleep 0.5
rec scene-6
sleep 2
js "(function(){const c=[...document.querySelectorAll('*')].filter(x=>x.offsetParent&&x.children.length===0&&/Systolic Array/.test(x.textContent||''));const el=c[c.length-1];el&&el.click();return 1})()"
sleep 3
js "(function(){const x=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='×');x&&x.click();return 1})()"
sleep 9
stop
echo "scene-6 done"

for s in 2 3 4 5 6; do D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/scene-$s.webm" 2>/dev/null); echo "scene-$s: ${D}s"; done
echo "RE-RECORD DONE"
