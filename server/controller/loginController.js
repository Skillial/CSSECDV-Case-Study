const passport = require('passport');
const { OccasioDB } = require('./../config/db');
const bcrypt = require('bcrypt');
const { hashString } = require('./../config/hash');
const { auditLogger } = require('./../middleware/auditLogger')


const controller = {

    page: (req, res) => {
        const errorMessages = res.locals.error_messages || [];
        const successMessages = res.locals.success_messages || [];
        res.render("login", {
            error_messages: errorMessages.length > 0 ? [errorMessages[0]] : [],
            success_messages: successMessages
        });
    },

    login: (req, res, next) => {
        const { username, password } = req.body;
        const ip_address = req.ip;
        let errors = [];

        if (username.length < 3 || username.length > 20) {
            errors.push('Username must be between 3 and 20 characters long.');
        }
        if (password.length < 8 || password.length > 50) {
            errors.push('Password must be between 8 and 50 characters long.');
        }

        if (errors.length > 0) {
            auditLogger({
                eventType: 'Input Validation',
                userId: null,
                username: username,
                ip_address: ip_address,
                status: 'Failure',
                description: `Login attempt failed due to invalid input: ${errors[0]}`
            });
            req.flash('error', errors[0]);
            return req.session.save(() => {
                res.redirect('/login');
            });
        }

        passport.authenticate('local', (err, user, info) => {
            if (err) return next(err);
            if (!user) {
                auditLogger({
                    eventType: 'Authentication',
                    userId: null,
                    username: username,
                    ip_address: ip_address,
                    status: 'Failure',
                    description: `Failed login attempt for username '${username}'. Reason: ${info.message}`
                });
                req.flash('error', info.message || 'Authentication failed');
                return req.session.save(() => {
                    res.redirect('/login');
                });
            }

            req.logIn(user, async (err) => {
                if (err) return next(err);

                auditLogger({
                    eventType: 'Authentication',
                    userId: user.id,
                    username: user.username,
                    ip_address: ip_address,
                    status: 'Success',
                    description: `User '${user.username}' successfully logged in.`
                });

                req.session.lastLoginReport = user._lastLoginReportMessage;
                req.session.save(() => {
                    res.redirect('/home');
                });
            });
        })(req, res, next);
    },

    logout: (req, res, next) => {
        const user = req.user;
        const ip_address = req.ip;

        req.logout((err) => {
            if (err) {
                return next(err);
            }

            if (user) {
                auditLogger({
                    eventType: 'Authentication',
                    userId: user.id,
                    username: user.username,
                    ip_address: ip_address,
                    status: 'Success',
                    description: `User '${user.username}' successfully logged out.`
                });
            }

            req.flash('success', 'You are logged out.');
            res.redirect('/login');
        });
    },

    forgetPassword: (req, res) => {
        res.render("forgetpassword", {
            error_messages: res.locals.error_messages || [],
            success_messages: res.locals.success_messages || []
        });
    },

    verifyDetails: async (req, res) => {
        const { username, question, answer } = req.body;
        const ip_address = req.ip;
        let errors = [];

        if (!username || username.trim() === '') {
            errors.push('Username is required.');
        } else if (username.length < 3 || username.length > 20) {
            errors.push('Username must be between 3 and 20 characters long.');
        }

        if (!question || question.trim() === '') {
            errors.push('Security question is required.');
        } else if (question.length < 1 || question.length > 255) {
            errors.push('Security question must be between 1 and 255 characters long.');
        }

        if (!answer || answer.trim() === '') {
            errors.push('Answer is required.');
        } else if (answer.length < 1 || answer.length > 100) {
            errors.push('Answer must be between 1 and 100 characters long.');
        }

        if (errors.length > 0) {
            auditLogger({
                eventType: 'Input Validation',
                userId: null,
                username: username,
                ip_address: ip_address,
                status: 'Failure',
                description: `Password recovery verification failed due to invalid input: ${errors[0]}`
            });
            return res.status(400).json({ message: 'Could not verify your details. Please try again.' });
        }

        try {
            const getUserStmt = OccasioDB.prepare('SELECT id, username FROM accounts WHERE username = ?');
            const user = getUserStmt.get(username);

            if (!user) {
                auditLogger({
                    eventType: 'Account Management',
                    userId: null,
                    username: username,
                    ip_address: ip_address,
                    status: 'Failure',
                    description: `Password recovery verification failed: username '${username}' does not exist.`
                });
                return res.status(404).json({ message: 'Could not verify your details. Please try again.' });
            }

            const getSecurityQuestionStmt = OccasioDB.prepare('SELECT question_text, answer_hash FROM security_questions WHERE account_id = ?');
            const securityQuestion = getSecurityQuestionStmt.get(user.id);

            if (!securityQuestion || question !== securityQuestion.question_text || !bcrypt.compareSync(answer, securityQuestion.answer_hash)) {
                auditLogger({
                    eventType: 'Account Management',
                    userId: user.id,
                    username: user.username,
                    ip_address: ip_address,
                    status: 'Failure',
                    description: `Password recovery verification failed for user '${user.username}'.`
                });
                return res.status(400).json({ message: 'Could not verify your details. Please try again.' });
            }

            auditLogger({
                eventType: 'Account Management',
                userId: user.id,
                username: user.username,
                ip_address: ip_address,
                status: 'Success',
                description: `Password recovery verification successful for user '${user.username}'.`
            });
            return res.status(200).json({ message: 'Details verified successfully. Proceed to password reset.' });

        } catch (error) {
            console.error('Error during forgot password verification:', error.message);
            return res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
        }
    },

    resetPassword: async (req, res) => {
        const { username, newPassword } = req.body;
        const ip_address = req.ip;
        let errors = [];

        if (!username || username.trim() === '') {
            errors.push('Username is required.');
        } else if (username.length < 3 || username.length > 20) {
            errors.push('Username must be between 3 and 20 characters long.');
        }

        if (!newPassword || newPassword.trim() === '') {
            errors.push('New password is required.');
        } else if (newPassword.length < 8 || newPassword.length > 50) {
            errors.push('New password must be between 8 and 50 characters long.');
        }
        if (newPassword && !/[A-Z]/.test(newPassword)) {
            errors.push('New password must contain an uppercase letter.');
        }
        if (newPassword && !/[a-z]/.test(newPassword)) {
            errors.push('New password must contain a lowercase letter.');
        }
        if (newPassword && !/[0-9]/.test(newPassword)) {
            errors.push('New password must contain a number.');
        }
        if (newPassword && !/[!@#$%^&*]/.test(newPassword)) {
            errors.push('New password must contain a special character (!@#$%^&*).');
        }

        if (errors.length > 0) {
            auditLogger({
                eventType: 'Input Validation',
                userId: null,
                username: username,
                ip_address: ip_address,
                status: 'Failure',
                description: `Password reset failed due to invalid input: ${errors.join(' ')}`
            });
            return res.status(400).json({ message: errors.join('<br>') });
        }

        try {
            const getUserStmt = OccasioDB.prepare('SELECT id, password_hash, last_password_change FROM accounts WHERE username = ?');
            const user = getUserStmt.get(username);

            if (!user) {
                auditLogger({
                    eventType: 'Account Management',
                    userId: null,
                    username: username,
                    ip_address: ip_address,
                    status: 'Failure',
                    description: `Password reset failed: user '${username}' not found.`
                });
                return res.status(404).json({ message: 'User not found.' });
            }

            const hashedNewPassword = await hashString(newPassword);

            OccasioDB.transaction(() => {
                if (bcrypt.compareSync(newPassword, user.password_hash)) {
                    throw new Error('NEW_PASSWORD_SAME_AS_OLD');
                }

                if (user.last_password_change) {
                    const lastChangeTime = new Date(user.last_password_change);
                    const now = new Date();
                    const diffInMs = now - lastChangeTime;
                    const oneDayInMs = 24 * 60 * 60 * 1000;
                    if (diffInMs < oneDayInMs) {
                        throw new Error('PASSWORD_TOO_RECENT');
                    }
                }

                const checkHistoryStmt = OccasioDB.prepare('SELECT password_hash FROM password_history WHERE account_id = ? ORDER BY created_at DESC LIMIT 5');
                const history = checkHistoryStmt.all(user.id);

                const isNewPasswordInHistory = history.some(entry =>
                    bcrypt.compareSync(newPassword, entry.password_hash)
                );

                if (isNewPasswordInHistory) {
                    throw new Error('PASSWORD_IN_HISTORY');
                }

                const updateAccountStmt = OccasioDB.prepare('UPDATE accounts SET password_hash = ?, last_password_change = ?, login_attempts = 0, lockout_until = NULL WHERE id = ?');
                const currentTime = new Date().toISOString();
                updateAccountStmt.run(hashedNewPassword, currentTime, user.id);

                const insertHistoryStmt = OccasioDB.prepare('INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)');
                insertHistoryStmt.run(user.id, hashedNewPassword, currentTime);
            })();

            auditLogger({
                eventType: 'Account Management',
                userId: user.id,
                username: user.username,
                ip_address: ip_address,
                status: 'Success',
                description: `User '${user.username}' successfully reset their password.`
            });

            res.status(200).json({ message: 'Your password has been reset successfully!' });

        } catch (error) {
            const userForLog = { id: null, username: username };
            try {
                const userLookup = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
                if (userLookup) userForLog.id = userLookup.id;
            } catch (e) { }

            let description = `Password reset failed for user '${username}'. Reason: An unexpected error occurred.`;
            if (error.message === 'NEW_PASSWORD_SAME_AS_OLD') {
                description = `Password reset failed for user '${username}'. Reason: New password was the same as the old one.`;
            } else if (error.message === 'PASSWORD_IN_HISTORY') {
                description = `Password reset failed for user '${username}'. Reason: New password was found in recent history.`;
            } else if (error.message === 'PASSWORD_TOO_RECENT') {
                description = `Password reset failed for user '${username}'. Reason: Attempted to change password too soon.`;
            }

            auditLogger({
                eventType: 'Account Management',
                userId: userForLog.id,
                username: userForLog.username,
                ip_address: ip_address,
                status: 'Failure',
                description: description
            });

            if (error.message === 'NEW_PASSWORD_SAME_AS_OLD') {
                return res.status(400).json({ message: 'New password cannot be the same as your current password.' });
            } else if (error.message === 'PASSWORD_IN_HISTORY') {
                return res.status(400).json({ message: 'New password cannot be one of your recently used passwords.' });
            } else if (error.message === 'PASSWORD_TOO_RECENT') {
                return res.status(400).json({ message: 'You must wait at least 1 day before changing your password again.' });
            }
            return res.status(500).json({ message: 'An unexpected error occurred during password reset. Please try again.' });
        }
    }
};

module.exports = controller;
