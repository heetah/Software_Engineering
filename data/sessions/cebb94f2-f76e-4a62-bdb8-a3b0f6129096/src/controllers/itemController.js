// 控制器 - 處理業務邏輯
const Item = require('../models/itemModel');

// 獲取所有項目
const getItems = async () => {
    return await Item.find();
};

// 創建新項目
const createItem = async (itemData) => {
    const item = new Item(itemData);
    return await item.save();
};

module.exports = { getItems, createItem };
