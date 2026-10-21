# Slot booking (MariBank InstaPay)

## Run locally
    ADMIN_PASSWORD=choose-a-strong-password node server.js
Open http://localhost:3000 . Owner sign in (link on the page) uses ADMIN_PASSWORD.

## Settings (environment variables)
- ADMIN_PASSWORD  required, your owner password
- PRICE           price per slot in pesos (default 150)
- PORT            default 3000
- DATA_DIR        folder for data.json (point to a persistent disk when hosting)

## Host it publicly (any Node host)
Render, Railway, Fly.io or a VPS all work: upload this folder, start command `node server.js`,
set ADMIN_PASSWORD, and attach a persistent disk/volume with DATA_DIR pointing at it,
otherwise bookings are lost on redeploy. Use the https link the host gives you.

## To change
Session times, slot count and your QR live in public/index.html and server.js (SESS, TOTAL); replace public/qr.jpg for a new QR.

## Spreadsheet export
Signed in as owner, press "Download spreadsheet (CSV)" under Confirmed bookings. It opens in Excel or Google Sheets, one row per slot.
Paste its rows into confirmed-bookings.xlsx (Bookings sheet, from row 3) to get totals on the Summary sheet.
