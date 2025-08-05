function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    } else {
        res.redirect('/error');
    }
}

function ensureManager(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'manager') {
        return next();
    } else {
        res.redirect('/error');
    }
}

function ensureCustomer(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'customer') {
        return next();
    } else {
        res.redirect('/error');
    }
}

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource.');
        res.redirect('/error');
    }
}

module.exports = { ensureAdmin, ensureManager, ensureCustomer, ensureAuthenticated };