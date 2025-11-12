// 應用程式入口點 - 必須包含完整的初始化邏輯
const express = require('express');
const bodyParser = require('body-parser');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// 中介軟體
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API 路由
app.use('/api', apiRoutes);

// 錯誤處理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
