---
title: "Google Playのスクショが弾かれる。実機で撮った画像がそのままでは通らない理由と、1080×1920に直すPowerShell"
emoji: "🖼"
type: "tech"
topics: ["googleplay", "powershell", "個人開発"]
published: true
---

Google Playにスクリーンショットをアップロードして、弾かれました。

実機で撮ったスクショを、そのまま出しただけです。加工もしていません。それが通らない。

原因は、あまり話題にならない要件でした。

## 要件

Google Play公式ヘルプで確認した、スマートフォン用スクリーンショットの要件です（2026年8月時点）。

- JPEG または **24bit PNG（アルファチャンネルなし）**
- 各辺 320〜3840px
- **長辺は短辺の2倍を超えてはならない**
- 推奨は 9:16 縦・最低 1080×1920

問題は3つ目です。**長辺 ÷ 短辺 ≤ 2** でなければいけません。

## 実際に弾かれた2つ

自分は2つ、同時に踏みました。

**1. 検証実機の生スクショ**

使っていた検証機は moto g24 で、解像度は **720×1612** です。

```
1612 ÷ 720 = 2.239  → 不合格
```

最近のスマホは縦長化が進んでいるので、**実機で撮った生スクショがそのままでは通らない**ということが普通に起きます。「実機で撮ったのだから正しいサイズのはずだ」という前提が成り立ちません。

**2. デザイン指示書に書かれていた解像度**

さらに厄介だったのがこちらです。自分の手元にあった撮影指示書には、セットAの解像度として **1179×2556** と書かれていました。

```
2556 ÷ 1179 = 2.168  → 不合格
```

この数字、見覚えのある人もいると思います。**iPhone 15 Proの解像度です。** App Storeの要件とGoogle Playの要件を取り違えたまま、指示書に書かれていました。

指示書どおりに作っていたら、全部作り直しになるところでした。

## 直し方

単純に縮小すると比率は変わらないので、**アスペクト比自体を変える**必要があります。

やったのはこの2ステップです。

1. 画面下部のナビゲーションバーを切り落とす（そもそもストア掲載画像に入れる必要がない）
2. 1080×1920 の枠に収めて、左右の余白をアプリの背景色で埋める

ポイントは**余白の色**です。アプリのUIがダーク基調なら、背景色と同じ色（自分の場合は `#12162B`）で埋めると継ぎ目がまったく見えません。白で埋めると額縁のように見えてしまうので、ここは必ずアプリの背景色に合わせます。

PowerShellで一括変換しています。

```powershell
Add-Type -AssemblyName System.Drawing
$TARGET_W = 1080; $TARGET_H = 1920
$BG = [Drawing.ColorTranslator]::FromHtml('#12162B')  # アプリの背景色に合わせる
$NAV_CROP = 48   # 切り落とすナビバーの高さ(px)。実機に合わせて調整

foreach ($f in Get-ChildItem .\raw\*.png) {
    $src = [Drawing.Image]::FromFile($f.FullName)

    # 1) ナビバーを切り落とす
    $cropH = $src.Height - $NAV_CROP
    $cropped = New-Object Drawing.Bitmap $src.Width, $cropH
    $g = [Drawing.Graphics]::FromImage($cropped)
    $g.DrawImage($src, 0, 0, [Drawing.Rectangle]::new(0, 0, $src.Width, $cropH), 'Pixel')
    $g.Dispose(); $src.Dispose()

    # 2) 1080x1920に収め、余白を背景色で埋める
    $scale = [Math]::Min($TARGET_W / $cropped.Width, $TARGET_H / $cropped.Height)
    $w = [int]($cropped.Width * $scale); $h = [int]($cropped.Height * $scale)
    $canvas = New-Object Drawing.Bitmap $TARGET_W, $TARGET_H
    $g2 = [Drawing.Graphics]::FromImage($canvas)
    $g2.Clear($BG)
    $g2.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.DrawImage($cropped, [int](($TARGET_W - $w) / 2), [int](($TARGET_H - $h) / 2), $w, $h)
    $g2.Dispose(); $cropped.Dispose()

    $canvas.Save(".\out\$($f.Name)", [Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    Write-Output "✓ $($f.Name)"
}
```

`System.Drawing` を使っているので、Windowsなら追加のインストールは不要です。ImageMagickを入れなくても済みます。

## 気をつける点

**アルファチャンネルを残さない。** 要件は「24bit PNG（アルファなし）」です。上のコードは背景色で全面を塗ってから描画しているので、透明部分は残りません。透過を含んだPNGをそのまま出すと、これも弾かれます。

**この規定は全アプリに効く。** 1本のアプリで直しても、他のアプリのスクショにも同じ要件が適用されます。自分は3本あるので、変換スクリプトを共通で使い回しています。

## まとめ

実機の生スクショは、そのままではGoogle Playを通りません。最近の縦長スマホほど引っかかります。

そして地味に危ないのが、**App Storeの解像度と混ざること**です。1179×2556 は iPhone の数字で、Google Play では不合格になります。手元の指示書に書いてある数字が、どちらのストアのものかは一度確認しておいたほうがいいです。

---

ストア審査まわりでは、[GitHubのアカウント名を変えて規約ページが全部404になった話](https://ykstudio.net/blog/github-rename-broke-three-apps/)のほうがダメージは大きかったです。あわせてどうぞ。

---

この記事は個人サイト [YK Studio](https://ykstudio.net/) に掲載したものです（初出: https://ykstudio.net/blog/play-screenshot-spec-trap/）。
アプリ3本を個人開発して、実際に壊れた話と実際にかかった金額を書いています。

- この記事で触れているアプリ: [Kiroku](https://ykstudio.net/works/kiroku/)
- アプリ開発・ストア公開のご依頼: [料金と進め方](https://ykstudio.net/services/)
