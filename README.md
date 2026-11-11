# idk∗wtnt

Music, art, tees and other things from my desk. A photo of the desk at night is the home page; each object opens a room.

- **Site:** `public/` (plain HTML, CSS and JS, no build step)
- **Server:** `functions/` (Cloudflare Pages Functions)
- **Files** (music, photos, videos) live in Cloudflare **R2**; **views, likes and guestbook** in Cloudflare **D1**.
- **Dashboard:** go to `/admin` on the live site and log in with your admin password: stats (visitors, page views, plays, likes, rooms, sources, countries, devices), uploads, library and guestbook.
- Stats are daily totals in D1 (`stats` table). Days roll over at midnight India time (`TZ_OFFSET_MINUTES`, default 330). Bots and the owner's own browser (after logging in) aren't counted.

## Cloudflare setup (one time)

1. **Storage:** Cloudflare dashboard → **R2 Object Storage** → **Create bucket** → name it `idk-wtnt-media`.
2. **Database:** **Storage & Databases → D1** → **Create database** → name it `idk-wtnt-db`. Tables are created automatically on first use.
3. **Site:** **Workers & Pages → Create → Pages → Connect to Git** → pick this repo.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
   - Click **Save and Deploy**.
4. **Connect storage and database to the site:** open the Pages project → **Settings → Bindings → Add**:
   - **R2 bucket:** variable name `MEDIA` → bucket `idk-wtnt-media`
   - **D1 database:** variable name `DB` → database `idk-wtnt-db`
5. **Admin password:** **Settings → Variables and Secrets → Add** → type **Secret**, name `ADMIN_PASSWORD`, value = a long password only you know.
6. **Redeploy:** **Deployments** → on the latest one, **⋯ → Retry deployment** (bindings apply to new deployments).

Visit `https://<project>.pages.dev/admin`, log in, upload.

## Limits on the free plan

Uploads are refused once stored files reach **9 GB** (set `STORAGE_LIMIT_GB` to change it, max 9.5), so storage never goes past R2's free 10 GB. The upload page shows a meter. Everything else on the free plan stops at its limit rather than billing.


- R2: 10 GB of files, free bandwidth.
- D1: 5 M rows read / 100 K rows written per day.
- Functions: 100 K requests per day.
- Big files upload in 20 MB pieces, so music videos of any size work. Upload web-ready MP4 (H.264) for video and MP3/M4A for music; files are not converted.

## Spotify (optional)

Visitors see your chosen playlists on the laptop screen. Clicking one puts Spotify's own player on the monitor: full songs if they're logged into Spotify in that browser, otherwise 30-second previews, plus an "Open in Spotify" button. You (logged into /admin on the same device) also get a "My library" tab on the laptop that plays your playlists, liked songs and recently played through the site's own player. That part needs Spotify Premium.

1. At developer.spotify.com/dashboard, create an app. Redirect URI: `https://idk-wtnt.pages.dev/admin/spotify.html`. Tick Web API and Web Playback SDK.
2. Copy the app's Client ID. In Cloudflare Pages > idk-wtnt > Settings > Variables, add `SPOTIFY_CLIENT_ID` (plain text is fine, it isn't secret). Redeploy.
3. In /admin, click Connect Spotify and choose what visitors see.

Spotify keeps new apps in development mode: only you (the app owner) can log in through the site, which is all this needs. Visitors never log in here; they log in on Spotify's own player.

## The laptop (idk∗os) and games

Clicking the laptop opens a small desktop: Spotify, your tracks, and games from Capcade.
The games list is `public/apps/apps.json`. A game with no `entry` links to playcapcade.com.

When the Capcade team sends a build of a game (a folder or a .zip whose `index.html` starts the game):

    scripts/import-game.sh sky-rush ~/Downloads/sky-rush.zip

That copies it to `public/apps/sky-rush/`, points the game at it, and picks up `art/tile.jpg` and `art/hero.jpg` if the build has them. Commit and push, and it plays on the monitor. Send a newer build the same way: it replaces the old copy.

Ask the team for a build that runs on its own: Capcade games talk to the Capcade site (tickets, stats, ads) through `bcg.js`, which isn't on this site. Files must be under 25 MB each. This repo is public, so anything put in `public/apps/` can be read by anyone.

## Run locally

```
npm install
npm run dev        # http://localhost:8788, admin password: localpass
```
