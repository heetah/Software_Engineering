import fs from "fs";
import path from "path";

/**
 * 解析帶有 `<!-- file: path -->` 的 Markdown，並將每個 code block 落地為檔案。
 */
export function writeProjectFromMarkdown(markdown, outDir = "./generated_project") {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error("無效的 Coder 輸出，無法生成專案");
  }

  const fileBlocks = [];
  // 支援三種標記：HTML 註解、YAML front-matter 風格、純行首標記
  const patterns = [
    /<!--\s*file:\s*([^>]+)\s*-->/g,
    /^#\s*file:\s*(.+)$/gm,
    /^\/\/\s*file:\s*(.+)$/gm
  ];

  let match;
  patterns.forEach(re => {
    while ((match = re.exec(markdown)) !== null) {
      const filePath = match[1].trim();
      const startIndex = match.index + match[0].length;
      const codeFenceStart = markdown.indexOf("```", startIndex);
      if (codeFenceStart === -1) continue;
      const codeFenceEnd = markdown.indexOf("```", codeFenceStart + 3);
      if (codeFenceEnd === -1) continue;
      const firstLineEnd = markdown.indexOf("\n", codeFenceStart + 3);
      const contentStart = firstLineEnd === -1 ? codeFenceStart + 3 : firstLineEnd + 1;
      const content = markdown.slice(contentStart, codeFenceEnd);
      fileBlocks.push({ filePath, content });
    }
  });

  if (fileBlocks.length === 0) {
    // 建立最小可執行專案作為 fallback
    fs.mkdirSync(outDir, { recursive: true });
    const pkg = {
      name: "generated-app",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        start: "node src/index.js"
      }
    };
    fs.mkdirSync(path.join(outDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify(pkg, null, 2));
    fs.writeFileSync(path.join(outDir, "src/index.js"), "console.log('Hello from generated project');\n");
    return { outDir, files: [path.join(outDir, "package.json"), path.join(outDir, "src/index.js")] };
  }

  fs.mkdirSync(outDir, { recursive: true });

  fileBlocks.forEach(({ filePath, content }) => {
    const absPath = path.join(outDir, filePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf8");
  });

  return {
    outDir,
    files: fileBlocks.map(b => path.join(outDir, b.filePath))
  };
}


