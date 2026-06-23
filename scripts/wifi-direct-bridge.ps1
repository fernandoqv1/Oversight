<#
.SYNOPSIS
  Start a Wi-Fi Direct Legacy AP.
#>

param(
    [string]$Action   = 'start',
    [string]$Ssid     = '',
    [string]$Password = ''
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

function Write-Json($obj) {
    $json = $obj | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

function Get-RandomAlphaNum([int]$length) {
    $chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    -join (1..$length | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

if ($Action -eq 'stop') {
    Write-Json @{ success = $true }
    exit 0
}

if ($Action -ne 'start') {
    Write-Json @{ success = $false; error = "Unknown action: $Action" }
    exit 1
}

# --- start ---
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        })[0]

    function Invoke-AsyncOp([object]$asyncOp, [type]$resultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
        $task   = $asTask.Invoke($null, @($asyncOp))
        $task.Wait() | Out-Null
        return $task.Result
    }

    # ---- Step 1: Stop Mobile Hotspot if active ----
    try {
        [void][Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]
        [void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
        [void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]

        $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
        if ($profile) {
            $mgr   = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
            $state = [int]$mgr.TetheringOperationalState
            if ($state -eq 1) {
                Invoke-AsyncOp ($mgr.StopTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]) | Out-Null
                Start-Sleep -Milliseconds 2000
            }
        }
    } catch { <# hotspot check is best-effort #> }

    # ---- Step 2: Register Wi-Fi Direct types ----
    [void][Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher, Windows.Devices.WiFiDirect, ContentType=WindowsRuntime]
    [void][Windows.Devices.WiFiDirect.WiFiDirectAdvertisement, Windows.Devices.WiFiDirect, ContentType=WindowsRuntime]
    [void][Windows.Devices.WiFiDirect.WiFiDirectLegacySettings, Windows.Devices.WiFiDirect, ContentType=WindowsRuntime]
    [void][Windows.Security.Credentials.PasswordCredential, Windows.Security.Credentials, ContentType=WindowsRuntime]

    if (-not $Ssid)     { $Ssid     = 'Oversight-' + (Get-RandomAlphaNum 6) }
    if (-not $Password) { $Password = Get-RandomAlphaNum 12 }

    $adaptersBefore = @(Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)

    $publisher = [Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher]::new()
    $adv = $publisher.Advertisement
    $adv.IsAutonomousGroupOwnerEnabled = $true
    $legacy = $adv.LegacySettings
    $legacy.IsEnabled = $true
    $legacy.Ssid = $Ssid
    $cred = $legacy.Passphrase
    $cred.Password = $Password

    $publisher.Start()

    $statusOk = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 250
        $statusVal = [int]$publisher.Status
        if ($statusVal -eq 1) { $statusOk = $true; break }
        if ($statusVal -ge 2) { break }
    }

    if (-not $statusOk) {
        $statusVal = [int]$publisher.Status
        $statusName = switch ($statusVal) {
            0 { 'Created (never started)' }
            2 { 'Stopped immediately' }
            3 { 'Aborted' }
            default { "Unknown ($statusVal)" }
        }
        throw ("Wi-Fi Direct AP failed to start (status: $statusName). " +
               "Try turning off Windows Mobile Hotspot manually in Settings then retry.")
    }

    $gatewayIp = $null
    for ($i = 0; $i -lt 32; $i++) {
        Start-Sleep -Milliseconds 250
        $newAdapters = Get-NetAdapter -ErrorAction SilentlyContinue |
            Where-Object { ($_.Name -notin $adaptersBefore) -and ($_.Status -eq 'Up') }
        if ($newAdapters) {
            $ipInfo = Get-NetIPAddress -InterfaceAlias $newAdapters[0].Name -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                      Select-Object -First 1
            if ($ipInfo -and $ipInfo.IPAddress) {
                $gatewayIp = $ipInfo.IPAddress
                break
            }
        }
    }

    if (-not $gatewayIp) {
        $ipInfo = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -like '192.168.173.*' -or $_.IPAddress -like '192.168.137.*' } |
            Select-Object -First 1
        $gatewayIp = if ($ipInfo) { $ipInfo.IPAddress } else { '192.168.173.1' }
    }

    Write-Json @{ success = $true; ssid = $Ssid; password = $Password; gatewayIp = $gatewayIp }

    # Keep the process alive while the publisher is Running (status 1).
    # Exit when it stops so Node.js can detect the dead proc and restart.
    while ([int]$publisher.Status -eq 1) { Start-Sleep -Milliseconds 2000 }
    exit 0

} catch {
    Write-Json @{ success = $false; error = $_.Exception.Message }
    exit 1
}
