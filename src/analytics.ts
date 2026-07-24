function appendScript(src: string, attributes: Record<string, string> = {}) {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
  document.head.appendChild(script);
}

export function scheduleAnalytics() {
  const load = () => {
    const dataLayer = ((window as typeof window & { dataLayer?: unknown[] }).dataLayer ??= []);
    const gtag = (...args: unknown[]) => dataLayer.push(args);
    gtag("js", new Date());
    gtag("config", "G-HL7K5WRX6E");
    appendScript("https://www.googletagmanager.com/gtag/js?id=G-HL7K5WRX6E");
    appendScript("https://cloud.umami.is/script.js", {
      "data-website-id": "839ebcaf-8484-4fd0-96cc-b2184a0fc362",
    });
  };

  window.setTimeout(load, 3_000);
}
