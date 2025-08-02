// passport-config.js (or similar file)

const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose(); // Import sqlite3
const path = require('path'); // Import path for database path

// Establish database connection (assuming accounts.db is in the same directory)
const dbPath = path.resolve(__dirname, 'accounts.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database in passport-config:', err.message);
  } else {
    console.log('Passport-config connected to SQLite database.');
  }
});

module.exports = function (passport) {

    // Helper function to get account by username (returns a Promise)
    // This makes database operations asynchronous and easier to manage with async/await
    function getAccountByUsername(username) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM accounts WHERE username = ?', [username], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row);
            });
        });
    }

    // Helper function to get account by ID (returns a Promise)
    function getAccountById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM accounts WHERE id = ?', [id], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row);
            });
        });
    }

    // Configure the LocalStrategy for username/password authentication
    passport.use(new LocalStrategy(
        { usernameField: 'username', passReqToCallback: true }, // 'usernameField' matches your schema, 'passReqToCallback' allows access to req
        async (req, username, password, done) => { // Added 'req' parameter
            try {
                const user = await getAccountByUsername(username);

                // --- Vague Error Message & User Not Found Handling ---
                if (!user) {
                    // Update last login attempt for non-existent user (optional, for logging/auditing)
                    db.run('UPDATE accounts SET last_login_attempt = ? WHERE username = ?', [new Date().toISOString(), username]);
                    return done(null, false, { message: 'Invalid username and/or password' });
                }

                // --- Account Lockout Logic ---
                if (user.lockout_until) {
                    const lockoutTimestamp = new Date(user.lockout_until);
                    const currentTime = new Date();

                    if (lockoutTimestamp > currentTime) {
                        // Account is still locked
                        return done(null, false, { message: 'Invalid username and/or password' }); // Vague message
                    } else {
                        // Lockout period has expired, reset lockout status
                        db.run('UPDATE accounts SET login_attempts = 0, lockout_until = NULL WHERE id = ?', [user.id], (err) => {
                            if (err) console.error("Error resetting lockout for expired account:", err.message);
                        });
                        // Continue to password comparison
                    }
                }

                // --- Password Comparison ---
                const isMatch = await bcrypt.compare(password, user.password_hash); // Use user.password_hash

                if (isMatch) {
                    // Password is correct. Reset login attempts and update last successful login.
                    // Also, report last login attempt to the user (via session flash message)
                    
                    let lastLoginReportMessage = '';
                    const lastAttemptTimestamp = user.last_login_attempt;
                    const lastSuccessfulTimestamp = user.last_successful_login;

                    if (lastAttemptTimestamp) {
                        const lastAttemptDate = new Date(lastAttemptTimestamp);
                        const lastSuccessfulDate = lastSuccessfulTimestamp ? new Date(lastSuccessfulTimestamp) : null;

                        // Check if the last recorded attempt was successful or unsuccessful
                        // If last_successful_login is null or older than last_login_attempt, it implies the last one was unsuccessful.
                        // If they are the same, it implies the last one was successful.
                        if (lastSuccessfulDate && lastSuccessfulDate.getTime() === lastAttemptDate.getTime()) {
                            lastLoginReportMessage = `Your last login was successful at: ${lastAttemptDate.toLocaleString()}.`;
                        } else {
                            lastLoginReportMessage = `Your last login attempt was unsuccessful at: ${lastAttemptDate.toLocaleString()}.`;
                        }
                    } else {
                        lastLoginReportMessage = 'This is your first login.'; 
                    }

                    req.session.lastLoginReport = lastLoginReportMessage; // Store this detailed message in session

                    db.run('UPDATE accounts SET login_attempts = 0, last_successful_login = ?, last_login_attempt = ? WHERE id = ?',
                        [new Date().toISOString(), new Date().toISOString(), user.id], (updateErr) => {
                            if (updateErr) console.error("Error updating successful login:", updateErr.message);
                        });
                    return done(null, user); // Authentication successfuls
                } else {
                    // --- Incorrect Password & Lockout Increment ---
                    const newAttempts = user.login_attempts + 1;
                    const lockoutThreshold = 5; // 5 attempts
                    const lockoutPeriodSeconds = 10 * 60; // 10 minutes

                    if (newAttempts >= lockoutThreshold) {
                        const lockoutUntil = new Date(Date.now() + lockoutPeriodSeconds * 1000).toISOString();
                        db.run(
                            'UPDATE accounts SET login_attempts = ?, lockout_until = ?, last_login_attempt = ? WHERE id = ?',
                            [newAttempts, lockoutUntil, new Date().toISOString(), user.id], (updateErr) => {
                                if (updateErr) console.error("Error locking account:", updateErr.message);
                            }
                        );
                        return done(null, false, { message: 'Invalid username and/or password' }); // Vague message
                    } else {
                        db.run('UPDATE accounts SET login_attempts = ?, last_login_attempt = ? WHERE id = ?',
                            [newAttempts, new Date().toISOString(), user.id], (updateErr) => {
                                if (updateErr) console.error("Error updating failed login attempt:", updateErr.message);
                            });
                        return done(null, false, { message: 'Invalid username and/or password' }); // Vague message
                    }
                }
            } catch (error) {
                console.error("Passport LocalStrategy error:", error.message);
                return done(error); // Pass database or other errors to Passport
            }
        }
    ));

    // Serialize user: Store only the user ID in the session
    passport.serializeUser((user, done) => {
        done(null, user.id); // Use user.id from the database record
    });

    // Deserialize user: Retrieve user object from the database using ID from session
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await getAccountById(id); // Query by ID
            return done(null, user);
        } catch (error) {
            console.error("Passport Deserialize error:", error.message);
            return done(error);
        }
    });
};
