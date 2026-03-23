# AI-Friendly Web Design — Full Guidelines

> Original: [@karminski-牙医](https://weibo.com/2169039837/QxmP8bEIS) · Compiled by: [@ianho7](https://github.com/ianho7)

> Read this file when you need the full rationale and code examples behind any principle.

---

## Part 1: Core Philosophy

**Treat AI agents the same way you'd treat a screen reader for a visually impaired user.**

Getting AI Accessibility right simultaneously improves human accessibility, SEO, and agent automation reliability — it's not a tradeoff.

**Prime directive: minimize modals and popups.** They disrupt humans and completely block agents. When you must alert, use a banner.

---

## Part 2: Technical Practices

### 1. Use Semantic Tags and ARIA Attributes

**What to do**: Use `<main>`, `<article>`, `<button>`, etc. Add `aria-label` to icon-only buttons.

**Why it matters**: Agents rely on DOM structure to locate and understand elements. Clear semantics lower the cost of navigation and reduce the chance of misidentification.

```html
<!-- ❌ Bad -->
<div class="btn" onclick="submit()">Submit</div>

<!-- ✅ Good -->
<button aria-label="Submit order" data-ai-action="submit-order">Submit</button>
```

---

### 2. Hide Decorative Elements to Save Tokens

**What to do**: Add `aria-hidden="true"` or `data-ai-hidden="true"` to decorative nodes, long SVGs, and background layers.

**Why it matters**: Reduces irrelevant content when a page is extracted, preventing decorative DOM from distracting the agent or consuming unnecessary tokens.

```html
<!-- Decorative icon -->
<svg aria-hidden="true" ...></svg>

<!-- Background animation layer -->
<div class="bg-particles" aria-hidden="true"></div>
```

---

### 3. Provide Stable Data Attribute Locators

**What to do**: Add `data-testid="submit-order"` or `data-ai-action="submit-order"` to key interactive nodes.

**Why it matters**: Avoids reliance on volatile CSS class names (e.g. Tailwind hashes). Stable data attributes significantly improve the robustness of automation scripts and agents.

```html
<button
  data-testid="checkout-submit"
  data-ai-action="submit-order"
>
  Checkout
</button>
```

---

### 4. Prefer Native Form Controls

**What to do**: Use `<select>`, `<input type="checkbox">`, etc. instead of div-based custom components.

**Why it matters**: Native controls have standard interaction APIs that tools like Playwright can drive directly. Custom components have higher error rates with automation.

```html
<!-- ❌ Custom component -->
<div class="custom-select" role="listbox">...</div>

<!-- ✅ Native -->
<select name="category">
  <option value="book">Books</option>
  <option value="music">Music</option>
</select>
```

---

### 5. Don't Hide Actions Behind Hover

**What to do**: Make actions visible as explicit buttons, or reveal them on click.

**Why it matters**: Agents won't actively probe hover states. Content that's only visible on hover may never be discovered.

---

### 6. Prefer Pagination Over Infinite Scroll

**What to do**: Keep explicit "Previous / Next" pagination controls.

**Why it matters**: Infinite scroll has no clear termination condition. Pagination buttons provide identifiable navigation targets, making task progress more predictable.

```html
<nav aria-label="Pagination">
  <a href="/products?page=2" data-ai-action="next-page">Next page</a>
</nav>
```

---

### 7. Make Loading States Explicit

**What to do**: Disable buttons during loading and show text like "Saving..." or "Loading...".

**Why it matters**: Prevents double-submission and race conditions, allowing automation tools' wait mechanisms to work naturally.

```html
<!-- Loading state -->
<button disabled aria-busy="true">
  <span>Saving...</span>
</button>
```

---

### 8. Use iframes and Shadow DOM Sparingly

**What to do**: If you must use them, keep enough context, status hints, and key summaries in the top-level DOM.

**Why it matters**: Many lightweight extraction tools can't pierce these boundaries — critical content gets hidden in an "invisible" zone.

---

### 9. Sync Page State to the URL

**What to do**: Write search terms, categories, pagination, and filters into the URL.

**Why it matters**: Agents often modify URLs or reopen links. Deep links make navigation, debugging, and reproduction straightforward.

```
✅ /products?category=book&page=2&sort=price_asc
❌ /products  (state lives only in JS memory)
```

---

### 10. Error Messages Must Be Plain Text

**What to do**: When validation fails, surface the error reason as readable text (e.g. via `aria-describedby`). Don't rely on color changes alone.

**Why it matters**: Agents can't see a visual "turning red," but they can read text and attempt to self-correct their input.

```html
<input
  type="email"
  aria-describedby="email-error"
  aria-invalid="true"
/>
<p id="email-error" role="alert">Please enter a valid email address</p>
```

---

### 11. Support Programmatic Input

**What to do**: Listen to `input` and `change` events rather than relying heavily on keyboard events (`keydown`/`keyup`).

**Why it matters**: Programmatic input primarily fires standard input events. If you only bind keyboard events, business validation may silently fail.

```js
// ❌ Keyboard events only
input.addEventListener('keydown', validate);

// ✅ Standard input events
input.addEventListener('input', validate);
input.addEventListener('change', validate);
```

---

### 12. Complete Critical Flows In-Page

**What to do**: Keep login, payment, and authorization in the current context. Avoid opening new tabs or popup windows.

**Why it matters**: Reduces context-switching cost and prevents agents from losing focus.

---

## Part 3: Advanced Design

### 13. Dual Entry Points: UI and API

**What to do**: Expose an AI-consumable API manifest at `.well-known/ai.json` or a prominent location.

**Why it matters**: APIs are more stable and efficient than UI, and represent the native integration path for future agents.

```json
// .well-known/ai.json example
{
  "api_base": "https://example.com/api/v1",
  "docs": "https://example.com/api/docs",
  "actions": [
    { "name": "search_products", "endpoint": "/products/search" },
    { "name": "place_order", "endpoint": "/orders" }
  ]
}
```

---

### 14. Rethink CAPTCHAs

**What to do**: Default to rate limiting rather than ReCAPTCHA.

**Why it matters**: ReCAPTCHA is a completely impenetrable barrier for AI agents and will block all legitimate agent integrations.

Alternatives to consider:
- Rate limiting
- Honeypot fields
- Behavioral analysis (rather than visual challenges)