# salon-seat-scheduler

## V0.8 Firebase 雲端同步版

V0.8 保留原有時間軸、六格座位、彈性區、右側預約面板、拖曳、空格檢查、整理與 Firestore 即時同步，並新增跨裝置點擊操作選單，以及可擴充的第二服務 `secondaryService`。有第二服務的預約卡會以左右雙色顯示。

### Firebase 設定

1. 在 Firebase Console 建立或選擇專案，新增 Web App，啟用 Firestore Database 與 Authentication 的匿名登入。
2. 把 Web App SDK 設定填入 `firebase-config.js`。
3. 將 `firestore.rules` 部署到該 Firebase 專案。
4. 透過 HTTPS 網站開啟 `index.html`。多台裝置只要使用相同 Firebase 專案，新增、修改、刪除與拖曳就會即時同步。

> 匿名登入不會改變原有操作方式；Firestore 規則會拒絕未取得 Firebase 身分的存取。若需限制只有店內裝置可用，建議後續改用店員帳號登入。
