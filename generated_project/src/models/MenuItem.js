const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  availability: { type: Boolean, required: true, default: true }
});

module.exports = mongoose.model('MenuItem', menuItemSchema);
