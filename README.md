# 益芳封口機維護中心

官方網站（GitHub Pages）：https://tin6761dd-a11y.github.io/yifang/

靜態網站，中古機以機型分組標示參考售價，實際庫存請來電或 LINE 詢問。

官網內容寫在 `content.json`。後台按「儲存並發布」時，會一併產生靜態網頁、網站地圖並更新 GitHub Pages。

網站編輯頁（免費後台，可加到手機桌面）：https://tin6761dd-a11y.github.io/yifang/admin/

本地預覽：

```bash
node scripts/build.js
python3 -m http.server --directory dist 8080
```
