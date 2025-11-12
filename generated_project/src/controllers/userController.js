const User = require('../models/User');

exports.register = async (req, res, next) => {
  try {
    const { username, password, email, role } = req.body;
    const user = new User({ username, password, email, role });
    await user.save();
    res.status(201).send({ message: 'User registered', userId: user._id });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(401).send({ message: 'Authentication failed' });
    }
    // Simulate token generation
    res.send({ token: `fake-jwt-token-for-${user._id}` });
  } catch (error) {
    next(error);
  }
};
