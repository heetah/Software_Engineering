// ===================================================================
//   renderer.js (lasso 任意形狀選取 + Soft UI 預覽)
// ===================================================================

console.log("🔴 RENDERER.JS VERSION 2.0 已載入");

let isDrawing = false;
let startPoint = null; // lasso 起點
let currentPoint = null; // 當前滑鼠點
let originalScreenshot = null; // 儲存原始截圖
let originalLoaded = false; // 確保 Image 已載入
let points = []; // lasso 點集合

// --- DOM 元素獲取 ---
const canvas = document.getElementById("capture-canvas");
const ctx = canvas.getContext("2d");
const selectionInfo = document.getElementById("selection-info");
const selectionSize = document.getElementById("selection-size");
const hint = document.getElementById("hint");
const visionResult = document.getElementById("vision-result");
const resultText = document.getElementById("result-text");
const modeSelector = document.getElementById("mode-selector");

let selectedMode = null; // 'lens' 或 'ai'
let capturedImageData = null; // 儲存截圖數據

// 關閉結果視窗
document.querySelector(".close-button").addEventListener("click", () => {
  visionResult.classList.add("hidden");
  resetCanvas();
  window.electronAPI.closeCaptureWindow();
});

// 模式選擇按鈕事件
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedMode = btn.getAttribute("data-mode");
    modeSelector.classList.add("hidden");
    handleModeSelection(selectedMode, capturedImageData);
  });
});

// 取消按鈕
document.querySelector(".cancel-btn").addEventListener("click", () => {
  modeSelector.classList.add("hidden");
  resetCanvas();
  window.electronAPI.closeCaptureWindow();
});

// 處理模式選擇
function handleModeSelection(mode, imageData) {
  if (mode === "lens") {
    console.log("[Renderer] Activating Google Lens mode");
    // Google 智慧鏡頭：開啟 Google Lens 搜圖
    openGoogleLens(imageData);
    // 清除 canvas 並關閉視窗
    resetCanvas();
    window.electronAPI.closeCaptureWindow();
  } else if (mode === "ai") {
    console.log("[Renderer] Activating AI Analysis mode");
    // AI 智能分析：使用原本的 Vision API
    visionResult.classList.remove("hidden");
    resultText.textContent = "正在使用 AI 分析圖片...";
    window.electronAPI.sendSelectionComplete(imageData);
    // AI 分析時不關閉視窗，讓使用者可以看到結果
    // 使用者可以透過關閉按鈕或 ESC 鍵來關閉
  }
}

// 重置 canvas 狀態
function resetCanvas() {
  points = [];
  isDrawing = false;
  capturedImageData = null;
  selectedMode = null;

  // 清除 canvas
  if (ctx && canvas.width && canvas.height) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // 隱藏所有 UI 元素
  if (selectionInfo) selectionInfo.classList.remove("visible");
  if (modeSelector) modeSelector.classList.add("hidden");
  if (visionResult) visionResult.classList.add("hidden");

  // 重新繪製原始截圖（如果存在）
  if (originalScreenshot && originalLoaded && canvas.width && canvas.height) {
    ctx.drawImage(originalScreenshot, 0, 0, canvas.width, canvas.height);
  }
}

// 開啟 Google Lens 以圖搜圖
function openGoogleLens(imageDataUrl) {
  // 將 base64 圖片上傳到 Google Lens
  // Google Lens 支援透過 URL 參數傳遞圖片
  const base64Data = imageDataUrl.split(",")[1];

  // 方法 1: 使用 Google Lens 的圖片 URL
  // 注意：這需要將圖片轉換為可公開訪問的 URL
  // 由於無法直接上傳 base64，我們使用 Google Images 搜尋作為替代

  // 方法 2: 儲存到臨時檔案並通知主進程開啟
  window.electronAPI.openGoogleLens(imageDataUrl);
}

ctx.imageSmoothingEnabled = false;

function toCanvasCoords(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

// draw lasso preview
function drawLassoPreview(pointList) {
  if (
    !originalScreenshot ||
    !originalLoaded ||
    !pointList ||
    pointList.length < 2
  )
    return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalScreenshot, 0, 0, canvas.width, canvas.height);

  // 遮罩
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 選取區域
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pointList[0].x, pointList[0].y);
  for (let i = 1; i < pointList.length; i++)
    ctx.lineTo(pointList[i].x, pointList[i].y);
  if (!isDrawing) {
    // 只在完成繪製時連接起點和終點
    ctx.closePath();
  }
  ctx.clip();

  ctx.drawImage(originalScreenshot, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(74,158,255,0.06)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 最外層發光
  ctx.beginPath();
  ctx.moveTo(pointList[0].x, pointList[0].y);
  for (let i = 1; i < pointList.length; i++)
    ctx.lineTo(pointList[i].x, pointList[i].y);
  if (!isDrawing) {
    ctx.closePath();
  }
  ctx.lineWidth = 20; // 增加到 20px
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(74,158,255,0.12)"; // 稍微降低透明度
  ctx.stroke();

  // 中層發光
  ctx.beginPath();
  ctx.moveTo(pointList[0].x, pointList[0].y);
  for (let i = 1; i < pointList.length; i++)
    ctx.lineTo(pointList[i].x, pointList[i].y);
  if (!isDrawing) {
    ctx.closePath();
  }
  ctx.lineWidth = 14; // 增加到 14px
  ctx.strokeStyle = "rgba(63, 137, 222, 0.25)"; // 稍微調整透明度
  ctx.stroke();

  // 主要邊框
  ctx.beginPath();
  ctx.moveTo(pointList[0].x, pointList[0].y);
  for (let i = 1; i < pointList.length; i++)
    ctx.lineTo(pointList[i].x, pointList[i].y);
  if (!isDrawing) {
    ctx.closePath();
  }
  ctx.lineWidth = 8; // 增加到 8px
  ctx.strokeStyle = "rgba(74,158,255,0.95)";
  ctx.stroke();

  // 內部高光
  ctx.beginPath();
  ctx.moveTo(pointList[0].x, pointList[0].y);
  for (let i = 1; i < pointList.length; i++)
    ctx.lineTo(pointList[i].x, pointList[i].y);
  if (!isDrawing) {
    ctx.closePath();
  }
  ctx.lineWidth = 4; // 增加到 4px
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.stroke();
}

// 接收來源並擷取第一幀
// 處理 Vision API 結果
window.electronAPI.onVisionResult((text) => {
  if (resultText) {
    resultText.textContent = text;
  }
});

window.electronAPI.onSetScreenSource(async (sourceId) => {
  try {
    // 在載入新截圖前，先完全清除舊的狀態
    points = [];
    isDrawing = false;
    capturedImageData = null;
    selectedMode = null;
    originalScreenshot = null;
    originalLoaded = false;

    // 隱藏所有 UI 元素
    if (selectionInfo) selectionInfo.classList.remove("visible");
    if (modeSelector) modeSelector.classList.add("hidden");
    if (visionResult) visionResult.classList.add("hidden");
    if (hint) hint.classList.add("hidden");

    // 清除 canvas
    if (ctx && canvas.width && canvas.height) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
        },
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.createElement("video");
    video.srcObject = stream;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
      video.onerror = reject;
    });

    // Canvas設置為視窗完整尺寸
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    // 清除並填充暗色背景
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 計算90%區域的位置和大小
    const scale = 0.90;
    const scaledWidth = canvas.width * scale;
    const scaledHeight = canvas.height * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;

    // 在中間85%區域繪製截圖
    ctx.drawImage(
      video,
      0, 0, video.videoWidth, video.videoHeight,
      offsetX, offsetY, scaledWidth, scaledHeight
    );

    // 保存完整的canvas作為原始截圖
    originalScreenshot = new Image();
    originalScreenshot.onload = () => {
      originalLoaded = true;
      console.log("New screenshot loaded successfully (85% scaled)");
    };
    originalScreenshot.onerror = () => {
      originalLoaded = false;
      console.error("Failed to load screenshot");
    };
    originalScreenshot.src = canvas.toDataURL();

    stream.getTracks().forEach((t) => t.stop());
    if (hint) hint.classList.remove("hidden");
  } catch (err) {
    console.error("Error capturing screen:", err);
    window.electronAPI.closeCaptureWindow();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    resetCanvas();
    window.electronAPI.closeCaptureWindow();
  }
});

// mouse events for lasso
canvas.addEventListener("mousedown", (e) => {
  console.log("[Renderer] Mousedown event triggered");
  if (!originalScreenshot || !originalLoaded) return;
  const p = toCanvasCoords(e);
  points = [p];
  isDrawing = true;
  if (selectionInfo) selectionInfo.classList.add("visible");
  if (hint) hint.classList.add("hidden");
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const p = toCanvasCoords(e);
  const last = points[points.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) points.push(p);

  // 更新 bounding box 顯示
  const xs = points.map((pt) => pt.x);
  const ys = points.map((pt) => pt.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const w = Math.round(maxX - minX);
  const h = Math.round(maxY - minY);
  if (selectionSize) selectionSize.textContent = `${w} × ${h}`;

  drawLassoPreview(points);
});

canvas.addEventListener("mouseup", async (e) => {
  console.log("[Renderer] Mouseup event triggered");
  if (!isDrawing) return;
  isDrawing = false;
  if (points.length < 3) {
    window.electronAPI.closeCaptureWindow();
    return;
  }

  const xs = points.map((pt) => pt.x);
  const ys = points.map((pt) => pt.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const w = Math.round(maxX - minX);
  const h = Math.round(maxY - minY);

  if (w <= 0 || h <= 0) {
    window.electronAPI.closeCaptureWindow();
    return;
  }

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = w;
  cropCanvas.height = h;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.clearRect(0, 0, w, h);

  // 建立多邊形路徑（相對座標）
  cropCtx.beginPath();
  cropCtx.moveTo(points[0].x - minX, points[0].y - minY);
  for (let i = 1; i < points.length; i++)
    cropCtx.lineTo(points[i].x - minX, points[i].y - minY);
  cropCtx.closePath();
  cropCtx.clip();

  try {
    cropCtx.drawImage(originalScreenshot, minX, minY, w, h, 0, 0, w, h);
    const imageData = cropCanvas.toDataURL("image/png");

    // 儲存截圖數據
    capturedImageData = imageData;

    // 檢查預設搜尋模式
    console.log("[Renderer] About to fetch search mode...");
    try {
      const mode = await window.electronAPI.invoke('settings:get-search-mode');
      console.log("[Renderer] Fetched Search Mode:", mode, "Type:", typeof mode); 
      
      if (mode === 'lens') {
        console.log("[Renderer] Mode matched 'lens', calling handleModeSelection");
        handleModeSelection('lens', capturedImageData);
      } else if (mode === 'ai') {
        console.log("[Renderer] Mode matched 'ai', calling handleModeSelection");
        handleModeSelection('ai', capturedImageData);
      } else {
        console.log("[Renderer] Mode is 'ask' or unknown, showing mode selector");
        // 預設 'ask' 或其他情況，顯示選擇器
        modeSelector.classList.remove("hidden");
      }
    } catch (err) {
      console.error("[Renderer] Failed to get search mode:", err);
      alert(`錯誤：無法獲取搜尋模式\n${err.message}`);
      modeSelector.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Error drawing lasso cropped image:", err);
    window.electronAPI.closeCaptureWindow();
    return;
  }
});
