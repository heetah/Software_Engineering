const express = require('express');
const userController = require('../controllers/userController');
const menuController = require('../controllers/menuController');
const orderController = require('../controllers/orderController');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// User routes
router.post('/users/register', userController.register);
router.post('/users/login', userController.login);

// Menu routes
router.post('/menu/add', menuController.addMenuItem);
router.put('/menu/update', menuController.updateMenuItem);

// Order routes
router.post('/orders/create', orderController.createOrder);
router.put('/orders/update', orderController.updateOrderStatus);

// Payment routes
router.post('/payment/initiate', paymentController.initiatePayment);
router.post('/payment/verify', paymentController.verifyPayment);

module.exports = router;
