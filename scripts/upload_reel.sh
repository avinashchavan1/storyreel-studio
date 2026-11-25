#!/usr/bin/env bash
# Upload finished reels for review: contact sheet + desk row, stage "review", app sync, preview/cover/citations/caption,
# masters + audio pack to Hugging Face. Reports each step to the app's live status panel and marks the reel done in the batch.
#   bash scripts/upload_reel.sh R006 R007 ...
set -e
cd "$(dirname "$0")/.."
export HF_HUB_DISABLE_XET=1
SID=$(python3 -c "import json;print(json.load(open('channel.json'))['series']['id'])")
for r in "$@"; do
  R=studio/series/$SID/reels/$r; O=$R/out
  python3 scripts/status.py auto $r 8 "Final checks" >/dev/null 2>&1 || true
  (cd studio && NO_STATUS=1 python3 make_reel.py sheet series/$SID/reels/$r >/dev/null && NO_STATUS=1 python3 make_reel.py desk series/$SID/reels/$r >/dev/null)
  python3 - "$r" "$SID" <<'PY'
import json, sys; p=f"studio/series/{sys.argv[2]}/reels/stages.json"; d=json.load(open(p)); d[sys.argv[1]]="review"; json.dump(d,open(p,"w"),indent=1)
PY
  python3 scripts/sync.py >/dev/null
  python3 scripts/status.py auto $r 8 "Uploading the preview to the app" >/dev/null 2>&1 || true
  for k in preview:${r}_final.mp4 thumbnail:${r}_cover.jpg citations:${r}_citations.md caption:${r}_caption.txt; do python3 scripts/media.py $r ${k%%:*} $O/${k##*:} | tail -1; done
  python3 scripts/status.py auto $r 8 "Uploading the masters (Hugging Face)" >/dev/null 2>&1 || true
  python3 scripts/masters.py $r 2>&1 | grep -E "attached|rror" | tail -2
  python3 scripts/audiopack.py push $r 2>&1 | tail -1
  python3 scripts/status.py done $r >/dev/null 2>&1 || true
  echo "$r uploaded"
done
