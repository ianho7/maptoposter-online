$imagesDir = "docs/assets"
$outputFile = "src/assets/images.json"

$extensions = @(".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif", ".ico")

$images = Get-ChildItem -Path $imagesDir -File | Where-Object {
    $extensions -contains $_.Extension.ToLower()
} | ForEach-Object {
    $_.Name
} | Sort-Object

$json = @{
    images = $images
} | ConvertTo-Json -Depth 10

New-Item -ItemType Directory -Path (Split-Path $outputFile) -Force | Out-Null
Set-Content -Path $outputFile -Value $json

Write-Host "Found $($images.Count) images. Saved to $outputFile"
