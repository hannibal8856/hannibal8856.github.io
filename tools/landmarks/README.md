# 地標 3D 模型轉換

來源：臺北市宗教建築3D模型庫（臺北市政府民政局，data.taipei，政府資料開放授權條款-第1版）。
清單 CSV：https://data.taipei/api/dataset/d8718826-54cf-4cba-ba92-088b1658c7c6/resource/bf338b29-e36b-4131-aab5-25c7342b2139/download
模型檔在 canet.civil.taipei（KMZ = KML + COLLADA + 貼圖）。

步驟：
1. 下載 KMZ 並解壓到 `x<編號>/`，例如 `curl -O https://canet.civil.taipei/tp90-1/model/110001.kmz && unzip 110001.kmz -d x110001`。
2. 從 three.js 0.128.0 的 npm 套件複製 `build/three.min.js`、`examples/js/loaders/ColladaLoader.js`、`TGALoader.js` 到同一個資料夾。
3. 在該資料夾執行 `python3 -m http.server 8765`，再執行 `node conv.js`（用 Playwright 開 `conv.html`，載入 COLLADA、套用座標轉換、依材質分組、貼圖縮成 256 像素 JPEG，有大量透明的保留 PNG 並縮到 192 像素）。經緯度和方位寫在 `conv.js` 的清單裡，取自各 KMZ 的 `doc.kml` 中 `<Model>` 的 `<Location>` 和 `<heading>`。
4. `python3 pack.py landmarks_raw.json landmarks.json`：合併重複頂點，座標以 2 公分為單位存成 Int16、UV 乘 256 存成 Int16、索引存成 Uint16/Uint32，全部 base64。
5. 把 `landmarks.json` 放進 `racing.html` 的 `<script type="application/json" id="landmarks">`。
