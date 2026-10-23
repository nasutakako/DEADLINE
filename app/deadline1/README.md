# DEADLINE1 を iPhone アプリにする手順（Mac で）

このフォルダは DEADLINE1 の App Store 版の土台。ゲーム本体は `www/`（`../build_app.py` で作る。フォント・ランキング・課金の橋渡しがすべて中に入っていて、ランキング以外はオフラインで動く）。

## 1. 最初の一回だけ

1. Mac に Xcode（App Store から）と Node.js（https://nodejs.org の LTS）を入れる
2. このフォルダをターミナルで開いて:
   ```
   npm install
   npx cap sync ios
   ```
   （`ios/` はもう作ってある。横画面固定、全画面、アイコン、起動画面、暗号化の申告は設定済み）
3. `capacitor.config.json` の `appId` を自分のものに変える（例: `jp.<あなたの名前>.deadline1`）。App Store Connect で作るアプリの「バンドルID」と同じにする。Xcode の「Signing & Capabilities」でも同じIDとチーム（Apple Developer Program のアカウント）を選ぶ
4. Xcode の「Signing & Capabilities」で「+ Capability」→「In-App Purchase」を足す

## 2. ゲームを更新したとき

```
# www/ はゲームを変えるたびに作り直して、このフォルダに入れ直してある
npx cap sync ios             # www/ を iOS プロジェクトに写す
npx cap open ios             # Xcode が開く → ▶ で実機/シミュレータ起動
```

## 3. 課金（App Store Connect で作る商品）

商品IDはゲームのコードと一致させる。

| 商品ID | 種類 | 値段 |
|---|---|---|
| deadline1.item.bomb_emp / bomb_grav / rk_plasma / bs_after / bs_thunder / dash_warp | 非消耗型 | 500円 |
| deadline1.stars.50 / 100 / 250 / 500 / 750 / 1000 | 消耗型 | 200 / 400 / 1,000 / 2,000 / 3,000 / 4,000円 |

- 購入は `www/iap.js`（cordova-plugin-purchase）が受け持つ。ゲーム側は `window.DEADLINE_IAP` だけを見る
- 課金の動作確認は Xcode の StoreKit 設定ファイル、または TestFlight（お金はかからない）で行う

## 4. 出す前の確認

- [ ] 横画面固定、ノッチ側にボタンがかぶらない
- [ ] 機内モードで起動・プレイできる（ランキングだけ「接続できません」）
- [ ] 名前の登録 → 「名前とランキングの記録を削除」で消える
- [ ] 購入・キャンセル・「購入を復元」
- [ ] プライバシーポリシー/サポートのリンクが開く
