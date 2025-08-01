const express = require('express');
const router = express.Router();
const controller = require('./../controller/signupController');

router.get('/signup', controller.page);

module.exports = router;