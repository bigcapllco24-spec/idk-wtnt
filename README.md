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

## Run locally

```
npm install
npm run dev        # http://localhost:8788, admin password: localpass
```
