const passport = require('passport');
const { OccasioDB } = require('./../config/db');
const bcrypt = require('bcrypt');
const { hashString } = require('./../config/hash'); // Assuming you have a utility function for hashing passwords
const controller = {

    // Renders the login page
    page: (req, res) => {
        // Retrieve flash messages from res.locals, which were set by app.js middleware
        const errorMessages = res.locals.error_messages || [];
        const successMessages = res.locals.success_messages || [];

        // Pass only the first error message (if any) to the template
        // Pass all success messages (if any) as they might come from registration success
        res.render("login", {
            error_messages: errorMessages.length > 0 ? [errorMessages[0]] : [],
            success_messages: successMessages
        });
    },

    // Handles user login attempt
    login: (req, res, next) => {
        const { username, password } = req.body;
        let errors = [];

        // --- Server-side Input Validation for Login ---
        // Validate username length
        if (username.length < 3 || username.length > 20) {
            errors.push('Username must be between 3 and 20 characters long.');
        }

        // Validate password length
        if (password.length < 8 || password.length > 50) {
            errors.push('Password must be between 8 and 50 characters long.');
        }

        if (errors.length > 0) {
            req.flash('error', errors[0]); // Flash only the first error message
            return req.session.save(() => { // Save session before redirect to ensure flash message is persisted
                res.redirect('/login');
            });
        }
        // --- End Server-side Input Validation for Login ---

        passport.authenticate('local', (err, user, info) => {
            if (err) return next(err);
            if (!user) {
                // Set the flash message for authentication failure
                req.flash('error', info.message || 'Authentication failed');
                // Manually save session before redirect to ensure flash message is persisted
                return req.session.save(() => {
                    res.redirect('/login');
                });
            }

            req.logIn(user, async (err) => {
                if (err) return next(err);

                // ✅ Now this will work, because _lastLoginReportMessage exists
                req.session.lastLoginReport = user._lastLoginReportMessage;

                req.session.save(() => {
                    console.log(`session: ${JSON.stringify(req.session)}`);
                    res.redirect('/home');
                });
            });
        })(req, res, next);
    },

    // Handles user logout
    logout: (req, res, next) => {
        req.logout((err) => { // Passport.js logout method
            if (err) {
                return next(err);
            }
            req.flash('success', 'You are logged out.'); // Optional: Flash a logout success message
            res.redirect('/login'); // Redirect to login page after logout
        });
    },

    forgetPassword: (req, res) => {
        // Render the forget password page
        res.render("forgetpassword", {
            error_messages: res.locals.error_messages || [],
            success_messages: res.locals.success_messages || []
        });
    },
    verifyDetails: async (req, res) => {
        const { username, question, answer } = req.body;
        let errors = [];

        // Input validation with length checks
        if (!username || username.trim() === '') {
            errors.push('Username is required.');
        } else if (username.length < 3 || username.length > 20) {
            errors.push('Username must be between 3 and 20 characters long.');
        }

        if (!question || question.trim() === '') {
            errors.push('Security question is required.');
        } else if (question.length < 1 || question.length > 255) { // Assuming question text can be longer
            errors.push('Security question must be between 1 and 255 characters long.');
        }

        if (!answer || answer.trim() === '') {
            errors.push('Answer is required.');
        } else if (answer.length < 1 || answer.length > 100) {
            errors.push('Answer must be between 1 and 100 characters long.');
        }

        if (errors.length > 0) {
            // For security, even for direct input validation errors, we return a generic message.
            return res.status(400).json({ message: 'Could not verify your details. Please try again.' });
        }

        try {
            // 1. Find the user by username in the accounts table
            const getUserStmt = OccasioDB.prepare('SELECT id, username, password_hash FROM accounts WHERE username = ?');
            const user = getUserStmt.get(username);

            // If user not found, return generic error for security
            if (!user) {
                console.warn(`Attempted verification for non-existent username: ${username}`);
                return res.status(404).json({ message: 'Could not verify your details. Please try again.' });
            }

            // 2. Find the security question for this user
            const getSecurityQuestionStmt = OccasioDB.prepare('SELECT question_text, answer_hash FROM security_questions WHERE account_id = ?');
            const securityQuestion = getSecurityQuestionStmt.get(user.id);

            // If no security question is set for this user, return generic error
            if (!securityQuestion) {
                console.warn(`User '${username}' exists but has no security question set.`);
                return res.status(404).json({ message: 'Could not verify your details. Please try again.' });
            }

            // 3. Compare the provided question text and hashed answer with the stored ones
            const isQuestionMatch = question === securityQuestion.question_text;
            // FIX: Use bcrypt.compareSync to compare the plain-text answer with the stored hash
            const isAnswerMatch = bcrypt.compareSync(answer, securityQuestion.answer_hash);

            console.log(`Verification for user '${username}': Question match: ${isQuestionMatch}, Answer match: ${isAnswerMatch}`);
            console.log(`Provided Answer (plain): ${answer}, Stored Answer Hash: ${securityQuestion.answer_hash}`);


            if (isQuestionMatch && isAnswerMatch) {
                // All details match, verification successful
                // In a real application, you might generate a temporary token here
                // that allows the user to proceed to the password reset step.
                // For this example, we'll just indicate success.
                return res.status(200).json({ message: 'Details verified successfully. Proceed to password reset.' });
            } else {
                // If either question or answer (or both) don't match, return generic error
                console.warn(`Verification failed for user '${username}'. Question match: ${isQuestionMatch}, Answer match: ${isAnswerMatch}`);
                return res.status(400).json({ message: 'Could not verify your details. Please try again.' });
            }

        } catch (error) {
            console.error('Error during forgot password verification:', error.message);
            return res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
        }
    },

    /**
     * Handles the actual password reset after successful verification.
     * Expected req.body: { username: string, newPassword: string }
     * This function should only be called after a successful call to verifyDetails
     * and ideally with a token to prevent direct access.
     */
    resetPassword: async (req, res) => {
        const { username, newPassword } = req.body; // In a real app, this would also include a verification token
        let errors = [];

        // Input validation for username
        if (!username || username.trim() === '') {
            errors.push('Username is required.');
        } else if (username.length < 3 || username.length > 20) {
            errors.push('Username must be between 3 and 20 characters long.');
        }

        // Input validation for new password
        if (!newPassword || newPassword.trim() === '') {
            errors.push('New password is required.');
        } else if (newPassword.length < 8 || newPassword.length > 50) { // Consistent with frontend
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
            return res.status(400).json({ message: errors.join('<br>') });
        }

        try {
            // 1. Find the user by username
            // Modified to also select last_password_change for the age check
            const getUserStmt = OccasioDB.prepare('SELECT id, password_hash, last_password_change FROM accounts WHERE username = ?');
            const user = getUserStmt.get(username);

            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            // 2. Hash the new password
            const hashedNewPassword = await hashString(newPassword);

            // 3. Perform password reset operations in a transaction
            OccasioDB.transaction(() => {
                // Check if the new password is the same as the current one
                if (bcrypt.compareSync(newPassword, user.password_hash)) {
                    throw new Error('NEW_PASSWORD_SAME_AS_OLD');
                }

                // Enforce minimum password age of 1 day
                if (user.last_password_change) {
                    const lastChangeTime = new Date(user.last_password_change);
                    const now = new Date();
                    const diffInMs = now - lastChangeTime;
                    const oneDayInMs = 24 * 60 * 60 * 1000; // 1 day in milliseconds
                    if (diffInMs < oneDayInMs) {
                        throw new Error('PASSWORD_TOO_RECENT');
                    }
                }

                // Check if the new password has been used recently (e.g., last 5 passwords)
                const checkHistoryStmt = OccasioDB.prepare('SELECT password_hash FROM password_history WHERE account_id = ? ORDER BY created_at DESC LIMIT 5');
                const history = checkHistoryStmt.all(user.id);

                const isNewPasswordInHistory = history.some(entry =>
                    // Compare the new plain password with the hashed history entries
                    bcrypt.compareSync(newPassword, entry.password_hash)
                );

                if (isNewPasswordInHistory) {
                    throw new Error('PASSWORD_IN_HISTORY');
                }

                // Update the password in the accounts table
                const updateAccountStmt = OccasioDB.prepare('UPDATE accounts SET password_hash = ?, last_password_change = ?, login_attempts = 0, lockout_until = NULL WHERE id = ?');
                const currentTime = new Date().toISOString();
                const info = updateAccountStmt.run(hashedNewPassword, currentTime, user.id);

                if (info.changes === 0) {
                    throw new Error('Failed to update password in accounts table.');
                }

                // Add the new hashed password to the password history table
                const insertHistoryStmt = OccasioDB.prepare('INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)');
                insertHistoryStmt.run(user.id, hashedNewPassword, currentTime);
            })(); // Immediately invoke the transaction function

            res.status(200).json({ message: 'Your password has been reset successfully!' });

        } catch (error) {
            console.error('Error during password reset:', error.message);
            if (error.message === 'NEW_PASSWORD_SAME_AS_OLD') {
                return res.status(400).json({ message: 'New password cannot be the same as your current password.' });
            } else if (error.message === 'PASSWORD_IN_HISTORY') {
                return res.status(400).json({ message: 'New password cannot be one of your recently used passwords.' });
            } else if (error.message === 'PASSWORD_TOO_RECENT') { // Added new error handling
                return res.status(400).json({ message: 'You must wait at least 1 day before changing your password again.' });
            }
            return res.status(500).json({ message: 'An unexpected error occurred during password reset. Please try again.' });
        }
    }
};

module.exports = controller;
