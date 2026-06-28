# salon-seat-scheduler

## V0.8.3 美甲整合修正版

V0.8.3 保留原有預約管理與 Firestore 即時同步。單做美甲可直接選擇「美甲」項目與 13 安妮蒂芬妮藍；美髮加美甲時，第二服務會依日期、開始時間與時長，以蒂芬妮藍細長條疊加在完整主預約卡上。跨日第二服務只顯示精簡排程提示。

預約高度依店內紙本格線計算，結束時間所在的半小時格也會完整覆蓋。主預約與第二服務各自依開始時間、時長計算位置與高度；重疊判定、自動排位及空格檢查也使用相同規則。

### Firebase 設定

1. 在 Firebase Console 建立或選擇專案，新增 Web App，啟用 Firestore Database 與 Authentication 的匿名登入。
2. 把 Web App SDK 設定填入 `firebase-config.js`。
3. 將 `firestore.rules` 部署到該 Firebase 專案。
4. 透過 HTTPS 網站開啟 `index.html`。多台裝置只要使用相同 Firebase 專案，新增、修改、刪除與拖曳就會即時同步。

> 匿名登入不會改變原有操作方式；Firestore 規則會拒絕未取得 Firebase 身分的存取。若需限制只有店內裝置可用，建議後續改用店員帳號登入。
