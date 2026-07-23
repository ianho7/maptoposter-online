# Nominatim POI Worker

This Worker is the only route through which the app may call the public Nominatim API. It intentionally accepts explicit searches only; do not turn it into an autocomplete endpoint.

## Required configuration

1. Set `NOMINATIM_USER_AGENT` to an application-identifying value with a contact method.
2. Deploy with Wrangler after authorizing the Cloudflare account and bind the Worker route to the value exposed to the frontend as `VITE_NOMINATIM_PROXY_ENDPOINT` (ending in `/search`).
3. Keep the Durable Object migration in `wrangler.toml`; it serializes cache misses to at most one public Nominatim request per second.

The Worker caches normalized results by the complete request URL, including query, city, country, country code, and language. The browser must never call Nominatim directly.
