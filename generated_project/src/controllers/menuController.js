const MenuItem = require('../models/MenuItem');

exports.addMenuItem = async (req, res, next) => {
  try {
    const { name, description, price, availability } = req.body;
    const menuItem = new MenuItem({ name, description, price, availability });
    await menuItem.save();
    res.status(201).send({ message: 'Menu item added', menuItemId: menuItem._id });
  } catch (error) {
    next(error);
  }
};

exports.updateMenuItem = async (req, res, next) => {
  try {
    const { id, name, description, price, availability } = req.body;
    const menuItem = await MenuItem.findByIdAndUpdate(id, { name, description, price, availability }, { new: true });
    if (!menuItem) {
      return res.status(404).send({ message: 'Menu item not found' });
    }
    res.send({ message: 'Menu item updated', menuItem });
  } catch (error) {
    next(error);
  }
};
