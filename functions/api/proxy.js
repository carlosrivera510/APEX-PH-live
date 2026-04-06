export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const target = url.searchParams.get("url");
  
  if (!target) {
    return new Response("Missing ?url= parameter", { status: 400 });
  }

  try {
    const decoded = decodeURIComponent(target);
    const res = await fetch(decoded, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      }
    });
    
    const data = await res.arrayBuffer();
    const contentType = res.headers.get("Content-Type") || "application/json";
    
    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      }
    });
  } catch (err) {
    return new Response("Proxy error: " + err.message, { status: 502 });
  }
}
