# 同窗

香港小學課堂用的協作壁報。學生不用註冊帳戶：老師建立壁報，把連結和密碼交給小組，大家可以一起貼文字、圖片、YouTube，或在無限畫布上加便利貼。

介面是繁體中文（香港）。

## 本地運行

需要 Node.js 22.5 或以上。

```bash
npm install
npm run dev
```

打開 [http://127.0.0.1:43123](http://127.0.0.1:43123)。

資料存在 `data/classroom.db`，上傳的圖片在 `data/uploads/`。這兩個位置已加入 `.gitignore`。

正式環境：

```bash
npm run build
npm start
```

`npm start` 會在同一個埠提供網頁、API 和 WebSocket。

## 教師怎樣使用

1. 在首頁選擇「建立課室」，輸入課室名稱（例如「三年甲班」）和教師密碼。密碼至少 4 個字元，系統不會提供找回功能，請自行記低。
2. 之後在同一部電腦會保持登入。換電腦時選擇「進入課室」，用同一個名稱和密碼。
3. 按「新增壁報」。
   - **壁報板**：文字、圖片（上傳或網址）、YouTube。可在「自由擺放」和「整齊排列」之間切換。
   - **互動畫布**：無限畫布上的便利貼、文字、方形和圓形。拖動空白處移動，滾輪縮放。
4. 組別可以留空，或填「第1組」。這是標籤，不是學生名冊。不同組用不同壁報、不同連結。
5. 學生密碼可以留空。留空時，知道連結的人都能進入。
6. 建立後畫面上會顯示連結和密碼。按「複製訊息」交給學生。密碼只在這時顯示，之後不能再查看；忘記可在「設定」重設。
7. 在壁報上可以鎖定（學生只能看）、刪除任何貼文，或刪除整塊壁報。

學生打開 `/b/壁報編號`，如有密碼就輸入，先填暱稱再貼文。暱稱存在這個分頁的 sessionStorage，關掉分頁後要再填，方便學校共用電腦。

用兩個瀏覽器視窗打開同一條連結，就可以看到貼文即時同步。

## 環境變數

全部都可以不填，本機直接 `npm run dev` 就能用。見 `.env.example`。

| 變數 | 作用 |
| --- | --- |
| `PORT` | 預設 `43123` |
| `DATA_DIR` | 資料庫和圖片目錄，預設 `./data` |
| `AUTH_SECRET` | 簽發登入憑證的密鑰。未設定時會寫入 `DATA_DIR/auth-secret.txt`。部署時請自行設定，並保持不變，否則老師和學生要重新進入。 |

即時同步用這個程式內建的 WebSocket（路徑 `/ws`），**不用** Firebase、Supabase 或其他 API 金鑰。

## 部署

這是單一 Node 程式，適合長駐的一台機器。請掛上持久磁碟到 `DATA_DIR`（SQLite 和圖片），不要部署到無狀態的 serverless（例如 Vercel），因為 WebSocket 和 SQLite 需要同一個持續運行的程序。多台機器同時寫入同一份 SQLite 也不適合；請以單一個實例運行。

- **Docker**：`docker build -t tongchung .` 然後 `docker run -p 43123:43123 -v tongchung-data:/app/data -e AUTH_SECRET=一段隨機字串 tongchung`
- **Fly.io / Railway / Render**：用上面的 Dockerfile 或 `npm run build && npm start`，設定 `PORT`、`AUTH_SECRET`，並把磁碟掛到 `/app/data` 或你的 `DATA_DIR`。

## 限制

- 錄音和 Spotify 只顯示「即將推出」，尚未實作。
- 圖片接受 JPG、PNG、GIF、WebP，最大 5MB。iPhone 的 HEIC 請先轉成 JPG。
- 學生密碼不是高強度帳戶系統，只用來避免其他班打開連結。
- 已進入的分頁在密碼更改後仍可繼續使用，直到關掉分頁或憑證過期（約 7 日）。
