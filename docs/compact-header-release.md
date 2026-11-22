# V0.12.5 精簡主畫面資訊列

基於正式 V0.12.4（9b8351e），僅修改日期呈現與上班人員列。日期原值仍為 YYYY-MM-DD；排班來源、監聽及臨時修改處理程序保留。無新增資料欄位、後端或規則。未合併家庭／同行或到店候選功能。

## 驗證

`node --test tests/main-header.cjs tests/hours.cjs tests/seat-layout.cjs tests/appointment-format.cjs tests/appointment-details.cjs tests/data-sync.cjs`：6 個測試檔通過。

`python dev/header-server.py` 啟動後，`python tests/main-header.py` 及 `HEADER_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/salon-playwright PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 python tests/main-header.py`：Chromium、WebKit 各 320、390、588、820、1440px 五種尺寸通過。使用隔離 Firebase mock，封鎖外部資料連線。

驗證七種星期、昨天／今天／明天、手動日期、跨月／年與閏日；原生日期選擇器事件；人員單列與窄螢幕內部捲動；無頁面橫向溢出；兩職類原有臨時修改及 mock 儲存；日期切換反映每日／月底排班與晚到備註；非編輯操作零寫入。與舊版比較，座位欄寬、時間格高度、卡片尺寸、字體、顏色不變。上方高度手機減少 117–129px、平板／桌面減少 37–41px。

瀏覽器模擬不等於實機驗收。iPhone Safari、iPad Safari 實機及原生日期面板仍待店內驗收。正式 Firestore 未用於寫入測試。
