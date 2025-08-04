const { OccasioDB } = require('./../config/db');
const bcrypt = require('bcrypt');
const { hashString } = require('./../config/hash');

const controller = {

    page: (req, res) => {
        res.render('profile', {
            user: req.user
        });
    },

    editProfile: async (req, res) => {


        const { address } = req.body;
        const userId = req.user.id;


        try {
            // Start a database transaction for atomicity
            const updateTransaction = OccasioDB.transaction(() => {
                // Prepare the UPDATE statement to only update the address
                const updateStmt = OccasioDB.prepare(
                    'UPDATE accounts SET address = ? WHERE id = ?'
                );

                // Execute the update
                const info = updateStmt.run(address, userId);
                console.log(info)
            });

            // Execute the transaction
            updateTransaction();

            // If transaction is successful, update req.user to reflect the new address
            req.user.address = address; // Update the session user object

            req.flash('success', 'Profile updated successfully!');
            res.redirect('/profile');

        } catch (error) {
            console.error("Error updating profile:", error.message);
            req.flash('error', 'An unexpected error occurred while updating your profile.');
            res.redirect('/profile');
        }
    },

    changePassword: async (req, res) => {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user.id;

        let errors = [];

        // Input validation
        if (!oldPassword || !newPassword) {
            errors.push('Both current and new password are required.');
        }
        if (newPassword && newPassword.length < 8) {
            errors.push('New password must be at least 8 characters long.');
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
        if (oldPassword === newPassword) {
            errors.push('New password cannot be the same as your current password.');
        }

        if (errors.length > 0) {
            return res.status(400).json({ message: errors.join('<br>') });
        }

        try {
            const hashedNewPassword = await hashString(newPassword);

            const changePasswordTransaction = OccasioDB.transaction(() => {
                const getUserStmt = OccasioDB.prepare('SELECT password_hash, last_password_change FROM accounts WHERE id = ?');
                const user = getUserStmt.get(userId);

                if (!user) {
                    throw new Error('User not found.');
                }

                const isMatch = bcrypt.compareSync(oldPassword, user.password_hash);
                if (!isMatch) {
                    throw new Error('INVALID_OLD_PASSWORD');
                }

                // Enforce minimum password age of 1 day
                if (user.last_password_change) {
                    const lastChangeTime = new Date(user.last_password_change);
                    const now = new Date();
                    const diffInMs = now - lastChangeTime;
                    const oneDayInMs = 24 * 60 * 60 * 1000;
                    if (diffInMs < oneDayInMs) {
                        throw new Error('PASSWORD_TOO_RECENT');
                    }
                }

                const checkHistoryStmt = OccasioDB.prepare('SELECT password_hash FROM password_history WHERE account_id = ?');
                const history = checkHistoryStmt.all(userId);
                const isNewPasswordInHistory = history.some(entry =>
                    bcrypt.compareSync(newPassword, entry.password_hash)
                );
                if (isNewPasswordInHistory) {
                    throw new Error('PASSWORD_IN_HISTORY');
                }

                const currentTime = new Date().toISOString();
                const updateAccountStmt = OccasioDB.prepare('UPDATE accounts SET password_hash = ?, last_password_change = ? WHERE id = ?');
                const updateInfo = updateAccountStmt.run(hashedNewPassword, currentTime, userId);

                if (updateInfo.changes === 0) {
                    throw new Error('Failed to update password in accounts table.');
                }

                const insertHistoryStmt = OccasioDB.prepare('INSERT INTO password_history (user_id, password_hash, changed_at) VALUES (?, ?, ?)');
                insertHistoryStmt.run(userId, hashedNewPassword, currentTime);
            });

            changePasswordTransaction();

            res.status(200).json({ message: 'Password changed successfully!' });

        } catch (error) {
            console.error("Error changing password:", error.message);
            if (error.message === 'INVALID_OLD_PASSWORD') {
                return res.status(400).json({ message: 'Current password is incorrect.' });
            } else if (error.message === 'PASSWORD_IN_HISTORY') {
                return res.status(400).json({ message: 'New password cannot be one of your recently used passwords.' });
            } else if (error.message === 'PASSWORD_TOO_RECENT') {
                return res.status(400).json({ message: 'You must wait at least 1 day before changing your password again.' });
            } else if (error.message === 'User not found.') {
                return res.status(404).json({ message: 'User not found.' });
            } else {
                return res.status(500).json({ message: 'An unexpected error occurred while changing your password. Please try again.' });
            }
        }
    },
    securityQuestion: async (req, res) => {

        const { question, answer, currentPassword } = req.body;
        const userId = req.user.id; // Get the ID of the currently logged-in user

        let errors = [];

        // 2. Server-side Input Validation
        if (!question || question.trim() === '') {
            errors.push('Security question cannot be empty.');
        }
        if (!answer || answer.trim() === '') {
            errors.push('Answer to security question cannot be empty.');
        }
        if (!currentPassword || currentPassword.trim() === '') {
            errors.push('Current password is required to confirm changes.');
        }

        if (errors.length > 0) {
            return res.status(400).json({ message: errors.join('<br>') });
        }

        try {
            // Verify the user's current password for authorization
            const getUserStmt = OccasioDB.prepare('SELECT password_hash FROM accounts WHERE id = ?');
            const user = getUserStmt.get(userId);

            if (!user || typeof user.password_hash !== 'string') {
                throw new Error('User or current password hash not found or invalid.');
            }

            const isPasswordMatch = bcrypt.compareSync(currentPassword, user.password_hash);
            if (!isPasswordMatch) {
                throw new Error('INVALID_CURRENT_PASSWORD'); // Custom error for incorrect password
            }

            // Hash the security answer
            const hashedAnswer = await hashString(answer); // Await the asynchronous hashing

            // Perform database operations within a transaction
            OccasioDB.transaction(() => {
                // Your table schema does not include created_at/updated_at, so they are removed from queries.
                // If you intend to use them, please update your CREATE TABLE statement.

                // Check if a security question already exists for this user (using account_id which is UNIQUE)
                const checkExistingStmt = OccasioDB.prepare('SELECT id FROM security_questions WHERE account_id = ?');
                const existingQuestion = checkExistingStmt.get(userId);

                if (existingQuestion) {
                    // Update existing security question
                    const updateStmt = OccasioDB.prepare(
                        'UPDATE security_questions SET question_text = ?, answer_hash = ? WHERE account_id = ?'
                    );
                    const info = updateStmt.run(question, hashedAnswer, userId); // Removed existingQuestion.id as account_id is unique
                    if (info.changes === 0) {
                        throw new Error('Failed to update existing security question.');
                    }
                } else {
                    // Insert new security question
                    const insertStmt = OccasioDB.prepare(
                        'INSERT INTO security_questions (account_id, question_text, answer_hash) VALUES (?, ?, ?)'
                    );
                    const info = insertStmt.run(userId, question, hashedAnswer);
                    if (info.changes === 0) {
                        throw new Error('Failed to insert new security question.');
                    }
                }
            })(); // Immediately invoke the transaction function

            res.status(200).json({ message: 'Security question updated successfully!' });

        } catch (error) {
            console.error("Error managing security question:", error.message);
            if (error.message === 'INVALID_CURRENT_PASSWORD') {
                return res.status(401).json({ message: 'Incorrect current password. Please try again.' });
            } else if (error.message === 'User or current password hash not found or invalid.') {
                return res.status(404).json({ message: 'User profile data is incomplete or corrupted.' });
            } else {
                return res.status(500).json({ message: 'An unexpected error occurred while updating security questions. Please try again.' });
            }
        }
    },


};

module.exports = controller;
