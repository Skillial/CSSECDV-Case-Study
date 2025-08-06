const express = require('express');
const router = express.Router();
const controller = require('./../controller/loginController');
const { ensureAuthenticated, ensureUnauthenticated } = require('./../middleware/auth');

router.get('/login', ensureUnauthenticated, controller.page);
router.post('/login', ensureUnauthenticated, controller.login);
router.get('/logout', ensureAuthenticated, controller.logout);
router.get('/forget/password', ensureUnauthenticated, controller.forgetPassword);
router.post('/verify-details', ensureUnauthenticated, controller.verifyDetails);
router.post('/reset-password', ensureUnauthenticated, controller.resetPassword); // For the actual password reset

module.exports = router;