# BetBetter — Polymarket US Sports Only

Data source: **https://gateway.polymarket.us** (not polymarket.com).

## Sports included
MLB · NFL · NBA · WNBA · CFB · UFC · ATP · WTA · CBB

## Live APIs
- `GET /api/markets?mode=all|live|upcoming&league=mlb`
- `GET /api/signals?mode=all|live|upcoming` — scored sports markets only
- `POST /api/deep-research` — needs OPENAI_API_KEY
- `POST /api/discord-alert`

## UI
- Scanner: **All / Live / Upcoming** filters, real scores & periods when live
- Markets tab: same Live/Upcoming buttons, real game board
- Login: local username + journal on device (for your own stats)

## Deploy
Framework Other · empty build · empty output · root = this folder

Env: OPENAI_API_KEY optional

## Discord sign-in

1. https://discord.com/developers/applications → New Application
2. OAuth2 → Add redirect: `https://YOUR_VERCEL_DOMAIN/api/auth/discord-callback`
3. Copy Client ID + Client Secret
4. Vercel → Project → Settings → Environment Variables:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
5. Redeploy
6. Log in modal → **Continue with Discord**

Scopes: `identify` + `email`

## Polymarket keys + Odds API

### Vercel env (recommended)
- `POLYMARKET_KEY_ID` / `POLYMARKET_SECRET_KEY` — for signed WS trades later
- `ODDS_API_KEY` — free key from https://the-odds-api.com
- `OPENAI_API_KEY` — Deep Research

### Settings (testing)
Paste the same values in Settings for local browser testing. Odds key can be sent as `?apiKey=` to `/api/odds` for tests; prefer server env in production.

### Public book (no key)
`GET /api/book?slug=MARKET_SLUG` → gateway.polymarket.us order book + imbalance.

### Odds
`GET /api/odds?league=mlb|nfl|nba|...`
