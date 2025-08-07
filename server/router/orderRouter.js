const express = require('express');
const router = express.Router();
const orderController = require('../controller/orderController');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');

router.post('/order/add', ensureAuthenticated, orderController.addOrder);
router.get('/get/transactions', ensureAdmin, orderController.getTransactions);

module.exports = router;
