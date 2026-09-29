# Edge 商店素材生成脚本（Windows PowerShell + System.Drawing）
# 产物（输出到本目录）：
#   logo-300.png        扩展 Logo 300x300（按 icon128 矢量重绘，1:1）
#   screenshot-1.png    商店截图 1280x800（直播间入口/收藏）
#   screenshot-2.png    商店截图 1280x800（右键收藏菜单）
#   promo-440x280.png   小促销图
#   promo-1400x560.png  大促销图
# 重新生成：powershell -ExecutionPolicy Bypass -File generate-assets.ps1

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$outDir = Split-Path -Parent $PSCommandPath
$repo = Resolve-Path (Join-Path $outDir '..\..\..')
$guideImages = Join-Path $repo 'docs\guide\images'

$BRAND = [System.Drawing.Color]::FromArgb(255, 50, 42, 127)   # #322A7F（取自 icon128 采样）
$BRAND_DARK = [System.Drawing.Color]::FromArgb(255, 23, 19, 64)

function Get-FontFamily([string[]]$names) {
  foreach ($n in $names) {
    try { return New-Object System.Drawing.FontFamily($n) } catch { }
  }
  return New-Object System.Drawing.FontFamily('Arial')
}
$ffBold = Get-FontFamily @('Microsoft YaHei UI', 'Microsoft YaHei', 'SimHei')
$ffRegular = Get-FontFamily @('Microsoft YaHei UI', 'Microsoft YaHei', 'SimSun')

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# 按 icon128.png 的轮廓重绘品牌图标（128 坐标系 → 任意尺寸，矢量清晰）
function Draw-BrandIcon([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$size) {
  $s = $size / 128.0
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

  $bgPath = New-RoundedPath ($x + 10 * $s) ($y + 10 * $s) (108 * $s) (108 * $s) (26 * $s)
  $bgBrush = New-Object System.Drawing.SolidBrush $BRAND
  $g.FillPath($bgBrush, $bgPath)

  # 五角星：中心 (43,65)，外径 19，内径 12，尖角朝上
  $cx = $x + 43 * $s; $cy = $y + 65 * $s
  $pts = New-Object 'System.Drawing.PointF[]' 10
  for ($i = 0; $i -lt 5; $i++) {
    $aOut = (-90 + $i * 72) * [Math]::PI / 180
    $aIn = (-90 + $i * 72 + 36) * [Math]::PI / 180
    $pts[2 * $i] = New-Object System.Drawing.PointF ([float]($cx + 19 * $s * [Math]::Cos($aOut))), ([float]($cy + 19 * $s * [Math]::Sin($aOut)))
    $pts[2 * $i + 1] = New-Object System.Drawing.PointF ([float]($cx + 12 * $s * [Math]::Cos($aIn))), ([float]($cy + 12 * $s * [Math]::Sin($aIn)))
  }
  $g.FillPolygon($white, $pts)

  # 三个对话气泡（圆角矩形 + 小尾巴），坐标取自 icon128 轮廓扫描
  function Draw-Bubble([System.Drawing.Graphics]$g, [System.Drawing.Brush]$brush, [float]$s, [float]$x, [float]$y,
    [float]$bx, [float]$by, [float]$bw, [float]$bh, [float]$br, [object[]]$tail) {
    $path = New-RoundedPath ($x + $bx * $s) ($y + $by * $s) ($bw * $s) ($bh * $s) ($br * $s)
    $g.FillPath($brush, $path)
    if ($tail) {
      $tp = New-Object 'System.Drawing.PointF[]' ($tail.Count / 2)
      for ($i = 0; $i -lt $tail.Count / 2; $i++) {
        $tp[$i] = New-Object System.Drawing.PointF ([float]($x + $tail[2 * $i] * $s)), ([float]($y + $tail[2 * $i + 1] * $s))
      }
      $g.FillPolygon($brush, $tp)
    }
  }

  Draw-Bubble $g $white $s $x $y 62 40 16 10 5 @(65, 48, 70.5, 48, 66.5, 53)
  Draw-Bubble $g $white $s $x $y 72 50 28 13 7 @(90, 61, 96.5, 61, 94.5, 67.5)
  Draw-Bubble $g $white $s $x $y 64 68 28 12 6 @(73, 78.5, 79.5, 78.5, 72.5, 86.5)
}

# ── 1. logo-300.png（透明背景，与工具栏图标同构）────────────────
function New-Logo([string]$path, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  Draw-BrandIcon $g 0 0 $size
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "生成 $path"
}

# ── 2. 商店截图 1280x800（品牌底 + 标题 + 真实截图带圆角阴影）───
function New-Screenshot([string]$srcPath, [string]$outPath, [string]$kicker, [string]$headline, [double]$maxScale) {
  $W = 1280; $H = 800
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.InterpolationMode = 'HighQualityBicubic'

  $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
    [System.Drawing.Color]::FromArgb(255, 58, 49, 147), $BRAND_DARK, 35.0)
  $g.FillRectangle($bg, $rect)

  # 装饰光斑
  $halo = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 255, 255, 255))
  $g.FillEllipse($halo, 900, -180, 620, 620)
  $g.FillEllipse($halo, -220, 520, 560, 560)

  $kickerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(215, 255, 255, 255))
  $fKick = New-Object System.Drawing.Font($ffRegular, 24)
  $g.DrawString($kicker, $fKick, $kickerBrush, 80, 64)

  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $fHead = New-Object System.Drawing.Font($ffBold, 46, [System.Drawing.FontStyle]::Bold)
  $g.DrawString($headline, $fHead, $white, 76, 104)

  $img = [System.Drawing.Image]::FromFile($srcPath)
  $scale = [Math]::Min([Math]::Min(($W - 200.0) / $img.Width, ($H - 250.0) / $img.Height), $maxScale)
  $iw = [int]($img.Width * $scale); $ih = [int]($img.Height * $scale)
  $ix = [int](($W - $iw) / 2); $iy = 232

  # 阴影
  $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
  $g.FillPath($shadow, (New-RoundedPath ($ix + 6) ($iy + 14) $iw $ih 18))

  # 圆角裁剪绘制截图 + 细边框
  $clip = New-RoundedPath $ix $iy $iw $ih 18
  $state = $g.Save()
  $g.SetClip($clip)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle($ix, $iy, $iw, $ih)))
  $g.Restore($state)
  $border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), 2
  $g.DrawPath($border, $clip)

  $img.Dispose()
  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "生成 $outPath"
}

# ── 3. 促销图（统一 Pixel 字号单位，纵向居中排版）────────────────
function New-Promo([string]$outPath, [int]$W, [int]$H, [float]$iconSize, [float]$iconY,
  [float]$nameSize, [float]$enSize, [float]$tagSize, [bool]$withPills) {
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
    [System.Drawing.Color]::FromArgb(255, 58, 49, 147), $BRAND_DARK, 30.0)
  $g.FillRectangle($bg, $rect)

  $halo = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 255, 255, 255))
  $g.FillEllipse($halo, ($W - $H), -($H * 0.5), ($H * 1.4), ($H * 1.4))

  Draw-BrandIcon $g (($W - $iconSize) / 2) $iconY $iconSize

  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = 'Center'
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

  $y = $iconY + $iconSize * 1.14

  $fName = New-Object System.Drawing.Font($ffBold, $nameSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $rName = [System.Drawing.RectangleF]::new([float]0, [float]$y, [float]$W, [float]($nameSize * 1.4))
  $g.DrawString('弹幕收藏夹', $fName, $white, $rName, $center)
  $y += $nameSize * 1.4

  $enBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(205, 255, 255, 255))
  $fEn = New-Object System.Drawing.Font($ffRegular, $enSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $rEn = [System.Drawing.RectangleF]::new([float]0, [float]$y, [float]$W, [float]($enSize * 1.6))
  $g.DrawString('DanmakuBox', $fEn, $enBrush, $rEn, $center)
  $y += $enSize * 1.6

  $tagBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
  $fTag = New-Object System.Drawing.Font($ffRegular, $tagSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $rTag = [System.Drawing.RectangleF]::new([float]0, [float]$y, [float]$W, [float]($tagSize * 1.8))
  $g.DrawString('右键收藏 · 分组管理 · 一键回填 · 数据纯本地', $fTag, $tagBrush, $rTag, $center)

  if ($withPills) {
    $labels = @('免登录收藏', '弹幕分组', '一键回填', '本地存储 · 零上传')
    $fPill = New-Object System.Drawing.Font($ffBold, 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $pillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, 255, 255, 255))
    $pillPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 255, 255, 255)), 2
    $wid = @(); $total = 0
    # 注意：PowerShell 变量名不区分大小写，此处宽度变量不得用 $w（会覆盖参数 $W）
    foreach ($l in $labels) { $pw = $g.MeasureString($l, $fPill).Width + 56; $wid += $pw; $total += $pw }
    $total += 24 * ($labels.Count - 1)
    $px = ($W - $total) / 2; $py = $H - 132
    for ($i = 0; $i -lt $labels.Count; $i++) {
      $path = New-RoundedPath $px $py $wid[$i] 56 28
      $g.FillPath($pillBrush, $path)
      $g.DrawPath($pillPen, $path)
      $rPill = [System.Drawing.RectangleF]::new([float]$px, [float]($py + 15), [float]$wid[$i], 40)
      $g.DrawString($labels[$i], $fPill, $white, $rPill, $center)
      $px += $wid[$i] + 24
    }
  }

  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "生成 $outPath"
}

New-Logo (Join-Path $outDir 'logo-300.png') 300
New-Screenshot (Join-Path $guideImages '04-cang-entry-douyu.png') (Join-Path $outDir 'screenshot-1.png') '弹幕收藏夹 DanmakuBox' '聊天工具栏「藏+」入口，右键弹幕即收藏' 1.15
New-Screenshot (Join-Path $guideImages '05-context-menu.png') (Join-Path $outDir 'screenshot-2.png') '弹幕收藏夹 DanmakuBox' '右键弹幕，收藏到指定分组' 1.25
New-Promo (Join-Path $outDir 'promo-440x280.png') 440 280 92 26 34 15 13 $false
New-Promo (Join-Path $outDir 'promo-1400x560.png') 1400 560 150 52 58 24 24 $true