// server/router/orderRouter.js
const express = require('express');
const router = express.Router();
const orderController = require('../controller/orderController');
const { ensureAuthenticated } = require('../middleware/auth'); // Assuming your auth middleware is here

// Route to add a new order
router.post('/order/add', ensureAuthenticated, orderController.addOrder);

module.exports = router;
