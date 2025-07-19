const isAuthenticated = (req, res, next) => {
    if (req.session.companyId) {
        return next();
    }
    res.redirect('/');
};

module.exports = { isAuthenticated };