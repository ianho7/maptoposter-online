param(
  [string]$Url = "http://localhost:4173/",
  [ValidateRange(1, 20)]
  [int]$Runs = 3,
  [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [ValidateRange(0, 60000)]
  [double]$MaxLoadMs = 0,
  [ValidateRange(0, 60000)]
  [double]$MaxLongTaskMs = 0,
  [ValidateRange(0, 60000)]
  [double]$MaxTaskDurationMs = 0,
  [switch]$Summary
)

$ErrorActionPreference = "Stop"

function Receive-CdpMessage {
  param([System.Net.WebSockets.ClientWebSocket]$Socket)
  $buffer = [byte[]]::new(65536)
  $segment = [ArraySegment[byte]]::new($buffer)
  $builder = [System.Text.StringBuilder]::new()
  do {
    $result = $Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $null = $builder.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
  } while (-not $result.EndOfMessage)
  return $builder.ToString() | ConvertFrom-Json
}

function Send-CdpCommand {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [int]$Id, [string]$Method, [hashtable]$Params = @{})
  $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 8
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $null = $Socket.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Invoke-CdpCommand {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [ref]$NextId, [string]$Method, [hashtable]$Params = @{})
  $id = $NextId.Value++
  Send-CdpCommand $Socket $id $Method $Params
  do { $message = Receive-CdpMessage $Socket } while ($message.id -ne $id)
  return $message.result
}

if (-not (Test-Path $ChromePath)) { throw "Chrome was not found at $ChromePath" }
$results = @()

for ($run = 1; $run -le $Runs; $run++) {
  $port = 9221 + $run
  $profile = Join-Path $env:TEMP "maptoposter-cold-start-$run-$([Guid]::NewGuid())"
  $chrome = Start-Process -FilePath $ChromePath -ArgumentList "--headless=new", "--remote-debugging-port=$port", "--user-data-dir=$profile", "--no-first-run", "--no-default-browser-check", "about:blank" -PassThru
  try {
    # This host binds Chrome's DevTools endpoint to the IPv6 localhost interface.
    $debugBase = "http://localhost:$port"
    $endpoint = "$debugBase/json"
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      try { $target = Invoke-RestMethod -Method Put "$debugBase/json/new?about:blank"; if ($target) { break } } catch {}
      Start-Sleep -Milliseconds 200
    }
    if (-not $target) { throw "Chrome DevTools endpoint did not become ready" }

    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $webSocketUrl = $target.webSocketDebuggerUrl -replace "127\.0\.0\.1", "localhost"
    $null = $socket.ConnectAsync([Uri]$webSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $nextId = 1
    $null = Invoke-CdpCommand $socket ([ref]$nextId) "Page.enable"
    $null = Invoke-CdpCommand $socket ([ref]$nextId) "Performance.enable"
    $null = Invoke-CdpCommand $socket ([ref]$nextId) "Page.addScriptToEvaluateOnNewDocument" @{ source = "window.__coldStartLongTasks=[];new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){window.__coldStartLongTasks.push({duration:entry.duration,startTime:entry.startTime})})}).observe({type:'longtask',buffered:true});" }
    $null = Invoke-CdpCommand $socket ([ref]$nextId) "Page.navigate" @{ url = $Url }

    # Do not wait on the browser `load` event: third-party analytics, map tiles,
    # and font requests can keep it open indefinitely. Capture a fixed 10 s window
    # instead, which is stable across runs and represents perceived initial load.
    Start-Sleep -Seconds 10
    $evaluation = Invoke-CdpCommand $socket ([ref]$nextId) "Runtime.evaluate" @{ expression = "JSON.stringify({navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),resources:performance.getEntriesByType('resource').map(function(entry){return {name:entry.name,initiatorType:entry.initiatorType,duration:entry.duration,transferSize:entry.transferSize,decodedBodySize:entry.decodedBodySize}}),longTasks:window.__coldStartLongTasks})"; returnByValue = $true }
    $metrics = Invoke-CdpCommand $socket ([ref]$nextId) "Performance.getMetrics"
    $rawData = $evaluation.result.value
    if ($null -eq $rawData) { throw "Runtime.evaluate returned no value: $($evaluation | ConvertTo-Json -Compress -Depth 8)" }
    $data = $rawData | ConvertFrom-Json
    $metricMap = @{}; $metrics.metrics | ForEach-Object { $metricMap[$_.name] = $_.value }
    $results += [pscustomobject]@{
      run = $run
      navigation = $data.navigation
      longTasks = $data.longTasks
      resources = $data.resources
      metrics = $metricMap
    }
    $socket.Dispose()
  } finally {
    # Chrome uses a process tree; terminate this run's root and its child processes
    # before deleting the unique temporary profile.
    if (-not $chrome.HasExited) { & taskkill.exe /PID $chrome.Id /T /F | Out-Null }
    Start-Sleep -Milliseconds 300
    if (Test-Path $profile) { Remove-Item -LiteralPath $profile -Recurse -Force }
  }
}

$loadDurations = @($results | ForEach-Object { $_.navigation.duration })
$longTaskDurations = @(
  $results |
    ForEach-Object { $_.longTasks } |
    ForEach-Object { $_.duration }
)
$taskDurations = @($results | ForEach-Object { $_.metrics.TaskDuration * 1000 })
$observedAvgLoadMs = ($loadDurations | Measure-Object -Average).Average
$observedMaxLoadMs = ($loadDurations | Measure-Object -Maximum).Maximum
$observedMaxLongTaskMs = if ($longTaskDurations.Count -gt 0) {
  ($longTaskDurations | Measure-Object -Maximum).Maximum
} else {
  0
}
$observedAvgTaskDurationMs = ($taskDurations | Measure-Object -Average).Average
$observedMaxTaskDurationMs = ($taskDurations | Measure-Object -Maximum).Maximum

$performanceSummary = [pscustomobject]@{
  runs = $Runs
  avgLoadMs = [math]::Round($observedAvgLoadMs, 1)
  maxLoadMs = [math]::Round($observedMaxLoadMs, 1)
  maxLongTaskMs = [math]::Round($observedMaxLongTaskMs, 1)
  avgTaskDurationMs = [math]::Round($observedAvgTaskDurationMs, 1)
  maxTaskDurationMs = [math]::Round($observedMaxTaskDurationMs, 1)
}

if ($Summary) {
  $performanceSummary | ConvertTo-Json
} else {
  $results | ConvertTo-Json -Depth 12
}

$failures = @()
if ($MaxLoadMs -gt 0 -and $performanceSummary.maxLoadMs -gt $MaxLoadMs) {
  $failures += "max load $($performanceSummary.maxLoadMs) ms exceeds $MaxLoadMs ms"
}
if ($MaxLongTaskMs -gt 0 -and $performanceSummary.maxLongTaskMs -gt $MaxLongTaskMs) {
  $failures += "max long task $($performanceSummary.maxLongTaskMs) ms exceeds $MaxLongTaskMs ms"
}
if ($MaxTaskDurationMs -gt 0 -and $performanceSummary.maxTaskDurationMs -gt $MaxTaskDurationMs) {
  $failures += "max task duration $($performanceSummary.maxTaskDurationMs) ms exceeds $MaxTaskDurationMs ms"
}

if ($failures.Count) {
  Write-Host "Performance regression: $($failures -join '; ')" -ForegroundColor Red
  exit 1
}
