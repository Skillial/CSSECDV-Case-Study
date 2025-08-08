const express = require('express');
const router = express.Router();
const controller = require('./../controller/registerController');
const { ensureAdmin, ensureUnauthenticated } = require('./../middleware/auth');

router.get('/register', ensureUnauthenticated, controller.page);
router.post('/register', ensureUnauthenticated, controller.register);
router.post('/register/admin', ensureAdmin, controller.registerAdmin);
router.post('/register/manager', ensureAdmin, controller.registerManager);
router.post('/employee/assign', ensureAdmin, controller.assignEmployee);

module.exports = router;