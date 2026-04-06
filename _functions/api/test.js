export async function onRequestGet(context) {
  return new Response("Proxy OK", { status: 200 });
}
