function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    } else {
        res.redirect('/login');
    }
}

function ensureManager(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'manager') {
        return next();
    } else {
        res.redirect('/login');
    }
}

function ensureCustomer(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'customer') {
        return next();
    } else {
        res.redirect('/login');
    }
}

module.exports = { ensureAdmin, ensureManager, ensureCustomer };