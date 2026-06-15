interface Env {}

const ALLOWED_ORIGIN_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...ALLOWED_ORIGIN_HEADERS,
      ...(init?.headers || {}),
    },
    status: init?.status,
  });
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: ALLOWED_ORIGIN_HEADERS,
      });
    }

    if (request.method !== "GET") {
      return json({ message: "Method not allowed" }, { status: 405 });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key")?.trim();
    const address = url.searchParams.get("address")?.trim();
    const city = url.searchParams.get("city")?.trim();

    if (!key) {
      return json({ message: "Missing required query parameter: key" }, { status: 400 });
    }

    if (!address) {
      return json({ message: "Missing required query parameter: address" }, { status: 400 });
    }

    if (!city) {
      return json({ message: "Missing required query parameter: city" }, { status: 400 });
    }

    const upstream = new URL("https://restapi.amap.com/v3/geocode/geo");
    upstream.search = url.search;

    const response = await fetch(upstream, {
      headers: {
        accept: "application/json",
      },
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        ...ALLOWED_ORIGIN_HEADERS,
      },
    });
  },
};
