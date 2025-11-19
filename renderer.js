// ===================================================================
//   renderer.js (lasso 任意形狀選取 + Soft UI 預覽)
// ===================================================================

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

// 關閉結果視窗
document.querySelector(".close-button").addEventListener("click", () => {
  visionResult.classList.add("hidden");
});

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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    originalScreenshot = new Image();
    originalScreenshot.onload = () => (originalLoaded = true);
    originalScreenshot.onerror = () => (originalLoaded = false);
    originalScreenshot.src = canvas.toDataURL();

    stream.getTracks().forEach((t) => t.stop());
    if (hint) hint.classList.remove("hidden");
  } catch (err) {
    console.error("Error capturing screen:", err);
    window.electronAPI.closeCaptureWindow();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.electronAPI.closeCaptureWindow();
});

// mouse events for lasso
canvas.addEventListener("mousedown", (e) => {
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

canvas.addEventListener("mouseup", (e) => {
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

    // 顯示預覽對話框
    visionResult.classList.remove("hidden");
    resultText.textContent =
      "Analyzing image with Google Vision API...\n\nImage Size: " +
      w +
      " × " +
      h +
      " pixels" +
      "   - User Interface\n\n" +
      "This is a test preview, demonstrating the dialog's appearance and functionality. The actual Vision Agent analysis will be shown when integrated.";

    window.electronAPI.sendSelectionComplete(imageData);
    // 因為要展示對話框，所以不立即關閉視窗
    // setTimeout(() => window.electronAPI.closeCaptureWindow(), 200);
  } catch (err) {
    console.error("Error drawing lasso cropped image:", err);
    window.electronAPI.closeCaptureWindow();
    return;
  }
});
