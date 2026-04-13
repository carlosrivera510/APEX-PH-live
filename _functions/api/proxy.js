// APEX PH - Cloudflare Worker Proxy
// Scrapes Yahoo Finance for PSE stock data, falls back to demo data

// ── Yahoo Finance scraper (no API key needed) ─────────────────────────────────
async function getYFQuote(symbol) {
  try {
    // Step 1: Get crumb + cookies from Yahoo Finance
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      }
    });
    
    const cookies = cookieRes.headers.get("set-cookie") || "";
    const cookieStr = cookies.split(",").map(c => c.split(";")[0]).join("; ");

    // Step 2: Get crumb
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Cookie": cookieStr,
      }
    });
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("Too Many") || crumb.includes("<")) {
      return null; // Rate limited or failed
    }

    // Step 3: Fetch quote data with crumb
    const yfUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(crumb)}`;
    const quoteRes = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
        "Cookie": cookieStr,
        "Referer": "https://finance.yahoo.com/",
      }
    });
    
    const text = await quoteRes.text();
    const data = JSON.parse(text);
    const result = data?.finance?.result?.[0];
    
    if (!result) return null;

    return {
      symbol: result.symbol,
      price: result.regularMarketPrice || result.maindexPrice,
      change: result.regularMarketChange,
      changePercent: result.regularMarketChangePercent,
      open: result.regularMarketOpen,
      high: result.regularMarketDayHigh,
      low: result.regularMarketDayLow,
      volume: result.regularMarketVolume,
      prevClose: result.regularMarketPreviousClose,
      marketTime: result.regularMarketTime,
      exchangeName: result.exchangeName,
    };
  } catch (e) {
    return null;
  }
}

// ── Demo seed prices (for fallback) ────────────────────────────────────────────
const DEMO_STOCKS = {
  "SM":    { price: 975.89, chg:  0.45, name: "SM Investments Corp" },
  "ALI":   { price:  39.18, chg:  0.38, name: "Ayala Land Inc" },
  "BDO":   { price: 171.59, chg: -0.65, name: "BDO Unibank Inc" },
  "JFC":   { price: 285.36, chg: -0.31, name: "Jollibee Foods Corp" },
  "TEL":   { price:1680.58, chg:  1.17, name: "PLDT Inc" },
  "MER":   { price: 424.24, chg: -0.87, name: "Meralco" },
  "AC":    { price: 780.41, chg: -0.06, name: "Ayala Corp" },
  "BPI":   { price: 117.98, chg:  1.16, name: "Bank of the Philippine Islands" },
  "URC":   { price: 148.89, chg: -0.22, name: "Universal Robina Corp" },
  "SMPH":  { price:  22.24, chg:  1.37, name: "San Miguel Corp" },
  "GLO":   { price:2420.94, chg:  1.28, name: "Globe Telecom Inc" },
  "ICT":   { price:  33.80, chg:  0.54, name: "AyalaLand Logistics REIT" },
  "CEB":   { price:  31.55, chg:  2.10, name: "Cebu Air Inc" },
  "2GO":   { price:  17.55, chg: -0.42, name: "2GO Group Inc" },
  "DMC":   { price:   8.20, chg:  0.73, name: "DMCI Holdings Inc" },
  "SCC":   { price:  18.40, chg: -1.20, name: "Semirara Mining & Power" },
  "MONDE": { price:   8.70, chg:  0.23, name: "Monde Nissin Corp" },
  "CNVRG": { price:  13.60, chg:  0.88, name: "Converge ICT Solutions" },
  "DDMPR": { price:  14.20, chg: -0.14, name: "DDMP REIT Corp" },
  "PLUS":  { price:  31.80, chg:  3.45, name: "DigiPlus Corp" },
  // PSE index
  "PSEi":  { price: 6820.00, chg:  0.35, name: "Philippine Stock Exchange Index" },
};

// PSE tickers need .PS suffix for Yahoo Finance
function toYFSymbol(ticker) {
  if (ticker === "PSEi" || ticker === "^PSI") return "%5EPSI";
  const clean = ticker.toUpperCase().replace(".PS", "");
  if (["SM","ALI","BDO","JFC","TEL","MER","AC","BPI","URC","SMPH","GLO","ICT","CEB","2GO","DMC","SCC","MONDE","CNVRG","DDMPR","PLUS"].includes(clean)) {
    return clean + ".PS";
  }
  return clean;
}

// ── Main request handler ───────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");

  // ── GET /?type=quote&ticker=SM ────────────────────────────────────────────────
  if (type === "quote") {
    const ticker = url.searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return json({ error: "No ticker" }, 400);

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

    // Fallback: demo data
    const demo = DEMO_STOCKS[ticker];
    if (demo) {
      return json({
        source: "demo",
        ticker,
        price: demo.price,
        change: demo.chg / 100 * demo.price,
        changePercent: demo.chg,
        name: demo.name,
        note: "Demo data - Yahoo Finance unavailable",
      });
    }

    return json({ error: `No data for ${ticker}` }, 404);
  }

  // ── GET /?type=bulk&tickers=SM,ALI,BDO ───────────────────────────────────────
  if (type === "bulk") {
    const tickers = (url.searchParams.get("tickers") || "").split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
    if (!tickers.length) return json({ error: "No tickers" }, 400);

    const results = {};
    for (const ticker of tickers) {
      const yfSym = toYFSymbol(ticker);
      const live = await getYFQuote(yfSym);
      if (live && live.price && live.price > 0) {
        results[ticker] = { source: "yahoo_finance", ...live };
      } else {
        const demo = DEMO_STOCKS[ticker];
        results[ticker] = demo
          ? { source: "demo", price: demo.price, change: demo.chg / 100 * demo.price, changePercent: demo.chg, name: demo.name }
          : { source: "unavailable", price: null };
      }
    }
    return json(results);
  }

  // ── GET /?type=fx ───────────────────────────────────────────────────────────
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

  // ── GET /?type=index ────────────────────────────────────────────────────────
  if (type === "index") {
    const live = await getYFQuote("%5EPSI");
    if (live && live.price && live.price > 1000) {
      return json({ source: "yahoo_finance", PSEi: { value: live.price, chg: live.changePercent } });
    }
    return json({ source: "demo", PSEi: { value: 6820.00, chg: 0.35 } });
  }

  // ── GET /?type=bonds ─────────────────────────────────────────────────────────
  if (type === "bonds") {
    return json({
      source: "bsp_static",
      bonds: [
        { t: "91D T-Bill", y: 5.95 },
        { t: "182D T-Bill", y: 6.10 },
        { t: "364D T-Bill", y: 6.28 },
        { t: "2Y BVAL", y: 6.42 },
        { t: "5Y BVAL", y: 6.65 },
        { t: "10Y BVAL", y: 6.80 },
        { t: "25Y BVAL", y: 7.15 },
      ]
    });
  }

  return json({
    endpoints: [
      "?type=quote&ticker=GLO",
      "?type=bulk&tickers=SM,ALI,BDO",
      "?type=fx",
      "?type=index",
      "?type=bonds",
    ]
  }, 200);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
