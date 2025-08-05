const express = require('express');
const router = express.Router();
const controller = require('./../controller/manageController');
const { ensureManager } = require('./../middleware/auth');

router.post('/add/product', ensureManager, controller.uploadImages, controller.addProduct);
router.post('/edit/product/:id', ensureManager, controller.uploadImages, controller.editProduct);
router.post('/delete/product/:id', ensureManager, controller.deleteProduct);
router.get('/get/products', ensureManager, controller.getProducts);
router.get('/get/product/image/:id', ensureManager, controller.getProductImage);
router.get('/get/orders', ensureManager, controller.getOrders);
router.post('/update/status/:id', ensureManager, controller.updateOrderStatus);
router.get('/get/categories', ensureManager, controller.getCategories);

module.exports = router;
