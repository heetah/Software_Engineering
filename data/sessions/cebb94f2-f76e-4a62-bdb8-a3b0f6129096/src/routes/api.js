// API 路由 - 必須包含完整的路由定義和錯誤處理
const express = require('express');
const router = express.Router();
const { getItems, createItem } = require('../controllers/itemController');

// 獲取所有項目
router.get('/items', async (req, res) => {
    try {
        const items = await getItems();
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching items', error });
    }
});

// 創建新項目
router.post('/items', async (req, res) => {
    try {
        const newItem = await createItem(req.body);
        res.status(201).json(newItem);
    } catch (error) {
        res.status(400).json({ message: 'Error creating item', error });
    }
});

module.exports = router;
