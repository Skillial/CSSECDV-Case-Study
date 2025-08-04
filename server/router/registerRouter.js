const express = require('express');
const router = express.Router();
const controller = require('./../controller/registerController');

router.get('/register', controller.page);
router.post('/register', controller.register);

module.exports = router;