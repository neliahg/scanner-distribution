# Scanner (POC)

Two separate pages (separate data, colors, Sheet tabs and Drive folders):

- `warehouse.html` (blue) – deliveries that haven't left the warehouse. Scan only → Sheet tab **Warehouse**.
- `pod.html` (orange) – proof of delivery. Scan, then a proof photo → Sheet tab **POD**, photos in Drive **POD photos/<list>/<number>.jpg**.
- `index.html` – a simple chooser with both links.

Shared code: `app.js`, `app.css`. The Sheet link (`SHEET_URL`) is at the top of `app.js`.
`apps-script.gs` – paste into the Google Sheet (Extensions > Apps Script), run `authorize` once, and deploy as a Web app (Execute as: Me, Access: Anyone).
