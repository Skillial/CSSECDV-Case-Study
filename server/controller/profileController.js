// Import necessary modules
const { OccasioDB } = require('./../config/db'); // Adjust the path if your db.js is located elsewhere.
const bcrypt = require('bcrypt');
const { hashString } = require('./../config/hash');
const multer = require('multer'); // For handling multipart/form-data (file uploads)
const path = require('path');     // For working with file and directory paths (needed for default image fallback)
const fs = require('fs');         // For file system operations (needed for default image fallback)


// --- Database Prepared Statements ---
// These prepared statements are defined once for efficiency.
// Ensure these statements are initialized when your database is set up (e.g., in your `db.js` file).
const updateProfileImageBlobStmt = OccasioDB.prepare('UPDATE accounts SET profile_image_blob = ?, profile_image_mimetype = ? WHERE id = ?');
// Modified getProfileImageBlobStmt to also be used in the 'page' function
const getProfileImageBlobStmt = OccasioDB.prepare('SELECT profile_image_blob, profile_image_mimetype FROM accounts WHERE id = ?');


// --- Multer Storage Configuration (Memory Storage) ---
// This defines that uploaded files will be stored in memory as a Buffer,
// making the binary data directly accessible via req.file.buffer.
const storage = multer.memoryStorage();

// --- Multer File Filter ---
// This function filters incoming files, allowing only image files to be uploaded.
// It checks the MIME type of the file.
const fileFilter = (req, file, cb) => {
    // Check if the MIME type starts with 'image/' (e.g., 'image/jpeg', 'image/png')
    if (file.mimetype.startsWith('image/')) {
        cb(null, true); // Accept the file
    } else {
        // Reject the file and provide an error message.
        cb(new Error('Only image files are allowed!'), false);
    }
};

// --- Multer Upload Middleware Instance ---
// This creates a multer instance with the defined memory storage and file filter.
// .single('profileImage') means it expects a single file upload with the field name 'profileImage'.
// It also sets a file size limit (5MB in this case).
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // Limit file size to 50MB
}).single('profileImage'); // 'profileImage' must match the 'name' attribute of your file input in profile.ejs


const controller = {

    // Renders the profile page, now fetching image BLOB data explicitly
    page: (req, res) => {
        let userProfileData = { ...req.user }; // Start with data from req.user

        // If user is logged in, try to fetch their profile image BLOB
        if (req.user && req.user.id) {
            try {
                const imageResult = getProfileImageBlobStmt.get(req.user.id);
                if (imageResult) {
                    userProfileData.profile_image_blob = imageResult.profile_image_blob;
                    userProfileData.profile_image_mimetype = imageResult.profile_image_mimetype;
                }
            } catch (error) {
                console.error("Error fetching profile image BLOB for page load:", error.message);
                // Continue rendering the page even if image fetch fails
            }
        }

        res.render('profile', {
            user: userProfileData, // Pass the augmented user data
            error_messages: res.locals.error_messages || [],
            success_messages: res.locals.success_messages || []
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
                updateStmt.run(address, userId);
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
                    throw new new Error('Failed to update password in accounts table.');
                }

                const insertHistoryStmt = OccasioDB.prepare('INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)');
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

    // --- Profile Picture Upload Controller Function ---
    // This asynchronous function handles the actual upload and database update for BLOB storage.
    profilePicture: async (req, res) => {
        // Wrap the multer upload process in a Promise-like structure to use async/await.
        upload(req, res, async (err) => {
            // --- Handle Multer Errors ---
            if (err instanceof multer.MulterError) {
                // Specific Multer errors (e.g., file size limit exceeded, wrong field name)
                console.error('Multer Error:', err.message);
                return res.status(400).json({ message: err.message });
            } else if (err) {
                // Other errors during the upload process (e.g., file filter rejection)
                console.error('Unknown upload error:', err.message);
                return res.status(400).json({ message: err.message });
            }

            // --- Check if a file was actually uploaded ---
            if (!req.file) {
                return res.status(400).json({ message: 'No image file provided.' });
            }

            // --- Authenticate User (Crucial Security Check) ---
            // This assumes Passport.js or similar authentication middleware has already run
            // and populated `req.user` with the authenticated user's data (including `id`).
            if (!req.user || !req.user.id) {
                console.error('Unauthorized attempt to upload profile picture: User not logged in or ID missing.');
                return res.status(401).json({ message: 'Unauthorized: Please log in to update your profile.' });
            }

            const userId = req.user.id;
            const imageBuffer = req.file.buffer; // The binary data of the uploaded image
            const imageMimeType = req.file.mimetype; // The MIME type of the uploaded image (e.g., 'image/jpeg')

            try {
                // --- Update Database ---
                // Execute the prepared statement to update the user's profile_image_blob and mimetype.
                updateProfileImageBlobStmt.run(imageBuffer, imageMimeType, userId);

                // --- Send Success Response ---
                // Respond to the frontend. We don't send back the BLOB directly in the JSON,
                // but rather indicate success. The frontend will then request the image via a new endpoint.
                res.status(200).json({
                    message: 'Profile picture uploaded successfully!',
                    // Optionally, if you want the frontend to immediately update without a full reload,
                    // you could send back a Base64 representation here, but it's generally better
                    // to have the frontend request the BLOB through the dedicated endpoint.
                    // For simplicity and direct BLOB usage, we'll rely on the new endpoint.
                });
            } catch (dbError) {
                // --- Handle Database Errors ---
                console.error('Database error updating profile image (BLOB):', dbError.message);
                res.status(500).json({ message: 'Failed to update profile picture in database. Please try again.' });
            }
        });
    },

    // --- Controller Function to Retrieve Profile Image BLOB ---
    // This new function will serve the BLOB image from the database to the browser.
    getProfileImage: (req, res) => {
        // This endpoint should be accessible without full authentication for public profiles,
        // but for a user's *own* profile, you might want to ensure req.user.id matches req.params.userId.
        // For simplicity, we'll assume the user ID is passed in the URL.
        const userId = req.params.id; // FIX: Changed from req.params.userId to req.params.id

        if (!userId) {
            return res.status(400).send('User ID is required.');
        }

        try {
            const result = getProfileImageBlobStmt.get(userId);

            if (result && result.profile_image_blob) {
                // Set the appropriate Content-Type header based on the stored MIME type
                res.setHeader('Content-Type', result.profile_image_mimetype || 'application/octet-stream');
                // Add Cache-Control headers to prevent caching of dynamic image data
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                // Send the binary data
                res.send(result.profile_image_blob);
            } else {
                // If no image is found, send a default placeholder image or a 404
                // For a placeholder, you could serve a static image file or a Base64 default.
                // Ensure you have a default image at 'public/images/default-user.png'
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
