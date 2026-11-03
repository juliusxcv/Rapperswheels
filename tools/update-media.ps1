# Rapperswheels - Medien aktualisieren
#
# Neue Fotos (.jpg/.jpeg/.png) und Clips (.mp4/.webm/.mov) einfach in
# assets/Photos ablegen und dieses Skript ausfuehren:
#
#   powershell -ExecutionPolicy Bypass -File tools\update-media.ps1
#
# Das Skript erstellt web-optimierte Versionen in assets/media (gross)
# und assets/media/thumbs (klein) und schreibt die Liste media.js neu.
# Dateien, die aus assets/Photos geloescht werden, verschwinden auch von der Website.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent $PSScriptRoot
$src    = Join-Path $root 'assets\Photos'
$out    = Join-Path $root 'assets\media'
$thumbs = Join-Path $out 'thumbs'
New-Item -ItemType Directory -Force $out, $thumbs | Out-Null

$imageExt = '.jpg', '.jpeg', '.png'
$videoExt = '.mp4', '.webm', '.mov', '.m4v'

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

function Save-Resized($img, [int]$maxEdge, [string]$path, [long]$quality) {
    $scale = [Math]::Min(1.0, $maxEdge / [Math]::Max($img.Width, $img.Height))
    $w = [int][Math]::Round($img.Width * $scale)
    $h = [int][Math]::Round($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $w, $h)
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), $quality
    $bmp.Save($path, $jpeg, $params)
    $g.Dispose(); $bmp.Dispose()
    return @($w, $h)
}

# Korrigiert die Ausrichtung anhand der EXIF-Daten (Handyfotos)
function Set-Orientation($img) {
    if ($img.PropertyIdList -notcontains 274) { return }
    switch ($img.GetPropertyItem(274).Value[0]) {
        3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
        6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
        8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
    }
}

$entries = @()
$files = Get-ChildItem $src -File | Sort-Object Name

foreach ($f in $files) {
    $ext  = $f.Extension.ToLower()
    $base = [IO.Path]::GetFileNameWithoutExtension($f.Name)

    if ($imageExt -contains $ext) {
        $big   = Join-Path $out "$base.jpg"
        $small = Join-Path $thumbs "$base.jpg"
        $img = [System.Drawing.Image]::FromFile($f.FullName)
        try {
            Set-Orientation $img
            if (-not (Test-Path $big) -or (Get-Item $big).LastWriteTime -lt $f.LastWriteTime) {
                Write-Host "Bild  $($f.Name)"
                Save-Resized $img 2000 $big 82 | Out-Null
                Save-Resized $img 700 $small 78 | Out-Null
            }
            $entries += [ordered]@{ type = 'image'; src = "assets/media/$base.jpg"; thumb = "assets/media/thumbs/$base.jpg"; w = $img.Width; h = $img.Height }
        } finally { $img.Dispose() }
    }
    elseif ($videoExt -contains $ext) {
        $dest = Join-Path $out $f.Name
        if (-not (Test-Path $dest) -or (Get-Item $dest).LastWriteTime -lt $f.LastWriteTime) {
            Write-Host "Clip  $($f.Name)"
            Copy-Item $f.FullName $dest -Force
        }
        $entries += [ordered]@{ type = 'video'; src = "assets/media/$($f.Name)" }
    }
}

# Verwaiste Dateien entfernen
$keep = $entries | ForEach-Object { Split-Path $_.src -Leaf }
Get-ChildItem $out -File | Where-Object { $keep -notcontains $_.Name } | Remove-Item
Get-ChildItem $thumbs -File | Where-Object { $keep -notcontains $_.Name } | Remove-Item

$json = ConvertTo-Json @($entries) -Depth 3
$js = "// Automatisch erzeugt von tools/update-media.ps1 - nicht von Hand bearbeiten.`nwindow.RW_MEDIA = $json;`n"
[IO.File]::WriteAllText((Join-Path $root 'media.js'), $js, (New-Object System.Text.UTF8Encoding $false))

Write-Host "$($entries.Count) Medien in media.js eingetragen."
