const express = require('express');
const router = express.Router();
const controller = require('./../controller/homeController');
const { ensureAuthenticated } = require('./../middleware/auth');

router.get('/home', ensureAuthenticated, controller.page);
router.get('/customer/products', ensureAuthenticated, controller.showProducts);
// Route for product details page
router.get('/product/:id', ensureAuthenticated, controller.getProductDetails);
module.exports = router;