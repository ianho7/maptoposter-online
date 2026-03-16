---
name: rust-wasm
description: Master WebAssembly with Rust - wasm-pack, wasm-bindgen, and browser integration
sasmp_version: "1.3.0"
bonded_agent: rust-web-agent
bond_type: SECONDARY_BOND
version: "1.0.0"
---

# Rust WebAssembly Skill

Master WebAssembly with Rust: wasm-pack, wasm-bindgen, JavaScript interop, and browser integration.

## Quick Start

### Setup

```bash
# Install wasm-pack
cargo install wasm-pack

# Add target
rustup target add wasm32-unknown-unknown

# Create project
cargo new --lib my-wasm
cd my-wasm
```

### Project Configuration

```toml
# Cargo.toml
[package]
name = "my-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console", "Window", "Document"] }

[dev-dependencies]
wasm-bindgen-test = "0.3"

[profile.release]
lto = true
opt-level = "z"
```

### Basic WASM Module

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

// Import JavaScript function
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Export Rust function to JavaScript
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

// Initialize (called on load)
#[wasm_bindgen(start)]
fn main() {
    log("WASM module loaded!");
}
```

### Build

```bash
# Build for bundlers (webpack, etc.)
wasm-pack build

# Build for web (no bundler)
wasm-pack build --target web

# Build for Node.js
wasm-pack build --target nodejs

# Build optimized
wasm-pack build --release
```

## JavaScript Integration

### Using in Browser (No Bundler)

```html
<!DOCTYPE html>
<html>
<head>
    <script type="module">
        import init, { greet, add } from './pkg/my_wasm.js';

        async function run() {
            await init();

            const message = greet("World");
            console.log(message);  // "Hello, World!"

            const sum = add(2, 3);
            console.log(sum);  // 5
        }

        run();
    </script>
</head>
<body></body>
</html>
```

### Using with Webpack

```javascript
// index.js
import * as wasm from "my-wasm";

console.log(wasm.greet("Webpack"));
```

### Using with npm

```bash
# Build and pack
wasm-pack build
cd pkg
npm link

# In JavaScript project
npm link my-wasm
```

## DOM Manipulation

```rust
use wasm_bindgen::prelude::*;
use web_sys::{Document, Element, HtmlElement, Window};

#[wasm_bindgen]
pub fn manipulate_dom() -> Result<(), JsValue> {
    // Get window and document
    let window = web_sys::window().unwrap();
    let document = window.document().unwrap();

    // Create element
    let div = document.create_element("div")?;
    div.set_id("my-div");
    div.set_inner_html("<h1>Hello from Rust!</h1>");

    // Add to body
    document.body().unwrap().append_child(&div)?;

    // Query selector
    let element = document.query_selector("#my-div")?.unwrap();

    // Add event listener
    let closure = Closure::wrap(Box::new(move |_event: web_sys::MouseEvent| {
        web_sys::console::log_1(&"Clicked!".into());
    }) as Box<dyn FnMut(_)>);

    element.add_event_listener_with_callback(
        "click",
        closure.as_ref().unchecked_ref()
    )?;

    closure.forget();  // Keep closure alive

    Ok(())
}
```

## Async/Await in WASM

```rust
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, Response};

#[wasm_bindgen]
pub async fn fetch_data(url: &str) -> Result<JsValue, JsValue> {
    let opts = RequestInit::new();
    opts.set_method("GET");

    let request = Request::new_with_str_and_init(url, &opts)?;

    let window = web_sys::window().unwrap();
    let resp_value = JsFuture::from(window.fetch_with_request(&request)).await?;

    let resp: Response = resp_value.dyn_into()?;
    let json = JsFuture::from(resp.json()?).await?;

    Ok(json)
}
```

## Structs and Complex Types

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[wasm_bindgen]
pub struct Point {
    x: f64,
    y: f64,
}

#[wasm_bindgen]
impl Point {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[wasm_bindgen(getter)]
    pub fn x(&self) -> f64 {
        self.x
    }

    #[wasm_bindgen(getter)]
    pub fn y(&self) -> f64 {
        self.y
    }

    pub fn distance(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}

// For complex types, use serde
#[derive(Serialize, Deserialize)]
pub struct Config {
    name: String,
    values: Vec<i32>,
}

#[wasm_bindgen]
pub fn parse_config(json: &str) -> Result<JsValue, JsValue> {
    let config: Config = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(serde_wasm_bindgen::to_value(&config)?)
}
```

## Memory Management

```rust
use wasm_bindgen::prelude::*;

// Typed arrays for efficient data transfer
#[wasm_bindgen]
pub fn process_array(data: &[u8]) -> Vec<u8> {
    data.iter().map(|x| x.wrapping_add(1)).collect()
}

// Zero-copy view into WASM memory
#[wasm_bindgen]
pub fn get_memory_view() -> js_sys::Uint8Array {
    let buffer = vec![1u8, 2, 3, 4, 5];

    // Create view into WASM memory
    let array = js_sys::Uint8Array::new_with_length(buffer.len() as u32);
    array.copy_from(&buffer);
    array
}
```

## Testing

```rust
// tests/web.rs
#![cfg(target_arch = "wasm32")]

use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn test_add() {
    assert_eq!(my_wasm::add(2, 2), 4);
}

#[wasm_bindgen_test]
fn test_greet() {
    assert_eq!(my_wasm::greet("Test"), "Hello, Test!");
}

#[wasm_bindgen_test]
async fn test_async() {
    // Test async functions
}
```

```bash
# Run tests in browser
wasm-pack test --chrome

# Run tests in Node
wasm-pack test --node
```

## Size Optimization

```toml
# Cargo.toml
[profile.release]
lto = true
opt-level = "z"
codegen-units = 1
panic = "abort"
```

```bash
# Build optimized
wasm-pack build --release

# Further optimization with wasm-opt
wasm-opt -Oz -o optimized.wasm pkg/my_wasm_bg.wasm

# Check size
ls -lh pkg/*.wasm
```

## Common Patterns

### Console Logging

```rust
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_many(a: &str, b: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}
```

### Error Handling

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn may_fail(input: &str) -> Result<String, JsValue> {
    if input.is_empty() {
        return Err(JsValue::from_str("Input cannot be empty"));
    }
    Ok(format!("Processed: {}", input))
}
```

## Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Large .wasm | Debug build | Use `--release` |
| Import error | Wrong target | Match `--target` to usage |
| Memory leak | Closure not freed | Use `.forget()` or cleanup |
| Type mismatch | Complex types | Use serde_wasm_bindgen |

### Debug Checklist

```bash
# 1. Check wasm size
wasm-pack build --release
ls -lh pkg/*.wasm

# 2. Inspect exports
wasm2wat pkg/my_wasm_bg.wasm | head -50

# 3. Browser console
# Open DevTools > Console for JS errors

# 4. Test in Node first
wasm-pack build --target nodejs
node -e "const m = require('./pkg'); console.log(m.greet('test'))"
```

## Best Practices

1. **Keep .wasm small** - use `opt-level = "z"`
2. **Minimize JS/WASM boundary** - batch operations
3. **Use typed arrays** - for large data transfers
4. **Handle errors** - return `Result<_, JsValue>`
5. **Test in multiple browsers** - compatibility varies
6. **Use wasm-opt** - further size reduction

## Resources

- [Rust WASM Book](https://rustwasm.github.io/docs/book/)
- [wasm-bindgen Guide](https://rustwasm.github.io/docs/wasm-bindgen/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- [web-sys API](https://rustwasm.github.io/wasm-bindgen/api/web_sys/)
