const express = require('express');
const router = express.Router();
const controller = require('./../controller/homeController');
const { ensureAuthenticated } = require('./../middleware/auth');

router.get('/home', ensureAuthenticated, controller.home);

module.exports = router;