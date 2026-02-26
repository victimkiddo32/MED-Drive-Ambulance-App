const verifyRole = (roles) => {
    return (req, res, next) => {
        // In a real app, you'd verify a JWT token here. 
        // For your project, we check the role sent in the headers.
        const userRole = req.headers['x-user-role']; 

        if (!userRole) {
            return res.status(401).json({ message: "Authentication required" });
        }

        if (!roles.includes(userRole)) {
            return res.status(403).json({ message: "Access Denied: Unauthorized Role" });
        }

        next();
    };
};

module.exports = { verifyRole };