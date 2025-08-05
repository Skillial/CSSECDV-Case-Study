const express = require('express');
const router = express.Router();
const controller = require('./../controller/profileController');
const { ensureAuthenticated } = require('./../middleware/auth');

router.get('/profile', ensureAuthenticated, controller.page);
router.post('/profile/edit', ensureAuthenticated, controller.editProfile); 
router.post('/password/change', ensureAuthenticated, controller.changePassword); 
router.post('/profile/question', ensureAuthenticated, controller.securityQuestion);
router.post('/profile/picture', ensureAuthenticated, controller.profilePicture);
router.get('/profile/image/:id', ensureAuthenticated, controller.getProfileImage);

module.exports = router;