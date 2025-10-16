Tribute Page - Single Deceased

Overview
- A single, public page for dignitaries and mourners to post tributes.
- Node/Express server, SQLite storage, static modern UI.

Run locally
```bash
cd tribute-page
npm install
npm run start
# open http://localhost:3000
```

Add the deceased's photos
- Put files in `public/images/`.
- Recommended names:
  - `cover.jpg` for the hero background (large, tasteful portrait 1600x900+)
  - `gallery-1.jpg`, `gallery-2.jpg`, ... for the gallery
- Then update `config/deceased.json`:
```json
{
  "fullName": "Dr. Jane Doe",
  "headline": "A life of service and excellence.",
  "sunrise": "1950-05-14",
  "sunset": "2024-09-28",
  "coverImage": "/images/cover.jpg",
  "gallery": [
    "/images/gallery-1.jpg",
    "/images/gallery-2.jpg"
  ],
  "autoApprove": true
}
```

Moderation
- Set `autoApprove: false` to require manual review. (A simple admin screen can be added later.)

Security and professionalism
- Helmet security headers, rate limiting, and tight JSON limits are enabled.
- Messages are sanitized server-side. Images are served from your `public/images/` only.

Deploy suggestions
- Render, Railway, Fly.io, or a small VPS.
- Ensure the `data/` directory is writable; it stores `tributes.db`.
- Set `PORT` env var if your platform provides one. The app reads it.

Structure
```
tribute-page/
  public/
    index.html
    styles.css
    app.js
    images/
  config/
    deceased.json
  data/
    tributes.db (auto-created)
  server.js
  package.json
```
