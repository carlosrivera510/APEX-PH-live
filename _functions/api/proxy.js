const AV_KEY = "SFK1WZYS5UQSD7TH";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");

  // ── Yahoo Finance ──────────────────────────────────────────────────────────
  if (type === "yf") {
    const tickers = url.searchParams.get("tickers") || "";
    const symbols = tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean).map(t => t.endsWith(".PS") ? t : t + ".PS").join(",");
    if (!symbols) return json({ error: "No tickers" }, 400);

    try {
      const yfUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
      const res = await fetch(yfUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        }
      });
      const text = await res.text();
      return new Response(text, {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // ── Alpha Vantage GLOBAL_QUOTE ────────────────────────────────────────────
  if (type === "quote") {
    const ticker = url.searchParams.get("ticker");
    if (!ticker) return json({ error: "No ticker" }, 400);
    try {
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&market=PH&apikey=${AV_KEY}`
      );
      const data = await res.json();
      return json(data);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // ── Alpha Vantage TIME_SERIES_DAILY ───────────────────────────────────────
  if (type === "history") {
    const ticker = url.searchParams.get("ticker");
    if (!ticker) return json({ error: "No ticker" }, 400);
    try {
      const res = await fetch(
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&market=PH&apikey=${AV_KEY}&outputsize=compact`
      );
      const data = await res.json();
      return json(data);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  return json({ error: "Use ?type=yf&tickers=SM,ALI or ?type=quote&ticker=GLO or ?type=history&ticker=GLO" }, 400);
}

function json(data, status = 200) {
  const body = JSON.stringify(data);
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
