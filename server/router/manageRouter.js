// manageRouter.js - CORRECTED
const express = require('express');
const router = express.Router();
const controller = require('./../controller/manageController');
const { ensureManager } = require('./../middleware/auth');

// Note: The 'controller.uploadImages' middleware is now added to handle file uploads.
// Note: Routes now include '/:id' where necessary to pass parameters to the controller.

router.post('/add/product', ensureManager, controller.uploadImages, controller.addProduct);
router.post('/edit/product/:id', ensureManager, controller.uploadImages, controller.editProduct);
router.post('/delete/product/:id', ensureManager, controller.deleteProduct);

// Updated routes to use ensureManager middleware and allow access to req.user.id in controller
router.get('/get/products', ensureManager, controller.getProducts);
router.get('/get/product/image/:id', ensureManager, controller.getProductImage);
router.get('/get/orders', ensureManager, controller.getOrders);

router.post('/update/status/:id', ensureManager, controller.updateOrderStatus);

// New route to get manager's assigned categories
router.get('/get/categories', ensureManager, controller.getCategories);

module.exports = router;
