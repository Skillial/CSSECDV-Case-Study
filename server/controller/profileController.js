// Import necessary modules
const { OccasioDB } = require('./../config/db');
const bcrypt = require('bcrypt');
const { hashString } = require('./../config/hash');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auditLogger } = require('./../middleware/auditLogger')

// --- Database Prepared Statements ---
const updateProfileImageBlobStmt = OccasioDB.prepare('UPDATE accounts SET profile_image_blob = ?, profile_image_mimetype = ? WHERE id = ?');
const getProfileImageBlobStmt = OccasioDB.prepare('SELECT profile_image_blob, profile_image_mimetype FROM accounts WHERE id = ?');

// --- Multer Configuration ---
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 }
}).single('profileImage');


const controller = {

    page: (req, res) => {
        let userProfileData = { ...req.user };
        try {
            const imageResult = getProfileImageBlobStmt.get(req.user.id);
            if (imageResult) {
                userProfileData.profile_image_blob = imageResult.profile_image_blob;
                userProfileData.profile_image_mimetype = imageResult.profile_image_mimetype;
            }
        } catch (error) {
            console.error("Error fetching profile image BLOB for page load:", error.message);
        }
        res.render('profile', {
            user: userProfileData,
            error_messages: res.locals.error_messages || [],
            success_messages: res.locals.success_messages || []
        });
    },

    editProfile: async (req, res) => {
        const { address } = req.body;
        const { id: userId, username } = req.user;
        const ip_address = req.ip;
        let errors = [];

        if (!address || address.trim() === '') {
            errors.push('Address is required.');
        } else if (address.length < 5 || address.length > 255) {
            errors.push('Address must be between 5 and 255 characters long.');
        }

        if (errors.length > 0) {
            auditLogger({ eventType: 'Input Validation', userId, username, ip_address, status: 'Failure', description: `Profile update failed. Reason: ${errors[0]}` });
            return res.status(400).json({ message: errors.join('<br>') });
        }

        try {
            const updateStmt = OccasioDB.prepare('UPDATE accounts SET address = ? WHERE id = ?');
            updateStmt.run(address, userId);
            req.user.address = address;

            auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Success', description: 'User successfully updated their profile address.' });
            res.status(200).json({ message: 'Profile updated successfully!' });

        } catch (error) {
            auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Failure', description: `Profile address update failed. Reason: ${error.message}` });
            console.error("Error updating profile:", error.message);
            res.status(500).json({ message: 'An unexpected error occurred while updating your profile.' });
        }
    },

    changePassword: async (req, res) => {
        const { oldPassword, newPassword } = req.body;
        const { id: userId, username } = req.user;
        const ip_address = req.ip;
        let errors = [];

        // --- Input validation ---
        if (!oldPassword || oldPassword.trim() === '') errors.push('Current password is required.');
        if (!newPassword || newPassword.trim() === '') errors.push('New password is required.');
        else if (newPassword.length < 8 || newPassword.length > 50) errors.push('New password must be between 8 and 50 characters long.');
        if (newPassword && !/[A-Z]/.test(newPassword)) errors.push('New password must contain an uppercase letter.');
        if (newPassword && !/[a-z]/.test(newPassword)) errors.push('New password must contain a lowercase letter.');
        if (newPassword && !/[0-9]/.test(newPassword)) errors.push('New password must contain a number.');
        if (newPassword && !/[!@#$%^&*]/.test(newPassword)) errors.push('New password must contain a special character (!@#$%^&*).');
        if (oldPassword === newPassword) errors.push('New password cannot be the same as your current password.');

        if (errors.length > 0) {
            auditLogger({ eventType: 'Input Validation', userId, username, ip_address, status: 'Failure', description: `Password change failed. Reason: ${errors[0]}` });
            return res.status(400).json({ message: errors.join('<br>') });
        }
        // --- End validation ---

        try {
            const hashedNewPassword = await hashString(newPassword);
            OccasioDB.transaction(() => {
                const user = OccasioDB.prepare('SELECT password_hash, last_password_change FROM accounts WHERE id = ?').get(userId);
                if (!user) throw new Error('User not found.');
                if (!bcrypt.compareSync(oldPassword, user.password_hash)) throw new Error('INVALID_OLD_PASSWORD');
                if (user.last_password_change) {
                    const diffInMs = new Date() - new Date(user.last_password_change);
                    if (diffInMs < 24 * 60 * 60 * 1000) throw new Error('PASSWORD_TOO_RECENT');
                }
                const history = OccasioDB.prepare('SELECT password_hash FROM password_history WHERE account_id = ? ORDER BY created_at DESC').all(userId);
                if (history.some(entry => bcrypt.compareSync(newPassword, entry.password_hash))) throw new Error('PASSWORD_IN_HISTORY');

                const currentTime = new Date().toISOString();
                OccasioDB.prepare('UPDATE accounts SET password_hash = ?, last_password_change = ? WHERE id = ?').run(hashedNewPassword, currentTime, userId);
                OccasioDB.prepare('INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)').run(userId, hashedNewPassword, currentTime);
            })();

            auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Success', description: 'User successfully changed their password.' });
            res.status(200).json({ message: 'Password changed successfully!' });

        } catch (error) {
            let logDescription = `Password change failed. Reason: ${error.message}`;
            let responseMessage = 'An unexpected error occurred while changing your password. Please try again.';
            let statusCode = 500;

            if (error.message === 'INVALID_OLD_PASSWORD') {
                logDescription = 'Password change failed. Reason: Incorrect current password provided.';
                statusCode = 400;
                responseMessage = 'Current password is incorrect.';
            } else if (error.message === 'PASSWORD_IN_HISTORY') {
                logDescription = 'Password change failed. Reason: Attempted to reuse a recent password.';
                statusCode = 400;
                responseMessage = 'New password cannot be one of your recently used passwords.';
            } else if (error.message === 'PASSWORD_TOO_RECENT') {
                logDescription = 'Password change failed. Reason: Attempted to change password too soon.';
                statusCode = 400;
                responseMessage = 'You must wait at least 1 day before changing your password again.';
            } else if (error.message === 'User not found.') {
                logDescription = 'Password change failed. Reason: User performing the action was not found in the database.';
                statusCode = 404;
                responseMessage = 'User not found.';
            }

            auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Failure', description: logDescription });
            console.error("Error changing password:", error.message);
            return res.status(statusCode).json({ message: responseMessage });
        }
    },

    securityQuestion: async (req, res) => {
        const { question, answer, currentPassword } = req.body;
        const { id: userId, username } = req.user;
        const ip_address = req.ip;
        let errors = [];

        // --- Validation ---
        if (!question || question.trim() === '') errors.push('Security question cannot be empty.');
        else if (question.length > 255) errors.push('Security question must be 255 characters or less.');
        if (!answer || answer.trim() === '') errors.push('Answer cannot be empty.');
        else if (answer.length > 100) errors.push('Answer must be 100 characters or less.');
        if (!currentPassword || currentPassword.trim() === '') errors.push('Current password is required.');

        if (errors.length > 0) {
            auditLogger({ eventType: 'Input Validation', userId, username, ip_address, status: 'Failure', description: `Security question update failed. Reason: ${errors[0]}` });
            return res.status(400).json({ message: errors.join('<br>') });
        }
        // --- End Validation ---

        try {
            const user = OccasioDB.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(userId);
            if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
                throw new Error('INVALID_CURRENT_PASSWORD');
            }

            const hashedAnswer = await hashString(answer);
            OccasioDB.transaction(() => {
                const existingQuestion = OccasioDB.prepare('SELECT id FROM security_questions WHERE account_id = ?').get(userId);
                if (existingQuestion) {
                    OccasioDB.prepare('UPDATE security_questions SET question_text = ?, answer_hash = ? WHERE account_id = ?').run(question, hashedAnswer, userId);
                } else {
                    OccasioDB.prepare('INSERT INTO security_questions (account_id, question_text, answer_hash) VALUES (?, ?, ?)').run(userId, question, hashedAnswer);
                }
            })();

            auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Success', description: 'User successfully updated their security question.' });
            res.status(200).json({ message: 'Security question updated successfully!' });

        } catch (error) {
            let logDescription = `Security question update failed. Reason: ${error.message}`;
            let responseMessage = 'An unexpected error occurred. Please try again.';
            let statusCode = 500;

            if (error.message === 'INVALID_CURRENT_PASSWORD') {
                logDescription = 'Security question update failed. Reason: Incorrect current password provided.';
                statusCode = 401;
                responseMessage = 'Incorrect current password. Please try again.';
            }

            auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Failure', description: logDescription });
            console.error("Error managing security question:", error.message);
            return res.status(statusCode).json({ message: responseMessage });
        }
    },

    profilePicture: async (req, res) => {
        upload(req, res, async (err) => {
            const { id: userId, username } = req.user || {};
            const ip_address = req.ip;

            if (err) {
                auditLogger({ eventType: 'Input Validation', userId, username, ip_address, status: 'Failure', description: `Profile picture upload failed. Reason: ${err.message}` });
                return res.status(400).json({ message: err.message });
            }
            if (!req.file) {
                auditLogger({ eventType: 'Input Validation', userId, username, ip_address, status: 'Failure', description: 'Profile picture upload failed. Reason: No file provided.' });
                return res.status(400).json({ message: 'No image file provided.' });
            }

            try {
                updateProfileImageBlobStmt.run(req.file.buffer, req.file.mimetype, userId);
                auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Success', description: 'User successfully uploaded a new profile picture.' });
                res.status(200).json({ message: 'Profile picture uploaded successfully!' });
            } catch (dbError) {
                auditLogger({ eventType: 'Account Management', userId, username, ip_address, status: 'Failure', description: `Profile picture upload failed. Reason: ${dbError.message}` });
                console.error('Database error updating profile image (BLOB):', dbError.message);
                res.status(500).json({ message: 'Failed to update profile picture in database. Please try again.' });
            }
        });
    },

    getProfileImage: (req, res) => {
        try {
            const result = getProfileImageBlobStmt.get(userId);
            if (result && result.profile_image_blob) {
                res.setHeader('Content-Type', result.profile_image_mimetype || 'application/octet-stream');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.send(result.profile_image_blob);
            } else {
                const defaultImagePath = path.join(__dirname, '../../public/images/default-user.png');
                if (fs.existsSync(defaultImagePath)) {
                    res.sendFile(defaultImagePath);
                } else {
                    res.status(404).send('Profile image not found.');
                }
            }
        } catch (dbError) {
            console.error('Database error retrieving profile image BLOB:', dbError.message);
            res.status(500).send('Failed to retrieve profile image.');
        }
    }
};

module.exports = controller;
