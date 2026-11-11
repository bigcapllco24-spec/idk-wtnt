#!/usr/bin/env bash
# Put a game build from the Capcade team onto the laptop.
#
#   scripts/import-game.sh <id> <folder-or-zip> [entry]
#
#   <id>             the game's id in public/apps/apps.json, e.g. sky-rush
#   <folder-or-zip>  the build they sent (a folder, or a .zip of it)
#   [entry]          the page that starts the game, default index.html
#
# Optional pictures in the build: art/tile.jpg (or .webp/.png) for the laptop tile,
# art/hero.jpg for the big picture when the game is open.
# Replaces any older copy of the same game. Then commit and push to put it live.
set -euo pipefail
id="${1:?game id, e.g. sky-rush}"; src="${2:?folder or .zip the Capcade team sent}"; entry="${3:-index.html}"
[[ "$id" =~ ^[a-z0-9-]+$ ]] || { echo "id must be lower-case letters, numbers and dashes"; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"; dest="$root/public/apps/$id"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
if [[ -f "$src" && "$src" == *.zip ]]; then unzip -q "$src" -d "$tmp/x"; src="$tmp/x"
  # a zip that holds one folder: use what's inside it
  if [[ $(ls -A "$src" | wc -l) -eq 1 && -d "$src/$(ls -A "$src")" ]]; then src="$src/$(ls -A "$src")"; fi
fi
[[ -f "$src/$entry" ]] || { echo "No $entry in $src"; exit 1; }
rm -rf "$dest"; mkdir -p "$dest"; cp -R "$src"/. "$dest"/
find "$dest" -name '.DS_Store' -delete
big=$(find "$dest" -type f -size +25M | head -1); [[ -z "$big" ]] || { echo "Too big for Cloudflare Pages (25 MB a file): $big"; exit 1; }
python3 - "$root/public/apps/apps.json" "$id" "$entry" "$dest" <<'PY'
import json, sys, os, datetime
path, id, entry, dest = sys.argv[1:]
d = json.load(open(path)); apps = d['apps']
a = next((x for x in apps if x['id'] == id), None)
if a is None:
    a = {'id': id, 'title': id.replace('-', ' ').title(), 'tags': [], 'status': 'live'}; apps.append(a)
a['entry'] = f'/apps/{id}/{entry}'; a['status'] = 'live'
a['updated'] = datetime.date.today().isoformat()
for kind in ('tile', 'hero'):
    for ext in ('webp', 'jpg', 'png'):
        if os.path.exists(f'{dest}/art/{kind}.{ext}'):
            a['art' if kind == 'tile' else 'hero'] = f'/apps/{id}/art/{kind}.{ext}'; break
json.dump(d, open(path, 'w'), indent=2, ensure_ascii=False); open(path, 'a').write('\n')
print(f"{a['title']} is in public/apps/{id}/ and plays from {a['entry']}")
PY
echo "Check it with the local server, then commit and push."
