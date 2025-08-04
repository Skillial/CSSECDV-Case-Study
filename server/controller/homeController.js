const passport = require('passport');

const controller = {

    // Renders the home page
    home: (req, res) => {
        if (req.user){
            if (req.user.role === 'admin') {
                res.render('dashboard'); 
            } else if (req.user.role === 'manager') {
                res.render('ordersinventory');
            } else if (req.user.role === 'customer') {
                res.render('home');
            }
        }
    },

};

module.exports = controller;
