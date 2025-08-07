const { auditLogger } = require('./auditLogger'); // Adjust path as needed

function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    } else {
        // 🪵 Audit Log: Access Control Failure
        auditLogger({
            eventType: 'Access Control',
            userId: req.user ? req.user.id : null,
            username: req.user ? req.user.username : 'Guest',
            ip_address: req.ip,
            status: 'Failure',
            description: `User attempted to access an admin-only route at ${req.originalUrl} without sufficient privileges.`
        });
        res.redirect('/error');
    }
}

function ensureManager(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'manager') {
        return next();
    } else {
        // 🪵 Audit Log: Access Control Failure
        auditLogger({
            eventType: 'Access Control',
            userId: req.user ? req.user.id : null,
            username: req.user ? req.user.username : 'Guest',
            ip_address: req.ip,
            status: 'Failure',
            description: `User attempted to access a manager-only route at ${req.originalUrl} without sufficient privileges.`
        });
        res.redirect('/error');
    }
}

function ensureCustomer(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'customer') {
        return next();
    } else {
        // 🪵 Audit Log: Access Control Failure
        auditLogger({
            eventType: 'Access Control',
            userId: req.user ? req.user.id : null,
            username: req.user ? req.user.username : 'Guest',
            ip_address: req.ip,
            status: 'Failure',
            description: `User attempted to access a customer-only route at ${req.originalUrl} without sufficient privileges.`
        });
        res.redirect('/error');
    }
}

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
        // 🪵 Audit Log: Access Control Failure
        auditLogger({
            eventType: 'Access Control',
            userId: null,
            username: 'Guest',
            ip_address: req.ip,
            status: 'Failure',
            description: `Unauthenticated user attempted to access a protected route at ${req.originalUrl}.`
        });
        req.flash('error', 'Please log in to view this resource.');
        res.redirect('/error');
    }
}

function ensureUnauthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/home');
    }
    next();
}

module.exports = { ensureAdmin, ensureManager, ensureCustomer, ensureAuthenticated, ensureUnauthenticated };
