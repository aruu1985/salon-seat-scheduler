# V0.12.6 操作提示精簡版

基於正式 V0.12.5，未合併家庭／同行或到店候選分支。

- 重整改為同步資料，沿用 refreshData/readDate 的六項 server 讀取、日期與捲動保留、錯誤處理；成功顯示裝置當地時間 HH:mm:ss。
- render 不再執行空格檢查，並收起過期的手動檢查結果。只有檢查空格按鈕才執行原有演算法與顯示結果。
- 整理改為重新安排座位，確認前立即返回，不改動資料；確認後原有演算法、批次寫入與錯誤處理不變。
- 無變更樣式、卡片／時間格、資料結構、Firebase 規則或後端。

## 隔離測試

所有瀏覽器測試封鎖外部連線、以記憶體 Firebase mock 執行，無正式客戶資料寫入。

`python -m http.server 8776 --bind 127.0.0.1`

`python tests/board-actions.py` 以及 `HEADER_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/salon-playwright PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 python tests/board-actions.py`：Chromium、WebKit 各 320、390、820、1440px 通過同步時間／讀取／日期與捲動保留、失敗復原、不自動提醒、主動檢查有無空格、取消零寫入、確認後原有安排；無 JavaScript 錯誤或整頁水平溢出。

`SALON_TEST_BASE=http://127.0.0.1:8776/ python tests/sync.py`：手機、平板、桌面模擬過去／現在／未來日期、雙頁面同步、新增／修改／移動／刪除、編輯草稿保留、版本衝突、監聽解除、斷線復原與過期回呼。

`SALON_TEST_BASE=http://127.0.0.1:8776/ python tests/formatting.py`：原有簡碼與完整資料、唯讀同步相容。

六個 Node 測試檔：main-header、data-sync、seat-layout、hours、appointment-details、appointment-format。

以上為瀏覽器與 SDK 模擬，不等於實體 iPad／iPhone Safari 驗收；實機操作待店內驗收。正式網站僅驗證靜態版本與發布資源，不執行安排座位或其他寫入測試。
