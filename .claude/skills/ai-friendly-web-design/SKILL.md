---
name: ai-friendly-web-design
description: >
  Guidelines for building AI-accessible web interfaces that work well with AI agents,
  automation tools, and screen readers. Use this skill whenever the user is building or
  reviewing a webpage, UI component, form, or frontend feature and any of these apply:
  they mention AI agents, automation, Playwright, web scraping, accessibility, a11y,
  aria, semantic HTML, or ask how to make their UI "agent-friendly", "AI-friendly", or
  "machine-readable". Also trigger when reviewing existing frontend code for accessibility
  or automation compatibility issues, even if the user doesn't explicitly mention AI.
---

# AI-Friendly Web Design (AI Accessibility)

> Original: [@karminski-牙医](https://weibo.com/2169039837/QxmP8bEIS) · Compiled by: [@ianho7](https://github.com/ianho7)

Core principle: **Treat AI agents the same way you'd treat a screen reader for a visually impaired user.**

Getting AI Accessibility right is a win on three fronts simultaneously: future-proofing for agent traffic, improving human accessibility, and boosting SEO.

---

## Prime Directive

**Minimize modals and popups.** They're bad for humans and bad for AI. When you must alert the user, use a banner instead.

---

## Core Checklist

### DOM Structure & Semantics

- **Use semantic HTML tags**: `<main>`, `<article>`, `<nav>`, `<button>`, etc. Add `aria-label` to icon-only buttons
- **Hide decorative elements**: Mark long SVGs, background layers, and visual noise with `aria-hidden="true"` or `data-ai-hidden="true"` to reduce irrelevant token consumption
- **Provide stable locators**: Add `data-testid="submit-order"` or `data-ai-action="submit-order"` to key interactive nodes — never rely on volatile Tailwind-generated class names

### Forms & Interactions

- **Use native form controls**: Prefer `<select>`, `<input type="checkbox">` over div-based custom components — native controls have standard APIs that tools like Playwright can drive directly
- **Don't hide actions behind hover**: Agents won't probe hover states; content that's only visible on hover may never be discovered
- **Listen to `input`/`change` events**: Programmatic input doesn't fire `keydown`/`keyup` — relying solely on keyboard events will break validation
- **Error messages must be plain text**: Use `aria-describedby` to surface readable error text; don't rely on color changes alone

### State & Navigation

- **Make loading states explicit**: Disable buttons during loading and show text like "Saving..." or "Loading..."
- **Prefer pagination over infinite scroll**: Pagination controls give agents a clear navigation target; infinite scroll has no definable end condition
- **Sync state to the URL**: Write search terms, filters, categories, and page numbers into the URL to support deep linking and reproducibility

### Context & Isolation

- **Use iframes and Shadow DOM sparingly**: If unavoidable, keep enough context, status hints, and key summaries in the top-level DOM — many lightweight extraction tools can't pierce these boundaries
- **Complete critical flows in-page**: Keep login, payment, and authorization in the current context; avoid opening new tabs or popup windows, which cause agents to lose focus

### Advanced: Dual Entry Points

- Expose an AI-consumable API manifest at `.well-known/ai.json` or a prominent location
- Don't default to ReCAPTCHA — it's an impenetrable wall for AI agents; prefer rate limiting, honeypot fields, or behavioral analysis instead

---

## Code Review Checklist

When reviewing frontend code, check in order:

1. Do interactive elements have semantic tags or `aria-label`?
2. Are decorative elements marked with `aria-hidden`?
3. Do key buttons and forms have stable `data-testid` or `data-ai-action` attributes?
4. Are any actions only reachable via hover?
5. Are forms using native controls or div-based simulations?
6. Are error messages in readable text form, not just color changes?
7. Do loading states include `disabled` + text feedback?
8. Do critical flows open new tabs or popup windows?

> For full rationale and code examples, see `references/guidelines.md`