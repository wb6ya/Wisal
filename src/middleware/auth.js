const isAuthenticated = (req, res, next) => {
    // We check for 'userId' which is set for both company owners and employees
    if (req.session.userId) {
        return next();
    }
    // If no userId is found in the session, redirect to the login page
    res.redirect('/');
};

module.exports = { isAuthenticated };