# SVG Icon System

## 概述
這個專案現在使用 SVG 圖標系統，替代了之前的 Unicode 字符。所有圖標都是簡潔的線條風格，完美匹配 Neumorphism 設計。

## 已創建的圖標

| 檔案名 | 用途 | 位置 |
|--------|------|------|
| `info.svg` | 資訊/教學按鈕 | 側邊欄頂部 |
| `refresh.svg` | 刷新/新對話 | 側邊欄頂部 |
| `chat.svg` | 聊天 | 側邊欄選單 |
| `menu.svg` | 選單/歷史 | 側邊欄選單 |
| `folder.svg` | 資料夾/專案庫 | 側邊欄選單 |
| `settings.svg` | 設定 | 側邊欄選單 |
| `success.svg` | 成功狀態 | 狀態指示 |
| `error.svg` | 錯誤狀態 | 狀態指示 |
| `loading.svg` | 載入中 | 狀態指示 |
| `help.svg` | 說明/協助 | 側邊欄選單 |

## 使用方式

### 方法 1：直接在 HTML 中使用

```html
<!-- 基本使用 -->
<span class="icon">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <!-- SVG 路徑內容 -->
  </svg>
</span>

<!-- 帶額外 class -->
<span class="icon icon--spin">
  <!-- Loading icon with spinning animation -->
</span>
```

### 方法 2：使用 JavaScript Helper

```javascript
// 使用 icon-helper.js 中的函數
const iconHTML = createIcon('info', 'icon--primary');
element.innerHTML = iconHTML;
```

## CSS 類別

### 尺寸
- `.icon` - 預設 (20x20px)
- `.icon--sm` - 小 (16x16px)
- `.icon--lg` - 大 (48x48px)

### 顏色
- `.icon--primary` - 主色調 (accent 顏色)
- `.icon--danger` - 危險/錯誤色
- `.icon--muted` - 柔和灰色

### 動畫
- `.icon--spin` - 旋轉動畫 (適用於 loading icon)

## 優點

✅ **可縮放** - SVG 在任何解析度都清晰  
✅ **可客製化** - 使用 CSS `currentColor` 繼承文字顏色  
✅ **一致性** - 所有圖標統一風格  
✅ **性能** - 內嵌 SVG 無需額外請求  
✅ **Neumorphic** - 簡潔線條風格完美匹配設計系統

## 檔案結構

```
dev_page/
├── icons/              # SVG 圖標檔案
│   ├── info.svg
│   ├── refresh.svg
│   ├── chat.svg
│   ├── menu.svg
│   ├── folder.svg
│   ├── settings.svg
│   ├── success.svg
│   ├── error.svg
│   ├── loading.svg
│   └── help.svg
├── icons.css           # 圖標系統樣式
├── icon-helper.js      # JavaScript 輔助函數
├── main-window.html    # 已更新使用 SVG
└── style.css           # 主樣式表
```

## 添加新圖標

1. 在 `icons/` 資料夾中創建新的 SVG 檔案
2. 確保使用相同的樣式：
   - `viewBox="0 0 24 24"`
   - `fill="none"`
   - `stroke="currentColor"`
   - `stroke-width="1.5"`
   - `stroke-linecap="round"`
   - `stroke-linejoin="round"`
3. 在 `icon-helper.js` 中添加圖標定義（如果需要）
4. 使用 `.icon` class 包裝

## 示例

查看 `main-window.html` 中側邊欄按鈕的實現：

- Tutorial 按鈕：使用 `info.svg`
- Refresh 按鈕：使用 `refresh.svg`
- Chat 按鈕：使用 `chat.svg`
- 等等...

所有圖標都已內嵌，無需額外載入時間！
