const { OccasioDB } = require('./../config/db');
const { hashString } = require('./../config/hash');
const { auditLogger } = require('./../middleware/auditLogger')

const controller = {

    page: (req, res) => {
        const errorMessages = res.locals.error_messages || [];
        const successMessages = res.locals.success_messages || [];
        res.render("signup", {
            error_messages: errorMessages,
            success_messages: successMessages
        });
    },

    register: async (req, res) => {
        const { username, password, confirmPassword } = req.body;
        const ip_address = req.ip;
        let errors = [];

        if (!username || !password || !confirmPassword) errors.push('Please fill in all fields.');
        if (username && (username.length < 3 || username.length > 20)) errors.push('Username must be between 3 and 20 characters long.');
        if (password && password.length > 50) errors.push('Password cannot exceed 50 characters.');
        if (password !== confirmPassword) errors.push('Passwords do not match.');
        const passwordRegex = { length: /.{8,}/, uppercase: /[A-Z]/, lowercase: /[a-z]/, number: /[0-9]/, specialChar: /[!@#$%^&*]/ };
        if (!passwordRegex.length.test(password)) errors.push('Password must be at least 8 characters long.');
        if (!passwordRegex.uppercase.test(password)) errors.push('Password must contain an uppercase letter.');
        if (!passwordRegex.lowercase.test(password)) errors.push('Password must contain a lowercase letter.');
        if (!passwordRegex.number.test(password)) errors.push('Password must contain a number.');
        if (!passwordRegex.specialChar.test(password)) errors.push('Password must contain a special character (!@#$%^&*).');

        try {
            const existingUser = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
            if (existingUser) {
                errors.push('Registration failed. Please try again with different information.');
            }
        } catch (dbError) {
            console.error("Database check for existing user error:", dbError.message);
            errors.push('An unexpected database error occurred during registration.');
        }

        if (errors.length > 0) {
            auditLogger({ eventType: 'Input Validation', userId: null, username: username, ip_address, status: 'Failure', description: `User registration failed for '${username}'. Reason: ${errors[0]}` });
            req.flash('error', errors[0]);
            return res.redirect('/register');
        }

        try {
            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString();
            let newAccountId;

            OccasioDB.transaction(() => {
                const insertAccountStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at, address, profile_image_blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                const accountInfo = insertAccountStmt.run(username, hashedPassword, 'customer', 0, null, null, currentTime, currentTime, currentTime, null, null);
                newAccountId = accountInfo.lastInsertRowid;

                const insertPasswordHistoryStmt = OccasioDB.prepare('INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)');
                insertPasswordHistoryStmt.run(newAccountId, hashedPassword, currentTime);
            })();

            auditLogger({ eventType: 'Account Management', userId: newAccountId, username: username, ip_address, status: 'Success', description: `New customer account created successfully for '${username}'.` });
            req.flash('success', 'You are now registered and can log in!');
            res.redirect('/login');

        } catch (error) {
            auditLogger({ eventType: 'Account Management', userId: null, username: username, ip_address, status: 'Failure', description: `Customer account creation failed for '${username}'. Reason: ${error.message}` });
            console.error("Registration transaction error:", error.message);
            req.flash('error', 'An unexpected error occurred during registration.');
            res.redirect('/register');
        }
    },

    registerAdmin: async (req, res) => {
        const { username, password, confirmPassword } = req.body;
        const { id: adminId, username: adminUsername } = req.user;
        const ip_address = req.ip;
        let errors = [];

        if (!username || !password || !confirmPassword) errors.push('Please fill in all fields.');
        if (username && (username.length < 3 || username.length > 20)) errors.push('Username must be between 3 and 20 characters long.');
        if (password && password.length > 50) errors.push('Password cannot exceed 50 characters.');
        if (password !== confirmPassword) errors.push('Passwords do not match.');
        const passwordRegex = { length: /.{8,}/, uppercase: /[A-Z]/, lowercase: /[a-z]/, number: /[0-9]/, specialChar: /[!@#$%^&*]/ };
        if (!passwordRegex.length.test(password)) errors.push('Password must be at least 8 characters long.');
        if (!passwordRegex.uppercase.test(password)) errors.push('Password must contain an uppercase letter.');
        if (!passwordRegex.lowercase.test(password)) errors.push('Password must contain a lowercase letter.');
        if (!passwordRegex.number.test(password)) errors.push('Password must contain a number.');
        if (!passwordRegex.specialChar.test(password)) errors.push('Password must contain a special character (!@#$%^&*).');

        if (errors.length > 0) {
            auditLogger({ eventType: 'Input Validation', userId: adminId, username: adminUsername, ip_address, status: 'Failure', description: `Admin registration failed for '${username}'. Reason: ${errors[0]}` });
            return res.status(400).json({ message: errors.join('<br>') });
        }

        try {
            const existingUser = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
            if (existingUser) {
                throw new Error('Username already exists.');
            }

            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString();
            let newAdminId;

            OccasioDB.transaction(() => {
                const insertAccountStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at, address, profile_image_blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                const accountInfo = insertAccountStmt.run(username, hashedPassword, 'admin', 0, null, null, currentTime, currentTime, currentTime, null, null);
                newAdminId = accountInfo.lastInsertRowid;

                OccasioDB.prepare('INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)').run(newAdminId, hashedPassword, currentTime);
            })();

            auditLogger({ eventType: 'Account Management', userId: adminId, username: adminUsername, ip_address, status: 'Success', description: `Admin '${adminUsername}' successfully created a new admin account for '${username}'.` });
            res.status(200).json({ message: `Admin '${username}' registered successfully!` });

        } catch (error) {
            let logDescription = `Admin '${adminUsername}' failed to create admin account for '${username}'. Reason: ${error.message}`;
            if (error.message === 'Username already exists.') {
                logDescription = `Admin '${adminUsername}' failed to create admin account for '${username}'. Reason: Username already exists.`;
            }
            auditLogger({ eventType: 'Account Management', userId: adminId, username: adminUsername, ip_address, status: 'Failure', description: logDescription });
            console.error("Admin registration transaction error:", error.message);
            res.status(500).json({ message: 'An unexpected error occurred during admin registration.' });
        }
    },

    registerManager: async (req, res) => {
        const { username, password, confirmPassword } = req.body;
        const { id: adminId, username: adminUsername } = req.user;
        const ip_address = req.ip;
        let errors = [];

        if (!username || !password || !confirmPassword) errors.push('Please fill in all fields.');
        if (username && (username.length < 3 || username.length > 20)) errors.push('Username must be between 3 and 20 characters long.');
        if (password && password.length > 50) errors.push('Password cannot exceed 50 characters.');
        if (password !== confirmPassword) errors.push('Passwords do not match.');
        const passwordRegex = { length: /.{8,}/, uppercase: /[A-Z]/, lowercase: /[a-z]/, number: /[0-9]/, specialChar: /[!@#$%^&*]/ };
        if (!passwordRegex.length.test(password)) errors.push('Password must be at least 8 characters long.');
        if (!passwordRegex.uppercase.test(password)) errors.push('Password must contain an uppercase letter.');
        if (!passwordRegex.lowercase.test(password)) errors.push('Password must contain a lowercase letter.');
        if (!passwordRegex.number.test(password)) errors.push('Password must contain a number.');
        if (!passwordRegex.specialChar.test(password)) errors.push('Password must contain a special character (!@#$%^&*).');

        if (errors.length > 0) {
            auditLogger({ eventType: 'Input Validation', userId: adminId, username: adminUsername, ip_address, status: 'Failure', description: `Manager registration failed for '${username}'. Reason: ${errors[0]}` });
            return res.status(400).json({ message: errors.join('<br>') });
        }

        try {
            const existingUser = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
            if (existingUser) {
                throw new Error('Username already exists.');
            }

            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString();
            let newManagerId;

            OccasioDB.transaction(() => {
                const insertAccountStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at, address, profile_image_blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                const accountInfo = insertAccountStmt.run(username, hashedPassword, 'manager', 0, null, null, currentTime, currentTime, currentTime, null, null);
                newManagerId = accountInfo.lastInsertRowid;

                OccasioDB.prepare('INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)').run(newManagerId, hashedPassword, currentTime);
            })();

            auditLogger({ eventType: 'Account Management', userId: adminId, username: adminUsername, ip_address, status: 'Success', description: `Admin '${adminUsername}' successfully created a new manager account for '${username}'.` });
            res.status(200).json({ message: `Manager '${username}' registered successfully!` });

        } catch (error) {
            let logDescription = `Admin '${adminUsername}' failed to create manager account for '${username}'. Reason: ${error.message}`;
            if (error.message === 'Username already exists.') {
                logDescription = `Admin '${adminUsername}' failed to create manager account for '${username}'. Reason: Username already exists.`;
            }
            auditLogger({ eventType: 'Account Management', userId: adminId, username: adminUsername, ip_address, status: 'Failure', description: logDescription });
            console.error("Manager registration transaction error:", error.message);
            res.status(500).json({ message: 'An unexpected error occurred during manager registration.' });
        }
    },

    assignEmployee: (req, res) => {
        const { employeeId, assignedCategories } = req.body;
        const { id: adminId, username: adminUsername } = req.user;
        const ip_address = req.ip;

        if (!employeeId || !Array.isArray(assignedCategories)) {
            auditLogger({ eventType: 'Input Validation', userId: adminId, username: adminUsername, ip_address, status: 'Failure', description: `Employee assignment failed for employee ID ${employeeId}. Reason: Invalid request data.` });
            return res.status(400).json({ message: 'Invalid request: employeeId and assignedCategories array are required.' });
        }

        try {
            const employee = OccasioDB.prepare('SELECT username FROM accounts WHERE id = ?').get(employeeId);
            const employeeUsername = employee ? employee.username : `ID ${employeeId}`;

            OccasioDB.transaction(() => {
                OccasioDB.prepare('DELETE FROM employee_categories WHERE employee_id = ?').run(employeeId);
                const insertStmt = OccasioDB.prepare('INSERT INTO employee_categories (employee_id, category_name, created_at) VALUES (?, ?, ?)');
                const currentTime = new Date().toISOString();
                assignedCategories.forEach(category => {
                    insertStmt.run(employeeId, category, currentTime);
                });
            })();

            auditLogger({ eventType: 'Account Management', userId: adminId, username: adminUsername, ip_address, status: 'Success', description: `Admin '${adminUsername}' successfully updated category assignments for employee '${employeeUsername}'.` });
            res.status(200).json({ message: 'Employee assignments updated successfully.' });

        } catch (error) {
            auditLogger({ eventType: 'Account Management', userId: adminId, username: adminUsername, ip_address, status: 'Failure', description: `Employee assignment failed for employee ID ${employeeId}. Reason: ${error.message}` });
            console.error('Error updating employee assignments:', error.message);
            res.status(500).json({ message: 'An unexpected error occurred while updating assignments.' });
        }
    }
};

module.exports = controller;
