/**
 * APEX PH - Cloudflare Worker
 * Data sources (in order of preference):
 *   1. PSE Edge HTML scraping (primary — LIVE DATA)
 *   2. Yahoo Finance crumb API (fallback — may be rate-limited)
 *   3. Hardcoded demo seed (last resort — stale prices)
 *
 * Handles:
 *   GET /                    → HTML Terminal UI
 *   GET /?type=quote&ticker= → Single stock quote
 *   GET /?type=bulk&tickers= → Bulk quotes
 *   GET /?type=fx            → FX rates
 *   GET /?type=index         → PSEi index
 *   GET /?type=bonds         → Bond yields
 */

import { HTML_CONTENT } from './_html_content.js';

// ── PSE Edge ticker → company ID mapping (pre-built for speed) ─────────────────
const PSE_TICKER_IDS = {
  // === Top / Blue Chip ===
  "SM":    { id: "599", name: "SM Investments Corporation" },
  "ALI":   { id: "180", name: "Ayala Land, Inc." },
  "BDO":   { id: "260", name: "BDO Unibank, Inc." },
  "JFC":   { id: "86",  name: "Jollibee Foods Corporation" },
  "TEL":   { id: "6",   name: "PLDT Inc." },
  "MER":   { id: "118", name: "Manila Electric Company" },
  "AC":    { id: "57",  name: "Ayala Corporation" },
  "BPI":   { id: "234", name: "Bank of the Philippine Islands" },
  "URC":   { id: "124", name: "Universal Robina Corporation" },
  "SMPH":  { id: "112", name: "SM Prime Holdings, Inc." },
  "GLO":   { id: "69",  name: "Globe Telecom, Inc." },
  "ICT":   { id: "83",  name: "International Container Terminal Services, Inc." },
  "CEB":   { id: "624", name: "Cebu Air, Inc." },
  "2GO":   { id: "605", name: "2Go Group, Inc." },
  "DMC":   { id: "188", name: "DMCI Holdings, Inc." },
  "SCC":   { id: "157", name: "Semirara Mining and Power Corporation" },
  "MONDE": { id: "682", name: "Monde Nissin Corporation" },
  "CNVRG": { id: "680", name: "Converge Information and Communications Technology Solutions, Inc." },
  "DDMPR": { id: "681", name: "DDMP REIT, Inc." },
  "PLUS":  { id: "96",  name: "DigiPlus Interactive Corp." },
  "AP":    { id: "609", name: "Aboitiz Power Corporation" },
  "AEV":   { id: "16",  name: "Aboitiz Equity Ventures, Inc." },
  "RCR":   { id: "684", name: "RL Commercial REIT, Inc." },
  "NOW":   { id: "264", name: "NOW Corporation" },
  "CNPF":  { id: "652", name: "Century Pacific Food, Inc." },
  "UBP":   { id: "167", name: "Union Bank of the Philippines" },
  "CHP":   { id: "655", name: "Crown Equities, Inc." },

  // === Banking ===
  "MBT":   { id: "119", name: "Metropolitan Bank and Trust Company" },
  "PNB":   { id: "89",  name: "Philippine National Bank" },
  "SECB":  { id: "78",  name: "Security Bank Corporation" },
  "RCB":   { id: "67",  name: "Rizal Commercial Banking Corporation" },
  "DBP":   { id: "183", name: "Development Bank of the Philippines" },
  "LTG":   { id: "108", name: "LT Group, Inc." },

  // === Conglomerates / Holding Firms ===
  "GTCAP": { id: "665", name: "GT Capital Holdings, Inc." },
  "JGS":   { id: "84",  name: "JG Summit Holdings, Inc." },
  "LPZ":   { id: "103", name: "Lopez Holdings Corporation" },
  "MPI":   { id: "113", name: "Metro Pacific Investments Corporation" },
  "AGI":   { id: "630", name: "Alliance Global Group, Inc." },
  "RLC":   { id: "151", name: "Robinsons Land Corporation" },
  "CHI":   { id: "620", name: "Cathay International Holdings, Inc." },

  // === Real Estate ===
  "FLI":   { id: "644", name: "Filinvest Land, Inc." },
  "VLL":   { id: "635", name: "Vista Land and Lifescapes, Inc." },
  "ROCK":  { id: "151", name: "Rockwell Land Corporation" },
  "ELTV":  { id: "686", name: "Estate 1950 Venture, Inc." },
  "MREIT": { id: "685", name: "Megaworld REIT, Inc." },
  "AREIT": { id: "688", name: "AREIT, Inc." },
  "RLT":   { id: "689", name: "RLC REIT Corp." },
  "CLII":  { id: "682", name: "Crown Landmark Realty, Inc." },
  "MPC":   { id: "616", name: "Macquarie Philippine Holdings Corp." },
  "HLCM":  { id: "80",  name: "Holcim Philippines, Inc." },
  "CHIB":  { id: "183", name: "China Banking Corporation" },

  // === Gaming / Entertainment ===
  "BLOOM": { id: "628", name: "Bloomberry Resorts Corporation" },
  "MCP":   { id: "658", name: "Melco Resorts and Entertainment (Philippines) Corporation" },
  "PLM":   { id: "663", name: "Premium Leisure Corporation" },
  "GEAS":  { id: "611", name: "Pacific Online Systems Corporation" },

  // === Utilities / Energy ===
  "FGEN":  { id: "646", name: "First Gen Corporation" },
  "EDC":   { id: "641", name: "Energy Development Corporation" },
  "ACEN":  { id: "696", name: "ACEN Corporation" },
  "SMC":   { id: "545", name: "San Miguel Corporation" },
  "SMC2C": { id: "546", name: "SMC Bulk Water Group, Inc." },

  // === Food & Consumer ===
  "DM":    { id: "183", name: "Del Monte Philippines, Inc." },
  "DFC":   { id: "182", name: "Dole Philippines, Inc." },
  "JOLLIBEE": { id: "86", name: "Jollibee Foods Corporation" },
  "LC":    { id: "106", name: "Lotte Philippines Corporation" },
  "FMIC":  { id: "65",  name: "First Metro Investment Corporation" },

  // === Logistics / Transport ===
  "LBC":   { id: "678", name: "LBC Express Holdings, Inc." },
  "APX":   { id: "676", name: "AirAsia Philippines, Inc." },
  "GOV":   { id: "611", name: "G Raven Entertainment Holdings, Inc." },

  // === Industrial / Manufacturing ===
  "FNI":   { id: "64",  name: "First Nickels, Inc." },
  "HI":    { id: "76",  name: "Havenbrook Holdings, Inc." },
  "ISM":   { id: "87",  name: "ISM Communications Corporation" },
  "MAC":   { id: "109", name: "MacroAsia Corporation" },
  "PXP":   { id: "139", name: "PXP Energy Corporation" },
  "SLI":   { id: "158", name: "SL Agritech Corporation" },
  "GMA7":  { id: "71",  name: "GMA Network, Inc." },
  "TV":    { id: "115", name: "TV5 Network, Inc." },
  "PNN":   { id: "133", name: "Pilmico Foods Corporation" },

  // === REITs ===
  "ALHP":  { id: "687", name: "AyalaLand Logistics Holdings Corp." },
  "CREIT": { id: "684", name: "CityMall Commercial REIT, Inc." },
  "DPR":   { id: "681", name: "Davao Premium REIT, Inc." },
  "FR":    { id: "682", name: "Filinvest REIT Corp." },
  "HH":    { id: "689", name: "Hinayan Holdings, Inc." },

  // === Mining ===
  "LIB":   { id: "104", name: "Lepanto Consolidated Mining Company" },
  "LX":    { id: "107", name: "Lopez Mining Holdings, Inc." },
  "NI":    { id: "125", name: "Nickel Asia Corporation" },
  "FX":    { id: "70",  name: "Philex Mining Corporation" },

  // === Technology / Telecom ===
  "APL":   { id: "19",  name: "Atlas Consolidated Mining and Development Corporation" },
  "CNN":   { id: "53",  name: "Crown Equities, Inc." },
  "GRRN":  { id: "676", name: "Green Planet Group Holdings, Inc." },
};

// PSE tickers that need .PS suffix for Yahoo Finance
const PSE_TICKERS = new Set(Object.keys(PSE_TICKER_IDS));

// ── Demo fallback data (anchored to last known PSE Edge live price) ─────────────
// These are updated whenever PSE Edge data goes stale or is unavailable.
// Anchoring to real prices from last scrape prevents UI jitter.
// Source: PSE Edge (edge.pse.com.ph) — last verified 2026-04-10
const DEMO_STOCKS = {
  "SM":    { price: 621.00, chg:  -0.4,  name: "SM Investments Corp" },
  "ALI":   { price:  18.08, chg:  -1.74, name: "Ayala Land Inc" },
  "BDO":   { price: 122.80, chg:  -0.24, name: "BDO Unibank Inc" },
  "JFC":   { price: 169.50, chg:  -1.74, name: "Jollibee Foods Corp" },
  "TEL":   { price:1300.00, chg:   0.78, name: "PLDT Inc" },
  "MER":   { price: 608.50, chg:  -0.33, name: "Meralco" },
  "AC":    { price: 543.00, chg:   0.46, name: "Ayala Corp" },
  "BPI":   { price: 101.40, chg:  -2.59, name: "Bank of the Philippine Islands" },
  "URC":   { price:  62.00, chg:  -0.8,  name: "Universal Robina Corp" },
  "SMPH":  { price:  20.40, chg:  -2.86, name: "SM Prime Holdings Inc" },
  "GLO":   { price:1650.00, chg:  -0.06, name: "Globe Telecom Inc" },
  "ICT":   { price: 720.00, chg:   3.0,  name: "International Container Terminal" },
  "CEB":   { price:  33.50, chg:   5.18, name: "Cebu Air Inc" },
  "2GO":   { price:   1.70, chg:   null, name: "2Go Group Inc" },
  "DMC":   { price:  10.22, chg:   0.2,  name: "DMCI Holdings Inc" },
  "SCC":   { price:  30.05, chg:   0.17, name: "Semirara Mining & Power" },
  "MONDE": { price:   6.67, chg:  -0.45, name: "Monde Nissin Corp" },
  "CNVRG": { price:  12.50, chg:   1.3,  name: "Converge ICT Solutions" },
  "DDMPR": { price:   1.06, chg:   0.95, name: "DDMP REIT Corp" },
  "PLUS":  { price:  16.80, chg:  -0.94, name: "DigiPlus Corp" },
  "AP":    { price:  44.70, chg:  -3.25, name: "Aboitiz Power" },
  "AEV":   { price:  29.80, chg:  -1.49, name: "Aboitiz Equity Ventures" },
  "FLI":   { price:   0.75, chg:   1.35, name: "Filinvest Land Inc" },
  "RCR":   { price:   6.90, chg:  -0.72, name: "RL Commercial REIT Inc" },
  "NOW":   { price:   0.56, chg:   1.82, name: "NOW Corporation" },
  "CNPF":  { price:  32.20, chg:  -3.3,  name: "Century Pacific Food Inc" },
  "UBP":   { price:  24.75, chg:   0.81, name: "Union Bank of the Philippines" },
};

// ── Utility: parse float from string with commas ─────────────────────────────
function parseFloat2(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

// ── PSE Edge HTML scraper ────────────────────────────────────────────────────
/**
 * Fetch and parse stock data from PSE Edge.
 * Returns null on failure.
 */
async function getPSEEdgeStock(ticker) {
  const info = PSE_TICKER_IDS[ticker];
  if (!info) return null;

  try {
    const res = await fetch(
      `https://edge.pse.com.ph/companyPage/stockData.do?cmpy_id=${info.id}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Cache-Control": "no-cache",
        },
      }
    );
    if (!res.ok) return null;
    const html = await res.text();

    // Extract fields using regex — table format: <th>Key</th><td>Value</td>
    // Price (Last Traded Price)
    const priceMatch = /Last Traded Price<\/th>\s*<td[^>]*>\s*([\d,]+\.\d{2})/.exec(html);
    if (!priceMatch) return null;
    const price = parseFloat2(priceMatch[1]);
    if (!price) return null;

    // Change (direction + amount + %)
    // Full block: <th>Change(% Change)</th><td>down&nbsp;\n   2.50\n( 0.40%)\n  </td>
    let change = 0, changePercent = 0;
    const chgBlock = /Change\(%\s*Change\)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(html);
    if (chgBlock) {
      const block = chgBlock[1];
      const dirDown = /\bdown\b/.test(block);
      const dirUp   = /\bup\b/.test(block);
      const dir     = dirDown ? 'down' : dirUp ? 'up' : null;
      // Amount: strip non-digits except decimal
      const amtM = /([\d,]+\.\d{2})/.exec(block);
      // Percent: ( x.xx%) — magnitude only, sign from direction keyword
      const pctM = /\(([\s-]*[\d.]+)%\)/.exec(block);
      if (dir && amtM && pctM) {
        const amt = parseFloat2(amtM[1]);
        const pct = parseFloat(pctM[1].replace(/\s/g, ''));
        const sign = dir === 'down' ? -1 : 1;
        change        = amt * sign;
        changePercent = pct * sign;
      }
    }

    // Open
    const openMatch = />Open<\/th>\s*<td[^>]*>\s*([\d,]+\.\d{2})/.exec(html);
    const open = openMatch ? parseFloat2(openMatch[1]) : null;

    // High
    const highMatch = />High<\/th>\s*<td[^>]*>\s*([\d,]+\.\d{2})/.exec(html);
    const high = highMatch ? parseFloat2(highMatch[1]) : null;

    // Low
    const lowMatch = />Low<\/th>\s*<td[^>]*>\s*([\d,]+\.\d{2})/.exec(html);
    const low = lowMatch ? parseFloat2(lowMatch[1]) : null;

    // Volume
    const volMatch = />Volume<\/th>\s*<td[^>]*>\s*([\d,]+)/.exec(html);
    const volume = volMatch ? parseInt(volMatch[1].replace(/,/g, ''), 10) : null;

    // Value
    const valMatch = />Value<\/th>\s*<td[^>]*>\s*([\d,]+\.\d+)/.exec(html);
    const value = valMatch ? parseFloat2(valMatch[1]) : null;

    // Previous Close
    const prevMatch = /Previous Close[^<]*<\/th>\s*<td[^>]*>\s*([\d,]+\.\d{2})\s*\(/.exec(html);
    const prevClose = prevMatch ? parseFloat2(prevMatch[1]) : null;

    // Market Cap
    const capMatch = /Market Capitalization<\/th>\s*<td[^>]*>\s*([\d,]+\.\d+)/.exec(html);
    const marketCap = capMatch ? parseFloat2(capMatch[1]) : null;

    // 52W High
    const h52Match = /52-Week High<\/th>\s*<td[^>]*>\s*([\d,]+\.\d{2})/.exec(html);
    const week52High = h52Match ? parseFloat2(h52Match[1]) : null;

    // 52W Low
    const l52Match = /52-Week Low<\/th>\s*<td[^>]*>\s*([\d,]+\.\d{2})/.exec(html);
    const week52Low = l52Match ? parseFloat2(l52Match[1]) : null;

    // Timestamp
    const tsMatch = /As of ([A-Za-z]{3} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/.exec(html);
    const timestamp = tsMatch ? tsMatch[1] : null;

    return {
      price,
      change,
      changePercent,
      open,
      high,
      low,
      volume,
      value,
      prevClose,
      marketCap,
      week52High,
      week52Low,
      timestamp,
    };
  } catch (e) {
    return null;
  }
}

// ── PSE Edge index scraper ────────────────────────────────────────────────────
/**
 * Fetch all PSE sector indices from the index page.
 * Returns { PSEi, sectors } where sectors is a list of { name, value, chg, chgPct }.
 */
async function getPSEEdgeIndex() {
  try {
    const res = await fetch("https://edge.pse.com.ph/index/form.do", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Find the index summary table
    const tableStart = html.indexOf('<table class="list"');
    if (tableStart === -1) return null;
    const tableEnd = html.indexOf('</table>', tableStart) + 8;
    const tableHtml = html.slice(tableStart, tableEnd);

    // Parse each <tr> block
    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRe.exec(tableHtml)) !== null) {
      const row = trMatch[1];

      // Extract label
      const labelMatch = /<td class="label">([^<]+)<\/td>/.exec(row);
      if (!labelMatch) continue;
      const name = labelMatch[1].trim();

      // Extract alignR cells (may contain newlines inside)
      const cellRe = /<td class="alignR"(?:[^>]*)>([\s\S]*?)<\/td>/g;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRe.exec(row)) !== null) {
        cells.push(cellMatch[1]);
      }
      if (cells.length < 3) continue;

      // Extract value (positive, no direction)
      const valStr = cells[0].replace(/[^\d.]/g, '');
      const value = parseFloat(valStr);
      if (!value || value < 100) continue; // skip headers/footnotes

      // Extract change and direction from ▲/▼ symbols
      const chgHtml = cells[1];
      const pctHtml = cells[2];
      const chgDir  = chgHtml.includes('▲') ? 1 : chgHtml.includes('▼') ? -1 : 1;
      const pctDir  = pctHtml.includes('▲') ? 1 : pctHtml.includes('▼') ? -1 : 1;

      const chgStr = chgHtml.replace(/[^-\d.]/g, '');
      const pctStr = pctHtml.replace(/[^-\d.]/g, '');

      rows.push({
        name,
        value,
        chg:    parseFloat(chgStr) * chgDir,
        chgPct: pctStr ? parseFloat(pctStr) * pctDir : null,
      });
    }

    if (!rows.length) return null;

    const [psei, ...sectors] = rows;
    return { PSEi: { value: psei.value, chg: psei.chg, chgPct: psei.chgPct }, sectors };
  } catch (e) {
    return null;
  }
}

// ── Yahoo Finance scraper (fallback) ─────────────────────────────────────────
async function getYFQuote(symbol) {
  try {
    // Step 1: Get cookies
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const setCookie = cookieRes.headers.get("set-cookie") || "";
    const cookieStr = setCookie.split(",").map(c => c.split(";")[0]).join("; ");

    // Step 2: Get crumb
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Cookie": cookieStr,
      },
    });
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("Too Many") || crumb.includes("<") || crumb.length < 5) {
      return null;
    }

    // Step 3: Fetch quote
    const yfUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(crumb)}`;
    const quoteRes = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
        "Cookie": cookieStr,
        "Referer": "https://finance.yahoo.com/",
      },
    });
    const text = await quoteRes.text();
    const data = JSON.parse(text);
    const result = data?.finance?.result?.[0];
    if (!result) return null;

    return {
      price:      result.regularMarketPrice || result.maindexPrice,
      change:     result.regularMarketChange,
      changePercent: result.regularMarketChangePercent,
      open:       result.regularMarketOpen,
      high:       result.regularMarketDayHigh,
      low:        result.regularMarketDayLow,
      volume:     result.regularMarketVolume,
      prevClose:  result.regularMarketPreviousClose,
      marketTime: result.regularMarketTime,
    };
  } catch (e) {
    return null;
  }
}

// ── Yahoo Finance ticker normalizer ─────────────────────────────────────────
function toYFSymbol(ticker) {
  if (ticker === "PSEi" || ticker === "^PSI") return "%5EPSI";
  const clean = ticker.toUpperCase().replace(".PS", "");
  return PSE_TICKERS.has(clean) ? clean + ".PS" : clean;
}

// ── Helper: JSON response ────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

// ── Main fetch handler ────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    // ── GET /?type=quote&ticker=GLO ───────────────────────────────────────────
    if (type === "quote") {
      const ticker = url.searchParams.get("ticker")?.toUpperCase();
      if (!ticker) return json({ error: "No ticker" }, 400);

      // ① Try PSE Edge (primary — LIVE DATA)
      const pseData = await getPSEEdgeStock(ticker);
      if (pseData && pseData.price > 0) {
        const info = PSE_TICKER_IDS[ticker];
        return json({
          source: "pse_edge",
          ticker,
          name: info?.name || null,
          price: pseData.price,
          change: pseData.change,
          changePercent: pseData.changePercent,
          open: pseData.open,
          high: pseData.high,
          low: pseData.low,
          volume: pseData.volume,
          value: pseData.value,
          prevClose: pseData.prevClose,
          marketCap: pseData.marketCap,
          week52High: pseData.week52High,
          week52Low: pseData.week52Low,
          timestamp: pseData.timestamp,
        });
      }

      // ② Try Yahoo Finance (fallback)
      const yfSym = toYFSymbol(ticker);
      const live = await getYFQuote(yfSym);
      if (live && live.price && live.price > 0) {
        return json({
          source: "yahoo_finance",
          ticker,
          price: live.price,
          change: live.change,
          changePercent: live.changePercent,
          open: live.open,
          high: live.high,
          low: live.low,
          volume: live.volume,
          prevClose: live.prevClose,
          marketTime: live.marketTime,
        });
      }

      // ③ Demo fallback
      const demo = DEMO_STOCKS[ticker];
      if (demo) {
        return json({
          source: "demo",
          ticker,
          price: demo.price,
          change: demo.chg / 100 * demo.price,
          changePercent: demo.chg,
          name: demo.name,
          note: "Demo — all live sources unavailable",
        });
      }

      return json({ error: `No data for ${ticker}` }, 404);
    }

    // ── GET /?type=bulk&tickers=SM,ALI,BDO ───────────────────────────────────
    if (type === "bulk") {
      const tickers = (url.searchParams.get("tickers") || "")
        .split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
      if (!tickers.length) return json({ error: "No tickers" }, 400);

      const results = {};
      for (const ticker of tickers) {
        // ① PSE Edge
        const pseData = await getPSEEdgeStock(ticker);
        if (pseData && pseData.price > 0) {
          results[ticker] = { source: "pse_edge", price: pseData.price, change: pseData.change, changePercent: pseData.changePercent, volume: pseData.volume };
          continue;
        }
        // ② Yahoo Finance
        const yfSym = toYFSymbol(ticker);
        const live = await getYFQuote(yfSym);
        if (live && live.price && live.price > 0) {
          results[ticker] = { source: "yahoo_finance", price: live.price, change: live.change, changePercent: live.changePercent, volume: live.volume };
          continue;
        }
        // ③ Demo
        const demo = DEMO_STOCKS[ticker];
        results[ticker] = demo
          ? { source: "demo", price: demo.price, change: demo.chg / 100 * demo.price, changePercent: demo.chg }
          : { source: "unavailable", price: null };
      }
      return json(results);
    }

    // ── GET /?type=fx ─────────────────────────────────────────────────────────
    if (type === "fx") {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const d = await res.json();
        const rates = d.rates || {};
        const phpUSD = rates.PHP ? rates.PHP.toFixed(4) : null;
        if (phpUSD) return json({ source: "open.er-api.com", PHPUSD: parseFloat(phpUSD) });
      } catch {}
      return json({ source: "demo", PHPUSD: 56.82 });
    }

    // ── GET /?type=index ──────────────────────────────────────────────────────
    if (type === "index") {
      // ① PSE Edge (primary — includes sector indices)
      const pseIdx = await getPSEEdgeIndex();
      if (pseIdx && pseIdx.PSEi && pseIdx.PSEi.value > 1000) {
        return json({
          source: "pse_edge",
          PSEi:   pseIdx.PSEi,
          sectors: pseIdx.sectors || [],
        });
      }
      // ② Yahoo Finance
      const live = await getYFQuote("%5EPSI");
      if (live && live.price && live.price > 1000) {
        return json({
          source: "yahoo_finance",
          PSEi:   { value: live.price, chg: live.change, chgPct: live.changePercent },
        });
      }
      // ③ Demo fallback
      return json({ source: "demo", PSEi: { value: 6820.00, chg: 0.35 } });
    }

    // ── GET /?type=bonds ──────────────────────────────────────────────────────
    if (type === "bonds") {
      return json({
        source: "bsp_static",
        bonds: [
          { t: "91D T-Bill", y: 5.95 },
          { t: "182D T-Bill", y: 6.10 },
          { t: "364D T-Bill", y: 6.28 },
          { t: "2Y BVAL",     y: 6.42 },
          { t: "5Y BVAL",     y: 6.65 },
          { t: "10Y BVAL",    y: 6.80 },
          { t: "25Y BVAL",    y: 7.15 },
        ],
      });
    }

    // ── GET /  (root) → serve HTML Terminal UI ─────────────────────────────────
    return new Response(HTML_CONTENT, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
