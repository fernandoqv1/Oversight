param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('detect','list','import','thumbnails','quick-list')]
    [string]$Action,

    [string]$DeviceName,
    [string]$DateFilter,
    [string]$Files,
    [string]$FilesPath,
    [string]$DestDir,
    [switch]$IncludeThumbnails
)

function Get-RequestedFileList {
    function Unwrap-JsonList($parsed) {
        if ($null -eq $parsed) { return @() }
        if ($parsed -is [System.Array]) { return $parsed }
        return @($parsed)
    }

    if ($FilesPath -and (Test-Path -LiteralPath $FilesPath)) {
        $raw = Get-Content -LiteralPath $FilesPath -Raw -Encoding UTF8
        return Unwrap-JsonList ($raw | ConvertFrom-Json)
    }
    if ($Files) {
        return Unwrap-JsonList ($Files | ConvertFrom-Json)
    }
    return @()
}

$ErrorActionPreference = 'Stop'

$script:ImageExtensions = @('.jpg','.jpeg','.png','.heic','.heif','.gif','.bmp','.tiff','.tif')
$script:SkipExtensions = @('.aae','.mov','.mp4','.m4v')
# Grid tiles render at ~128px (object-fit:cover, no zoom/lightbox), so a small
# preview is all that's needed. Requesting <=256px lets Windows return a fast
# embedded/cached thumbnail instead of decoding the full-res image over MTP per
# photo — the dominant cost when listing. The full original is copied at import.
$script:PhonePreviewPixelSize = 256
$script:PhonePreviewJpegQuality = 82

function Write-JsonOutput($obj) {
    $json = $obj | ConvertTo-Json -Depth 10 -Compress
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $json
}

function Parse-DateString([string]$raw) {
    if (-not $raw -or -not $raw.Trim()) { return '' }
    $cleaned = $raw.Trim() -replace '[^\d/: APMapm]',''
    if (-not $cleaned) { return '' }
    try {
        $dt = [DateTime]::Parse($cleaned, [System.Globalization.CultureInfo]::CurrentCulture)
        return $dt.ToString('yyyy-MM-dd')
    } catch {
        try {
            $dt = [DateTime]::Parse($cleaned, [System.Globalization.CultureInfo]::InvariantCulture)
            return $dt.ToString('yyyy-MM-dd')
        } catch { return '' }
    }
}

function Get-PhotoDate($folderObj, $fileItem) {
    $dateTaken = $folderObj.GetDetailsOf($fileItem, 12)
    $mediaCreated = $folderObj.GetDetailsOf($fileItem, 27)
    $modified = $folderObj.GetDetailsOf($fileItem, 3)
    $created  = $folderObj.GetDetailsOf($fileItem, 4)

    $isoDate = Parse-DateString $dateTaken
    $source = 'taken'
    $label = if ($dateTaken) { [string]$dateTaken } else { '' }

    if (-not $isoDate) {
        $isoDate = Parse-DateString $mediaCreated
        $source = 'media'
        if ($mediaCreated) { $label = [string]$mediaCreated }
    }
    if (-not $isoDate) {
        $isoDate = Parse-DateString $modified
        $source = 'modified'
        if ($modified) { $label = [string]$modified }
    }
    if (-not $isoDate) {
        $isoDate = Parse-DateString $created
        $source = 'created'
        if ($created) { $label = [string]$created }
    }
    if (-not $label) {
        $label = if ($modified) { [string]$modified } elseif ($created) { [string]$created } else { '' }
    }
    return @{ IsoDate = $isoDate; Label = $label; Source = $source; FastPath = $false }
}

function Find-DeviceItem($shell, $deviceName) {
    $thisPC = $shell.NameSpace(17)
    for ($i = 0; $i -lt $thisPC.Items().Count; $i++) {
        $item = $thisPC.Items().Item($i)
        if ($item.Name -eq $deviceName) { return $item }
    }
    for ($i = 0; $i -lt $thisPC.Items().Count; $i++) {
        $item = $thisPC.Items().Item($i)
        if ($item.Name -like "*$deviceName*" -or $deviceName -like "*$($item.Name)*") { return $item }
    }
    return $null
}

# The phone drops out of the Shell namespace when it idles/locks; enumerating
# wakes it, so a short retry usually brings it back (same pattern as
# Get-PortableDevicesWithRetry for the list actions).
function Find-DeviceItemWithRetry($shell, $deviceName, [int]$attempts = 3, [int]$delayMs = 1500) {
    for ($a = 1; $a -le $attempts; $a++) {
        $item = Find-DeviceItem $shell $deviceName
        if ($item) { return $item }
        if ($a -lt $attempts) { [System.Threading.Thread]::Sleep($delayMs) }
    }
    return $null
}

function Get-MtpFolderItems($folderObj) {
    if (-not $folderObj) { return @() }
    return @($folderObj.Items())
}

function Test-ImageFileReady([string]$destPath) {
    if (-not (Test-Path -LiteralPath $destPath)) { return $false }
    try {
        $info = Get-Item -LiteralPath $destPath
        if ($info.Length -lt 1024) { return $false }
        $fs = [System.IO.File]::OpenRead($destPath)
        $buf = New-Object byte[] 12
        $read = $fs.Read($buf, 0, 12)
        $fs.Close()
        if ($read -ge 3 -and $buf[0] -eq 0xFF -and $buf[1] -eq 0xD8 -and $buf[2] -eq 0xFF) { return $true }
        if ($read -ge 8 -and [Text.Encoding]::ASCII.GetString($buf, 4, 4) -eq 'ftyp') { return $true }
        return $false
    } catch {
        return $false
    }
}

function Wait-ForFileAtPath([string]$destPath, [int]$timeoutSec = 120) {
    # Test-ImageFileReady already requires >=1KB plus valid JPEG/HEIC magic
    # bytes; a stable size across two reads confirms the copy has finished.
    # (A fixed minimum-size threshold here made photos smaller than it spin
    # until the timeout even though they had copied successfully.)
    $start = Get-Date
    $lastSize = -1
    $stableReads = 0
    while (((Get-Date) - $start).TotalSeconds -lt $timeoutSec) {
        if (Test-ImageFileReady $destPath) {
            try {
                $size = (Get-Item -LiteralPath $destPath).Length
                if ($size -gt 0 -and $size -eq $lastSize) {
                    $stableReads++
                    if ($stableReads -ge 2) { return $true }
                } else {
                    $stableReads = 0
                    $lastSize = $size
                }
            } catch {
                $stableReads = 0
            }
        }
        [System.Threading.Thread]::Sleep(250)
    }
    return $false
}

function Wait-MtpStorageReady($storageItem, [int]$maxWaitMs = 12000) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $maxWaitMs) {
        $folder = $storageItem.GetFolder
        if ($folder) {
            $items = Get-MtpFolderItems $folder
            if ($items.Count -gt 0) {
                return [int]$sw.ElapsedMilliseconds
            }
        }
        try {
            $storagePath = $storageItem.Path
            $ns = (New-Object -ComObject Shell.Application).NameSpace($storagePath)
            if ($ns) {
                $items = Get-MtpFolderItems $ns
                if ($items.Count -gt 0) {
                    return [int]$sw.ElapsedMilliseconds
                }
            }
        } catch {}
        [System.Threading.Thread]::Sleep(200)
    }
    return [int]$sw.ElapsedMilliseconds
}

function Get-StorageRoot($deviceItem) {
    $devFolder = $deviceItem.GetFolder
    if (-not $devFolder) { return $null }
    foreach ($item in Get-MtpFolderItems $devFolder) {
        if ($item.Name -like '*Internal*' -and $item.IsFolder) { return $item }
    }
    foreach ($item in Get-MtpFolderItems $devFolder) {
        if ($item.IsFolder) { return $item }
    }
    return $null
}

function Get-IosDateFolderPrefixes([string]$dateFilter) {
    if (-not $dateFilter) { return @() }
    $digits = ($dateFilter -replace '-', '').Trim()
    $prefixes = New-Object System.Collections.Generic.List[string]
    if ($digits.Length -ge 6) {
        [void]$prefixes.Add($digits.Substring(0, 6))
    }
    if ($digits.Length -ge 8) {
        [void]$prefixes.Add($digits.Substring(0, 8))
        [void]$prefixes.Add($digits.Substring(2, 6))
    }
    return @($prefixes | Select-Object -Unique)
}

function Test-FolderMatchesDateFilter([string]$folderName, [string]$dateFilter) {
    if (-not $dateFilter) { return $true }
    foreach ($prefix in (Get-IosDateFolderPrefixes $dateFilter)) {
        if ($folderName -like "$prefix*") { return $true }
    }
    return $false
}

function Test-ShouldWalkFolder([string]$folderName, [string]$dateFilter, [bool]$restrictFolders) {
    if (-not $restrictFolders -or -not $dateFilter) { return $true }
    if (Test-FolderMatchesDateFilter $folderName $dateFilter) { return $true }
    # iOS stores photos in numbered APPLE folders with no date in the name — always walk them.
    if ($folderName -match '^\d{3}APPLE$') { return $true }
    # Only skip folders that are themselves date-named (e.g. Android "20240115")
    # but don't match the filter. Always descend into structural container folders
    # like DCIM / PhotoData / CPLAssets — otherwise the walk never reaches the
    # APPLE folders that hold the photos and returns nothing.
    if ($folderName -notmatch '^\d{6,8}') { return $true }
    return $false
}

function New-PhotoRecord($fileItem, $folderObj, [string]$relPath, $dateInfo, [string]$thumbBase64) {
    $folderName = if ($relPath) { ($relPath -split '\\')[-1] } else { '' }
    $photoPath = if ($relPath) { "$relPath\$($fileItem.Name)" } else { $fileItem.Name }
    $sizeVal = ''
    if (-not $dateInfo.FastPath) {
        $sizeVal = [string]$folderObj.GetDetailsOf($fileItem, 2)
    }
    return [PSCustomObject]@{
        relPath       = [string]$relPath
        path          = [string]$photoPath
        name          = [string]$fileItem.Name
        date          = [string]$dateInfo.IsoDate
        dateTaken     = [string]$dateInfo.Label
        dateSource    = [string]$dateInfo.Source
        size          = $sizeVal
        folder        = [string]$folderName
        thumbBase64   = if ($thumbBase64) { [string]$thumbBase64 } else { '' }
        thumbMimeType = if ($thumbBase64) { 'image/jpeg' } else { '' }
    }
}

function Get-IosPhotoDedupeInfo([string]$name, [string]$relPath) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension([string]$name).ToUpper()
    # Scope the key to the containing folder: iPhone photo numbering wraps at
    # 9999, so the same IMG_#### can legitimately exist in different folders.
    $scope = ([string]$relPath).ToUpper()
    if ($base -match '^IMG_E(\d+)$') { return @{ Key = "$scope|$($Matches[1])"; Edited = $true } }
    if ($base -match '^IMG_(\d+)$') { return @{ Key = "$scope|$($Matches[1])"; Edited = $false } }
    return @{ Key = "$scope|$base"; Edited = $false }
}

function Select-UniqueIosPhotos($records) {
    # An edited iPhone photo shows up as two files (IMG_1234 + IMG_E1234) plus
    # .AAE sidecars. Keep one per photo, preferring the edited version: it is
    # what the user sees in the Photos app, and (verified against a real device)
    # the edited file copies reliably over MTP while the original of an edited
    # pair frequently stalls until the per-file timeout.
    $groups = New-Object System.Collections.Specialized.OrderedDictionary
    foreach ($rec in $records) {
        $info = Get-IosPhotoDedupeInfo $rec.name $rec.relPath
        $key = [string]$info.Key
        if (-not $groups.Contains($key)) {
            $groups[$key] = @{ Record = $rec; Edited = $info.Edited }
            continue
        }
        if ($info.Edited -and -not $groups[$key].Edited) {
            $groups[$key] = @{ Record = $rec; Edited = $true }
        }
    }
    $out = @()
    foreach ($entry in $groups.Values) { $out += $entry.Record }
    return $out
}

function Collect-Photos($rootItem, [string]$DateFilter, [bool]$IncludeThumbs, [bool]$RestrictFolders) {
    function Walk($folderItem, [string]$relPath, [bool]$skipUnmatchedFolders) {
        $folder = $folderItem.GetFolder
        if (-not $folder) { return }
        foreach ($fileItem in Get-MtpFolderItems $folder) {
            if ($fileItem.IsFolder) {
                $childPath = if ($relPath) { "$relPath\$($fileItem.Name)" } else { $fileItem.Name }
                if (-not (Test-ShouldWalkFolder $fileItem.Name $DateFilter $skipUnmatchedFolders)) { continue }
                Walk $fileItem $childPath $skipUnmatchedFolders
                continue
            }
            $ext = [System.IO.Path]::GetExtension($fileItem.Name).ToLower()
            if ($script:SkipExtensions -contains $ext) { continue }
            if ($script:ImageExtensions -notcontains $ext) { continue }

            $dateInfo = Get-PhotoDate $folder $fileItem

            if ($DateFilter) {
                if ($dateInfo.IsoDate -and $dateInfo.IsoDate -ne $DateFilter) { continue }
                if (-not $dateInfo.IsoDate) { continue }
            }

            $record = New-PhotoRecord $fileItem $folder $relPath $dateInfo $null
            $script:collectedPhotos += $record
            $script:collectedItems[[string]$record.path] = $fileItem
        }
    }

    $script:collectedPhotos = @()
    $script:collectedItems = @{}
    Walk $rootItem '' $RestrictFolders
    # Safety net: if the date-restricted walk found nothing (e.g. an unexpected
    # folder layout), fall back to an unrestricted walk that date-filters per file.
    if ($RestrictFolders -and $DateFilter -and $script:collectedPhotos.Count -eq 0) {
        $script:collectedPhotos = @()
        $script:collectedItems = @{}
        Walk $rootItem '' $false
    }

    $unique = @(Select-UniqueIosPhotos $script:collectedPhotos)

    # Thumbnails are generated only for the deduped survivors — edited/original
    # pairs would otherwise double the thumbnail work for photos never shown.
    if ($IncludeThumbs) {
        Initialize-ShellThumbnailHelper
        foreach ($rec in $unique) {
            $item = $script:collectedItems[[string]$rec.path]
            if (-not $item) { continue }
            $thumb = $null
            try { $thumb = Get-FileThumbnailBase64 $item $script:PhonePreviewPixelSize } catch {}
            if ($thumb) {
                $rec.thumbBase64 = [string]$thumb
                $rec.thumbMimeType = 'image/jpeg'
            }
        }
    }

    return $unique
}

function Resolve-PhotoPathInner($rootItem, [string]$photoPath) {
    $normalized = [string]$photoPath -replace '/', '\'
    $parts = $normalized -split '\\' | Where-Object { $_ -ne '' }
    if ($parts.Count -eq 0) { return $null }

    $current = $rootItem
    for ($p = 0; $p -lt $parts.Count - 1; $p++) {
        $folder = $current.GetFolder
        if (-not $folder) { return $null }
        $next = $null
        for ($i = 0; $i -lt $folder.Items().Count; $i++) {
            $item = $folder.Items().Item($i)
            if ($item.Name -eq $parts[$p] -and $item.IsFolder) { $next = $item; break }
        }
        if (-not $next) { return $null }
        $current = $next
    }
    $fileName = $parts[-1]
    $folder = $current.GetFolder
    if (-not $folder) { return $null }
    for ($i = 0; $i -lt $folder.Items().Count; $i++) {
        $item = $folder.Items().Item($i)
        if ($item.Name -eq $fileName -and -not $item.IsFolder) { return $item }
    }
    return $null
}

# Resolve many photo paths in one pass: group by parent directory, navigate to
# each directory once, then index its children by name. The per-photo
# Resolve-PhotoPath walks the folder tree for every file (O(n^2) COM calls over
# MTP), which is what made bulk thumbnail requests time out.
function Get-PhotoItemsByPaths($rootItem, $photoPaths) {
    $resolved = @{}
    $byDir = @{}
    foreach ($p in $photoPaths) {
        $normalized = [string]$p -replace '/', '\'
        $dir = if ($normalized.Contains('\')) { $normalized.Substring(0, $normalized.LastIndexOf('\')) } else { '' }
        $name = if ($normalized.Contains('\')) { $normalized.Substring($normalized.LastIndexOf('\') + 1) } else { $normalized }
        if (-not $byDir.ContainsKey($dir)) { $byDir[$dir] = @{} }
        $byDir[$dir][$name] = [string]$p
    }

    foreach ($dir in @($byDir.Keys)) {
        $candidates = @($dir)
        if ($dir -match '^DCIM(\\|$)') { $candidates += ($dir -replace '^DCIM\\?', '') } elseif ($dir) { $candidates += "DCIM\$dir" }

        $dirItem = $null
        foreach ($candidate in $candidates) {
            $parts = @($candidate -split '\\' | Where-Object { $_ })
            $current = $rootItem
            $ok = $true
            foreach ($part in $parts) {
                $folder = $current.GetFolder
                if (-not $folder) { $ok = $false; break }
                $next = $null
                foreach ($item in Get-MtpFolderItems $folder) {
                    if ($item.IsFolder -and $item.Name -eq $part) { $next = $item; break }
                }
                if (-not $next) { $ok = $false; break }
                $current = $next
            }
            if ($ok) { $dirItem = $current; break }
        }
        if (-not $dirItem) { continue }

        $folder = $dirItem.GetFolder
        if (-not $folder) { continue }
        $wanted = $byDir[$dir]
        foreach ($item in Get-MtpFolderItems $folder) {
            if (-not $item.IsFolder -and $wanted.ContainsKey($item.Name)) {
                $resolved[[string]$wanted[$item.Name]] = $item
            }
        }
    }
    return $resolved
}

function Resolve-PhotoPath($rootItem, [string]$photoPath) {
    $normalized = [string]$photoPath -replace '/', '\'
    $candidates = @($normalized)
    if ($normalized -match '^DCIM\\') {
        $candidates += $normalized.Substring(5)
    } else {
        $candidates += "DCIM\$normalized"
    }
    foreach ($candidate in $candidates) {
        $resolved = Resolve-PhotoPathInner $rootItem $candidate
        if ($resolved) { return $resolved }
    }
    return $null
}

function Get-PortableDevices {
    $shell = New-Object -ComObject Shell.Application
    $thisPC = $shell.NameSpace(17)
    if (-not $thisPC) { return @() }
    $devices = @()

    for ($i = 0; $i -lt $thisPC.Items().Count; $i++) {
        $item = $thisPC.Items().Item($i)
        if (-not $item) { continue }
        $itemType = [string]$thisPC.GetDetailsOf($item, 4)
        if ($itemType -match 'Portable' -or $itemType -match 'Phone' -or $itemType -match 'MTP' -or
            $item.Name -match 'iPhone' -or $item.Name -match 'iPad' -or $item.Name -match 'Apple') {
            $devices += [PSCustomObject]@{ name = [string]$item.Name; type = $itemType }
        }
    }

    if ($devices.Count -eq 0) {
        for ($i = 0; $i -lt $thisPC.Items().Count; $i++) {
            $item = $thisPC.Items().Item($i)
            if (-not $item) { continue }
            try {
                $folder = $item.GetFolder
                if ($folder) {
                    for ($j = 0; $j -lt $folder.Items().Count; $j++) {
                        $sub = $folder.Items().Item($j)
                        if ($sub.Name -like '*Internal*' -or $sub.Name -eq 'DCIM') {
                            $devices += [PSCustomObject]@{
                                name = [string]$item.Name
                                type = [string]$thisPC.GetDetailsOf($item, 4)
                            }
                            break
                        }
                    }
                }
            } catch {}
        }
    }

    return $devices
}

function Initialize-ShellThumbnailHelper {
    if ($script:ShellThumbnailReady) { return }
    Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;

namespace OversightPhone {
    internal enum SIIGBF : int {
        RESIZETOFIT = 0x00,
        BIGGERSIZEOK = 0x01,
        MEMORYONLY = 0x02,
        ICONONLY = 0x04,
        THUMBNAILONLY = 0x08,
        INCACHEONLY = 0x10
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct SIZE {
        public int cx;
        public int cy;
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItem {
        void BindToHandler(IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid bhid, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(int sigdnName, out IntPtr ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItemImageFactory {
        [PreserveSig]
        int GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
    }

    public static class ShellThumb {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
        private static extern int SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

        [DllImport("shell32.dll", PreserveSig = true)]
        private static extern int SHGetIDListFromObject([MarshalAs(UnmanagedType.IUnknown)] object punk, out IntPtr ppidl);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
        private static extern int SHCreateItemFromIDList(IntPtr pidl, ref Guid riid, out IShellItem ppv);

        [DllImport("shell32.dll")]
        private static extern void ILFree(IntPtr pidl);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        private static Bitmap ResizeBitmapHighQuality(Bitmap source, int maxSize) {
            int w = source.Width;
            int h = source.Height;
            if (w <= maxSize && h <= maxSize) {
                return (Bitmap)source.Clone();
            }
            if (w >= h) {
                h = Math.Max(1, (int)Math.Round(h * (double)maxSize / w));
                w = maxSize;
            } else {
                w = Math.Max(1, (int)Math.Round(w * (double)maxSize / h));
                h = maxSize;
            }
            Bitmap dest = new Bitmap(w, h);
            using (Graphics g = Graphics.FromImage(dest)) {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.CompositingQuality = CompositingQuality.HighQuality;
                g.DrawImage(source, 0, 0, w, h);
            }
            return dest;
        }

        private static string BitmapToJpegBase64(IntPtr hBitmap, int maxSize) {
            if (hBitmap == IntPtr.Zero) return null;
            try {
                using (Bitmap bmp = Image.FromHbitmap(hBitmap)) {
                    using (Bitmap sized = ResizeBitmapHighQuality(bmp, maxSize)) {
                        using (MemoryStream ms = new MemoryStream()) {
                            ImageCodecInfo jpegCodec = null;
                            foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders()) {
                                if (codec.FormatID == ImageFormat.Jpeg.Guid) { jpegCodec = codec; break; }
                            }
                            if (jpegCodec != null) {
                                EncoderParameters encParams = new EncoderParameters(1);
                                encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 82L);
                                sized.Save(ms, jpegCodec, encParams);
                            } else {
                                sized.Save(ms, ImageFormat.Jpeg);
                            }
                            return Convert.ToBase64String(ms.ToArray());
                        }
                    }
                }
            } finally {
                DeleteObject(hBitmap);
            }
        }

        private static string GetJpegBase64FromFactory(IShellItemImageFactory factory, int size) {
            if (factory == null) return null;
            SIZE sz = new SIZE { cx = size, cy = size };
            IntPtr hBitmap;
            int hr = factory.GetImage(sz, SIIGBF.BIGGERSIZEOK | SIIGBF.RESIZETOFIT, out hBitmap);
            if (hr == 0 && hBitmap != IntPtr.Zero) {
                return BitmapToJpegBase64(hBitmap, size);
            }
            hr = factory.GetImage(sz, SIIGBF.BIGGERSIZEOK, out hBitmap);
            if (hr == 0 && hBitmap != IntPtr.Zero) {
                return BitmapToJpegBase64(hBitmap, size);
            }
            return null;
        }

        private static IShellItemImageFactory GetFactoryFromComObject(object shellItem) {
            if (shellItem == null) return null;
            IShellItemImageFactory direct = shellItem as IShellItemImageFactory;
            if (direct != null) return direct;

            IntPtr pidl = IntPtr.Zero;
            try {
                int hr = SHGetIDListFromObject(shellItem, out pidl);
                if (hr != 0 || pidl == IntPtr.Zero) return null;
                Guid iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
                IShellItem item;
                hr = SHCreateItemFromIDList(pidl, ref iid, out item);
                if (hr != 0 || item == null) return null;
                return item as IShellItemImageFactory;
            } finally {
                if (pidl != IntPtr.Zero) ILFree(pidl);
            }
        }

        public static string GetJpegBase64FromItem(object shellItem, int size) {
            IShellItemImageFactory factory = GetFactoryFromComObject(shellItem);
            return GetJpegBase64FromFactory(factory, size);
        }

        public static string GetJpegBase64(string parsingPath, int size) {
            if (string.IsNullOrWhiteSpace(parsingPath)) return null;
            Guid iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
            IShellItem item;
            int hr = SHCreateItemFromParsingName(parsingPath, IntPtr.Zero, ref iid, out item);
            if (hr != 0 || item == null) return null;
            return GetJpegBase64FromFactory(item as IShellItemImageFactory, size);
        }
    }
}
'@
    $script:ShellThumbnailReady = $true
}

function Get-FileThumbnailBase64($fileItem, [int]$Size = 1280) {
    Initialize-ShellThumbnailHelper
    if (-not $fileItem) { return $null }
    try {
        return [OversightPhone.ShellThumb]::GetJpegBase64FromItem($fileItem, $Size)
    } catch {
        return $null
    }
}

function Test-PhotoMatchesFilter($photo, [string]$dateFilter) {
    if (-not $dateFilter) { return $true }
    $photoDate = [string]$photo.date
    return ($photoDate -eq $dateFilter)
}

function Get-PortableDevicesWithRetry([int]$attempts = 3, [int]$delayMs = 1500) {
    # The first Shell enumeration right after a phone is plugged in (or after the
    # WPD service has been idle) often comes back empty; the enumeration itself
    # wakes the device, so a short retry finds it.
    for ($a = 1; $a -le $attempts; $a++) {
        $devices = @(Get-PortableDevices)
        if ($devices.Count -gt 0) { return $devices }
        if ($a -lt $attempts) { [System.Threading.Thread]::Sleep($delayMs) }
    }
    return @()
}

$script:PhoneLockedMessage = 'iPhone storage is not accessible. Unlock your iPhone, tap "Allow" if it asks about photo access, then retry.'

function Get-PhoneListResult([string]$DeviceName, [string]$DateFilter, [bool]$IncludeThumbs) {
    $shell = New-Object -ComObject Shell.Application
    $deviceItem = Find-DeviceItemWithRetry $shell $DeviceName
    if (-not $deviceItem) {
        return @{ success = $false; error = "Device '$DeviceName' not found" }
    }

    $storageRoot = Get-StorageRoot $deviceItem
    if (-not $storageRoot) {
        # Device is visible but exposes no storage: locked phone or photo access not allowed.
        return @{ success = $true; photos = @(); totalOnDevice = 0; includeThumbs = $IncludeThumbs; phoneLocked = $true; error = $script:PhoneLockedMessage }
    }

    [void](Wait-MtpStorageReady $storageRoot)
    $rootFolder = $storageRoot.GetFolder
    $rootItems = if ($rootFolder) { @(Get-MtpFolderItems $rootFolder) } else { @() }
    if ($rootItems.Count -eq 0) {
        # Storage mounted but empty: a locked iPhone presents exactly this way.
        return @{ success = $true; photos = @(); totalOnDevice = 0; includeThumbs = $IncludeThumbs; phoneLocked = $true; error = $script:PhoneLockedMessage }
    }

    $restrictFolders = [bool]($DateFilter -and $DateFilter.Trim())
    $photos = Collect-Photos $storageRoot $DateFilter $IncludeThumbs $restrictFolders

    return @{
        success       = $true
        photos        = @($photos)
        totalOnDevice = @($photos).Count
        includeThumbs = $IncludeThumbs
    }
}

function Pick-DefaultPhoneDevice($devices) {
    if (-not $devices -or $devices.Count -eq 0) { return $null }
    $iphone = @($devices | Where-Object { $_.name -match 'iPhone|iPad|Apple' })
    if ($iphone.Count -gt 0) { return $iphone[0] }
    return $devices[0]
}

switch ($Action) {
    'detect' {
        try {
            $devices = Get-PortableDevicesWithRetry
            Write-JsonOutput @{ success = $true; devices = @($devices) }
        } catch {
            Write-JsonOutput @{ success = $false; error = $_.Exception.Message }
        }
    }

    'list' {
        try {
            if (-not $DeviceName) {
                Write-JsonOutput @{ success = $false; error = 'DeviceName is required' }
                return
            }

            $result = Get-PhoneListResult $DeviceName $DateFilter ([bool]$IncludeThumbnails)
            Write-JsonOutput $result
        } catch {
            Write-JsonOutput @{ success = $false; error = $_.Exception.Message }
        }
    }

    'quick-list' {
        try {
            $devices = Get-PortableDevicesWithRetry
            if ($devices.Count -eq 0) {
                Write-JsonOutput @{ success = $true; devices = @(); photos = @(); totalOnDevice = 0 }
                return
            }

            $pick = Pick-DefaultPhoneDevice $devices
            $result = Get-PhoneListResult $pick.name $DateFilter $true
            Write-JsonOutput @{
                success       = $result.success
                error         = $result.error
                devices       = @($devices)
                deviceName    = [string]$pick.name
                photos        = @($result.photos)
                totalOnDevice = $result.totalOnDevice
                includeThumbs = $true
                phoneLocked   = [bool]$result.phoneLocked
                backend       = 'mtp'
            }
        } catch {
            Write-JsonOutput @{ success = $false; error = $_.Exception.Message }
        }
    }

    'import' {
        try {
            if (-not $DeviceName) {
                Write-JsonOutput @{ success = $false; error = 'DeviceName is required' }
                return
            }
            if (-not $Files -and -not $FilesPath) {
                Write-JsonOutput @{ success = $false; error = 'Files or FilesPath parameter is required' }
                return
            }
            if (-not $DestDir) {
                Write-JsonOutput @{ success = $false; error = 'DestDir is required' }
                return
            }

            $DestDir = [string]$DestDir -replace '/', '\'
            if (-not (Test-Path $DestDir)) {
                New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
            }

            $fileList = Get-RequestedFileList

            $shell = New-Object -ComObject Shell.Application
            $deviceItem = Find-DeviceItemWithRetry $shell $DeviceName
            if (-not $deviceItem) {
                Write-JsonOutput @{ success = $false; error = "Device '$DeviceName' not found" }
                return
            }

            $storageRoot = Get-StorageRoot $deviceItem
            if (-not $storageRoot) {
                Write-JsonOutput @{ success = $false; error = 'Could not access device storage' }
                return
            }

            [void](Wait-MtpStorageReady $storageRoot)

            $destFolder = $shell.NameSpace($DestDir)
            if (-not $destFolder) {
                Write-JsonOutput @{ success = $false; error = "Could not open destination folder '$DestDir'" }
                return
            }
            $imported = @()
            $errors = @()
            # MTP CopyHere stalls out sporadically (roughly half of consecutive
            # copies in device testing) and a stalled transfer never recovers —
            # but re-issuing the same copy reliably completes within seconds.
            # So: short per-attempt timeout with retries, instead of one long
            # 120s wait that silently eats the file.
            $perAttemptTimeoutSec = 30
            $maxAttempts = 3

            # Resolve all requested files in one folder pass instead of a full
            # per-file tree traversal — the same O(n^2) fix as the thumbnails
            # action; per-file resolution dominated import time for multi-photo
            # selections.
            $itemsByPath = Get-PhotoItemsByPaths $storageRoot @($fileList | ForEach-Object { [string]$_ })

            # Per-file progress lines on stderr ("PROGRESS {json}") so the app
            # can stream a real progress bar and treat silence as the only
            # timeout condition.
            function Write-ImportProgress($payload) {
                try { [Console]::Error.WriteLine('PROGRESS ' + ($payload | ConvertTo-Json -Compress)) } catch {}
            }

            $total = @($fileList).Count
            $done = 0

            foreach ($filePath in $fileList) {
                try {
                    $srcFile = $itemsByPath[[string]$filePath]
                    if (-not $srcFile) {
                        $srcFile = Resolve-PhotoPath $storageRoot ([string]$filePath)
                    }

                    $fileName = Split-Path $filePath -Leaf

                    if (-not $srcFile) {
                        $errors += "File '$filePath' not found on device"
                        $done++
                        Write-ImportProgress @{ phase = 'copying'; completed = $done; total = $total; name = $fileName; ok = $false }
                        continue
                    }

                    $destPath = Join-Path $DestDir $fileName
                    if (Test-Path -LiteralPath $destPath) {
                        Remove-Item -LiteralPath $destPath -Force -ErrorAction SilentlyContinue
                    }

                    $copied = $false
                    for ($attempt = 1; $attempt -le $maxAttempts -and -not $copied; $attempt++) {
                        Write-ImportProgress @{ phase = 'copying'; completed = $done; total = $total; name = $fileName; attempt = $attempt }
                        if ($attempt -gt 1) {
                            # Refresh the COM session and re-resolve the source
                            # item before retrying a stalled copy.
                            $shell = New-Object -ComObject Shell.Application
                            $destFolder = $shell.NameSpace($DestDir)
                            $retryDevice = Find-DeviceItem $shell $DeviceName
                            if ($retryDevice) {
                                $retryRoot = Get-StorageRoot $retryDevice
                                if ($retryRoot) {
                                    $fresh = Resolve-PhotoPath $retryRoot ([string]$filePath)
                                    if ($fresh) { $srcFile = $fresh }
                                }
                            }
                        }
                        $destFolder.CopyHere($srcFile, 0x14)
                        $copied = Wait-ForFileAtPath $destPath $perAttemptTimeoutSec
                    }

                    $done++
                    if ($copied) {
                        $imported += [PSCustomObject]@{
                            name      = [string]$fileName
                            localPath = [string]$destPath
                        }
                        Write-ImportProgress @{ phase = 'copying'; completed = $done; total = $total; name = $fileName; ok = $true; localPath = [string]$destPath }
                    } else {
                        $errors += "Timed out copying '$fileName' after $maxAttempts attempts"
                        Write-ImportProgress @{ phase = 'copying'; completed = $done; total = $total; name = $fileName; ok = $false }
                    }
                } catch {
                    $done++
                    $errors += "Error copying '$filePath': $($_.Exception.Message)"
                    Write-ImportProgress @{ phase = 'copying'; completed = $done; total = $total; name = (Split-Path $filePath -Leaf); ok = $false }
                }
            }

            Write-JsonOutput @{
                success  = $true
                imported = @($imported)
                errors   = @($errors)
            }
        } catch {
            Write-JsonOutput @{ success = $false; error = $_.Exception.Message }
        }
    }

    'thumbnails' {
        try {
            if (-not $DeviceName) {
                Write-JsonOutput @{ success = $false; error = 'DeviceName is required' }
                return
            }
            if (-not $Files -and -not $FilesPath) {
                Write-JsonOutput @{ success = $false; error = 'Files or FilesPath parameter is required' }
                return
            }

            $pathList = @(Get-RequestedFileList)
            if ($pathList.Count -eq 0) {
                Write-JsonOutput @{ success = $true; thumbnails = @() }
                return
            }

            $shell = New-Object -ComObject Shell.Application
            $deviceItem = Find-DeviceItemWithRetry $shell $DeviceName
            if (-not $deviceItem) {
                Write-JsonOutput @{ success = $false; error = "Device '$DeviceName' not found" }
                return
            }

            $storageRoot = Get-StorageRoot $deviceItem
            if (-not $storageRoot) {
                Write-JsonOutput @{ success = $false; error = 'Could not access device storage' }
                return
            }

            Initialize-ShellThumbnailHelper
            $itemsByPath = Get-PhotoItemsByPaths $storageRoot $pathList
            $thumbnails = @()
            foreach ($photoPath in $pathList) {
                $pathKey = [string]$photoPath
                $base64 = $null
                try {
                    $srcFile = $itemsByPath[$pathKey]
                    if ($srcFile) {
                        $base64 = Get-FileThumbnailBase64 $srcFile $script:PhonePreviewPixelSize
                    }
                } catch {}

                $thumbnails += [PSCustomObject]@{
                    path    = $pathKey
                    success = [bool]$base64
                    base64  = if ($base64) { [string]$base64 } else { '' }
                }
            }

            Write-JsonOutput @{
                success     = $true
                thumbnails  = @($thumbnails)
                mimeType    = 'image/jpeg'
            }
        } catch {
            Write-JsonOutput @{ success = $false; error = $_.Exception.Message }
        }
    }
}
