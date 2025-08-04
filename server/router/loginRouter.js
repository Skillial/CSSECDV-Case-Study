const express = require('express');
const router = express.Router();
const controller = require('./../controller/loginController');

router.get('/login', controller.page);
router.post('/login', controller.login);

module.exports = router;