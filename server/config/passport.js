const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { OccasioDB } = require('./db');

module.exports = function (passport) {

    const getAccountByUsernameStmt = OccasioDB.prepare('SELECT * FROM accounts WHERE username = ?');
    const getAccountByIdStmt = OccasioDB.prepare('SELECT * FROM accounts WHERE id = ?');
    const updateLastLoginAttemptStmt = OccasioDB.prepare('UPDATE accounts SET last_login_attempt = ? WHERE username = ?');
    const resetLockoutStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = 0, lockout_until = NULL WHERE id = ?');
    const updateSuccessfulLoginStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = 0, last_successful_login = ?, last_login_attempt = ? WHERE id = ?');
    const updateFailedLoginAttemptStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = ?, last_login_attempt = ? WHERE id = ?');
    const lockAccountStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = ?, lockout_until = ?, last_login_attempt = ? WHERE id = ?');

    function getAccountByUsername(username) {
        return getAccountByUsernameStmt.get(username);
    }

    function getAccountById(id) {
        return getAccountByIdStmt.get(id);
    }

    passport.use(new LocalStrategy(
        { usernameField: 'username', passReqToCallback: true },
        async (req, username, password, done) => {
            try {
                const user = getAccountByUsername(username);

                if (!user) {
                    updateLastLoginAttemptStmt.run(new Date().toISOString(), username);
                    return done(null, false, { message: 'Invalid username and/or password' });
                }

                if (user.lockout_until) {
                    const lockoutTimestamp = new Date(user.lockout_until);
                    const currentTime = new Date();

                    if (lockoutTimestamp > currentTime) {
                        return done(null, false, { message: 'Invalid username and/or password' });
                    } else {
                        resetLockoutStmt.run(user.id);
                    }
                }

                const isMatch = await bcrypt.compare(password, user.password_hash);

                if (isMatch) {
                    let lastLoginReportMessage = '';

                    const lastAttemptTimestamp = user.last_login_attempt;
                    const lastSuccessfulTimestamp = user.last_successful_login;

                    if (lastAttemptTimestamp) {
                        const lastAttemptDate = new Date(lastAttemptTimestamp);
                        const lastSuccessfulDate = lastSuccessfulTimestamp ? new Date(lastSuccessfulTimestamp) : null;

                        if (lastSuccessfulDate && lastSuccessfulDate.getTime() === lastAttemptDate.getTime()) {
                            lastLoginReportMessage = `Your last login was successful at: ${lastAttemptDate.toLocaleString()}.`;
                        } else {
                            lastLoginReportMessage = `Your last login attempt was unsuccessful at: ${lastAttemptDate.toLocaleString()}.`;
                        }
                    } else {
                        lastLoginReportMessage = 'This is your first login.';
                    }

                    user._lastLoginReportMessage = lastLoginReportMessage;

                    updateSuccessfulLoginStmt.run(new Date().toISOString(), new Date().toISOString(), user.id);
                    return done(null, user);
                }
                else {
                    const newAttempts = user.login_attempts + 1;
                    const lockoutThreshold = 5;
                    const lockoutPeriodSeconds = 10 * 60;

                    if (newAttempts >= lockoutThreshold) {
                        const lockoutUntil = new Date(Date.now() + lockoutPeriodSeconds * 1000).toISOString();
                        lockAccountStmt.run(newAttempts, lockoutUntil, new Date().toISOString(), user.id);
                        return done(null, false, { message: 'Invalid username and/or password' });
                    } else {
                        updateFailedLoginAttemptStmt.run(newAttempts, new Date().toISOString(), user.id);
                        return done(null, false, { message: 'Invalid username and/or password' });
                    }
                }
            } catch (error) {
                console.error("Passport LocalStrategy error:", error.message);
                return done(error);
            }
        }
    ));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = getAccountById(id);
            return done(null, user);
        } catch (error) {
            console.error("Passport Deserialize error:", error.message);
            return done(error);
        }
    });
};
