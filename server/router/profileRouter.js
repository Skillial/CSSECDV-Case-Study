const express = require('express');
const router = express.Router();
const controller = require('./../controller/profileController');
const { ensureAuthenticated } = require('./../middleware/auth');

router.get('/profile', ensureAuthenticated, controller.page);
router.post('/profile/edit', ensureAuthenticated, controller.editProfile); 
router.post('/password/change', ensureAuthenticated, controller.changePassword); 
router.post('/profile/question', ensureAuthenticated, controller.securityQuestion); // New endpoint for security questions
router.post('/profile/picture', ensureAuthenticated, controller.profilePicture); // New endpoint for profile picture upload
router.get('/profile/image/:id', ensureAuthenticated, controller.getProfileImage); // New endpoint for serving profile images
module.exports = router;