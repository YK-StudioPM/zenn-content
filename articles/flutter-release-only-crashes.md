---
title: "Flutterのreleaseビルドでだけ落ちるクラッシュを3つ踏んだ。debugでは全部動くし、flutter analyzeも通る"
emoji: "💥"
type: "tech"
topics: ["flutter", "android", "dart"]
published: true
---

`flutter run` では完璧に動くアプリが、`flutter build apk --release` して実機に入れた瞬間に**起動しなくなりました。**

しかも3回、別々の原因で落ちました。共通していたのは以下です。

- **debugビルドでは1つも再現しない**
- **`flutter analyze` は全部通る**
- **エラーメッセージが原因を指していない**

3つとも実機で1つずつ潰したので、症状と対策を書きます。

## 1. R8がクラスを削り、起動時にクラッシュする

### 症状

リリースAPKをインストールして起動すると、スプラッシュも出ずに落ちます。`adb logcat` を見ると `ClassNotFoundException` が出ています。

存在しないはずがないクラスです。debugビルドでは普通に動いています。

### 原因

Androidのリリースビルドでは **R8** がコードの圧縮と難読化を行います。R8は「使われていない」と判断したクラスを削除しますが、**リフレクション経由でしか参照されないクラスは「使われていない」と誤判定されます。**

自分の場合はWorkManagerとRoomのクラスでした。これらは実行時に名前で解決されるので、静的解析では参照が見えません。

### 対策

`android/app/proguard-rules.pro` にkeepルールを書きます。

```proguard
# WorkManager / Room はリフレクションで解決されるためR8が消してしまう
-keep class androidx.work.** { *; }
-keep class androidx.room.** { *; }
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.ListenableWorker
-keepclassmembers class * extends androidx.work.ListenableWorker {
    public <init>(...);
}
```

ハマりどころは、**このファイルが「何も問題が起きていないように見える」こと**です。keepルールを消しても、debugビルドでは何も起きません。リリースビルドを実機で起動するまで壊れたことに気づけません。

自分は先に作った別アプリの `proguard-rules.pro` をそのまま流用して解決しました。**このルールは絶対に消さない**、とコメントを入れてあります。

## 2. AdMobのApp IDが不正だと、main()より前にクラッシュする

### 症状

こちらも起動時のクラッシュですが、症状がより厄介でした。**`main()` の中に置いたログが1行も出ません。**

「アプリのコードが実行される前に落ちている」という状態です。自分のDartコードを疑っても、どこにも原因がありません。

### 原因

**Androidの初期化Providerは、`main()` よりも前に走ります。**

Google Mobile Ads SDKは `AndroidManifest.xml` の `com.google.android.gms.ads.APPLICATION_ID` を読み、その値が不正だと初期化の時点で例外を投げます。ここは自分のDartコードより前なので、Dart側でtry/catchしても捕まえられません。

**空欄・仮の文字列・自分で作った適当なIDは、すべて不正**です。「あとで本番IDに差し替えよう」と思ってダミーを入れると、この状態になります。

### 対策

本番のAdMob IDが発行されるまでは、**Google公式のテストIDを入れておきます。**

```xml
<!-- 本番ID未発行の間は必ず公式テストIDを使う。
     空欄・独自の文字列を入れるとmain()の前にクラッシュする -->
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-3940256099942544~3347511713"/>
```

このIDはGoogleが公開しているテスト用のもので、誰でも使えます。**「空にしておく」が一番やってはいけない選択でした。**

## 3. 起動時のサインインが失敗すると、白画面で固まる

### 症状

3つ目はクラッシュではなく、**白画面で固着**します。落ちないので余計に原因がわかりません。

そして再現条件が厄介でした。**電波の悪い場所での初回起動**です。手元では再現せず、たまたま圏外に近い場所で試した時に出ました。

### 原因

`main()` の中で、`runApp()` を呼ぶ前に匿名サインインをしていました。

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  await FirebaseAuth.instance.signInAnonymously();  // ← ここで失敗すると
  runApp(const MyApp());                            // ← ここに到達しない
}
```

ネットワークが不安定でサインインが例外を投げると、`runApp()` が呼ばれません。Flutterは何も描画しないので、**白画面のまま固まります。**

しかもこれは「初回起動時だけ」の問題です。一度サインインに成功していれば、以降はキャッシュされたセッションで動くので再現しません。**開発中に一度も遭遇しないのは当然でした。**

### 対策

起動処理の各ステップを、例外を吸収するヘルパー経由にしました。

```dart
/// 起動処理の1ステップ。失敗しても起動そのものは止めない。
/// ここを素通しに戻すと、圏外の初回起動で白画面固着が再発する。
Future<void> _bootStep(String label, Future<void> Function() step) async {
  try {
    await step();
  } catch (e, st) {
    debugPrint('[boot] $label に失敗（続行）: $e');
    // 本番ではCrashlytics等へ記録する
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _bootStep('Firebase初期化', () => Firebase.initializeApp());
  await _bootStep('匿名サインイン', () => FirebaseAuth.instance.signInAnonymously());
  await _bootStep('広告初期化', () => MobileAds.instance.initialize());
  runApp(const MyApp());   // 何が失敗しても必ずここに来る
}
```

**大事なのは「失敗しても起動する」という設計にすること**です。サインインできなかったなら、その状態のUIを出せばいい。起動自体を止めるべき理由はありませんでした。

## おまけ：debug証明書ではPlay Consoleに1バイトも上げられない

これは実機の話ではありませんが、同じ時期に踏んだので書いておきます。

Play Consoleは、**debug証明書（`CN=Android Debug`）で署名されたAABを、内部テストを含む全トラックで拒否します。**「内部テストなら緩いだろう」は通用しませんでした。

専用のアップロード鍵を作る必要があります。

```bash
keytool -genkey -v -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

そして最重要の注意点です。**この鍵を紛失すると、Playで公開したアプリを二度と更新できなくなります。** Googleに再発行してもらう手続きはありますが、確実ではありません。作った瞬間に、キーストア本体とパスワードを別々の場所にバックアップしてください。

## まとめ

この3つに共通していたのは、**「開発中の環境では絶対に再現しない」**ことでした。

- R8による削除は、リリースビルドでしか動かない
- 初期化Providerのクラッシュは、`main()` の前なのでDartから見えない
- 白画面固着は、ネットワークが悪いときの初回起動だけ

つまり、**`flutter run` と `flutter analyze` を何回通しても、この3つは1つも見つかりません。**

リリースビルドを実機に入れて、できれば電波の悪い場所で、初回起動から試す。これをやらずにストアへ出していたら、審査で落ちるか、最悪ユーザーの手元で起動しないアプリを配ることになっていました。

---

ストア審査まわりでは[スクリーンショットの解像度で弾かれた話](https://ykstudio.net/blog/play-screenshot-spec-trap/)も書きました。もっと重かったのは[GitHubのアカウント名を変えて規約ページが全部404になった件](https://ykstudio.net/blog/github-rename-broke-three-apps/)です。

---

この記事は個人サイト [YK Studio](https://ykstudio.net/) に掲載したものです（初出: https://ykstudio.net/blog/flutter-release-only-crashes/）。
アプリ3本を個人開発して、実際に壊れた話と実際にかかった金額を書いています。

- 作ったアプリ: [Works](https://ykstudio.net/#works)
- アプリ開発・ストア公開のご依頼: [料金と進め方](https://ykstudio.net/services/)
