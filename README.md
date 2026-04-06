# APEX PH — Philippine Stock Market Terminal

A Bloomberg-style live dashboard for Philippine equities, macro, and AI-assisted research.

**Live at:** `https://[your-github-username].github.io/APEX-PH`

---

## Quick Start

### 1. Fork the repo
Click **Fork** on GitHub → name it `APEX-PH`

### 2. Enable GitHub Pages
Go to repo **Settings → Pages → Source:** select `main` branch, `/ (root)` → Save

### 3. Add yfinance (optional but recommended)
```bash
pip install yfinance
```

### 4. Run locally
```bash
cd scripts
python3 fetch_data.py          # fetch latest data
python3 -m http.server 8080   # open http://localhost:8080 in browser
```

### 5. Push to GitHub
```bash
git init
git add .
git commit -m "init APEX PH"
git remote add origin https://github.com/[username]/APEX-PH.git
git push -u origin main
```

GitHub Actions will auto-update data every hour.

---

## Data Sources (all free)

| Data | Source |
|------|--------|
| PSE Stock Prices | Yahoo Finance (`yfinance` / `.PS` tickers) |
| PSEi Index | Yahoo Finance (`PSI.PS`) |
| FX Rates | BSP Reference Rate (fallback: simulated) |
| BSP Policy Rates | BSP Open Data Portal |
| Bond Yields | Bureau of Treasury / PDST |
| Macro (CPI, GDP) | PSA / BSP public releases |

---

## Tech Stack

- **Single HTML** — no build step, no framework
- **External deps:** Google Fonts (IBM Plex Mono) + Chart.js CDN
- **Data:** `market_data.json` (auto-updated hourly via GitHub Actions)
- **Hosting:** GitHub Pages (free, SSL included)

---

## Project Structure

```
APEX-PH/
├── index.html          # The terminal dashboard
├── market_data.json   # Auto-generated data file (don't edit manually)
├── scripts/
│   └── fetch_data.py  # Data fetcher (run via cron or manually)
├── .github/
│   └── workflows/
│       └── update-data.yml  # Hourly GitHub Actions cron job
└── README.md
```

---

## Customizing

### Change stock list
Edit `PSE_TICKERS` in `scripts/fetch_data.py`.

### Change refresh rate
Edit the cron in `.github/workflows/update-data.yml`:
```yaml
cron: '0 * * * *'   # every hour
# to every 15 mins:
cron: '*/15 * * * *'
```

### Use real BSP / Treasury data
Replace the fallback functions in `fetch_data.py` with actual API calls:
- BSP: `https://www.bsp.gov.ph/SitePages/Statistics/ExchangeRate.aspx`
- BTr: `https://www.treasury.gov.ph/?page_id=247` (RTB auction results)

---

## Roadmap

- [ ] Wire real BSP FX + policy rate data
- [ ] Add PSE disclosed rights / dividends feed
- [ ] AI Analyst panel → connect to Claude API
- [ ] Add 52W high/low sparklines to watchlist
- [ ] Mobile push notifications (price alerts)
