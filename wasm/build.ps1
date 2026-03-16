$ErrorActionPreference = "Stop"

Write-Host "使用 wasm-pack 构建 WASM..." -ForegroundColor Cyan
wasm-pack build --target web --out-dir ../src/pkg --release

if ($LASTEXITCODE -ne 0) {
    Write-Host "wasm-pack 构建失败" -ForegroundColor Red
    exit 1
}

$wasmFile = "../src/pkg/wasm_bg.wasm"
$originalSize = (Get-Item $wasmFile).Length
Write-Host "原始大小: $([math]::Round($originalSize/1KB, 2)) KB" -ForegroundColor Yellow

Write-Host "运行 wasm-opt..." -ForegroundColor Cyan

wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int `
  "pkg/wasm_bg.wasm" `
  -o "pkg/wasm_bg.opt.wasm"

if ($LASTEXITCODE -ne 0) {
    Write-Host "wasm-opt 失败" -ForegroundColor Red
    exit 1
}

Move-Item -Force "pkg/wasm_bg.opt.wasm" "pkg/wasm_bg.wasm"

$finalSize = (Get-Item $wasmFile).Length
$reduction = [math]::Round(($originalSize - $finalSize) / $originalSize * 100, 1)

Write-Host "最终大小: $([math]::Round($finalSize/1KB, 2)) KB" -ForegroundColor Green
Write-Host "缩减: $reduction%" -ForegroundColor Green
