const fs = require('fs');
const path = require('path');

// Keep coder outputs inside coder-agent folder so vision-agent outputs remain separate
const OUTPUTS = path.resolve(__dirname, 'outputs');

function safeWriteJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function persistResult(result, source_request_id) {
  const ts = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  const coderDir = path.join(OUTPUTS, `coder-${ts}`);
  fs.mkdirSync(coderDir, { recursive: true });
  
  // Write actual files if they exist in result.files
  if (result.files && Array.isArray(result.files)) {
    for (const file of result.files) {
      if (file.path && file.template) {
        const filePath = path.join(coderDir, file.path);
        const fileDir = path.dirname(filePath);
        
        // Create subdirectories if needed
        if (fileDir !== coderDir) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        
        // Write the actual file with UTF-8 encoding
        fs.writeFileSync(filePath, file.template, { encoding: 'utf8' });
      }
    }
  }
  
  safeWriteJson(path.join(coderDir, 'result.json'), result);
  safeWriteJson(path.join(coderDir, 'meta.json'), { created_at: new Date().toISOString(), source_request_id: source_request_id || null });
  
  // Generate status.html for easier viewing in dashboard
  let html = '<!doctype html><html><head><meta charset="utf-8"><title>Coder Result</title>';
  html += '<style>body{font-family:sans-serif;margin:20px;background:#f9f9f9;}table{border-collapse:collapse;width:100%;max-width:800px;}';
  html += 'td{padding:8px;}pre{background:#f5f5f5;padding:10px;border:1px solid #ccc;white-space:pre-wrap;word-wrap:break-word;overflow-x:auto;}';
  html += '.file-list{list-style:none;padding:0;}.file-list li{padding:8px;margin:5px 0;background:#fff;border:1px solid #ddd;border-radius:4px;}';
  html += '.file-list a{text-decoration:none;color:#0066cc;font-weight:bold;}.success{color:#28a745;}</style>';
  html += '</head><body>';
  html += '<h1>Coder Analysis Result</h1>';
  html += '<p><a href="/outputs">← Back to Dashboard</a></p>';
  html += '<h2>Summary</h2>';
  html += '<table border="1" cellpadding="5" cellspacing="0">';
  html += `<tr><td><b>Request ID</b></td><td>${result.request_id || 'N/A'}</td></tr>`;
  html += `<tr><td><b>Received At</b></td><td>${result.received_at || 'N/A'}</td></tr>`;
  html += `<tr><td><b>Suggested Action</b></td><td><b>${result.suggested_action || 'N/A'}</b></td></tr>`;
  html += '</table>';
  
  // Show generated files
  if (result.files && Array.isArray(result.files) && result.files.length > 0) {
    html += '<h2 class="success">✓ Generated Files (' + result.files.length + ')</h2>';
    html += '<ul class="file-list">';
    for (const file of result.files) {
      html += `<li>📄 <a href="${file.path}" target="_blank">${file.path}</a> <span style="color:#666;">(${Buffer.byteLength(file.template || '', 'utf8')} bytes)</span></li>`;
    }
    html += '</ul>';
  }
  
  if (result.notes && result.notes.length > 0) {
    html += '<h2>Notes</h2><ul>';
    for (const note of result.notes) {
      html += `<li>${note}</li>`;
    }
    html += '</ul>';
  }
  
  html += '<hr><p><a href="result.json">View result.json</a> | <a href="meta.json">View meta.json</a></p>';
  html += '</body></html>';
  
  fs.writeFileSync(path.join(coderDir, 'status.html'), html, { encoding: 'utf8' });
  
  return coderDir;
}

module.exports = { persistResult };
