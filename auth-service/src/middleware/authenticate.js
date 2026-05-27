// JWT authentication middleware.
// Validates the JWT on every protected route.
// Attaches the decoded user payload to req.user
// so route handlers can access user_id and email.
// Used by any route that requires authentication —
// currently POST /auth/redeem, and later all API gateway routes.

const jwt = require('jsonwebtoken')
const config = require('../config')

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization

  // Authorization header must be in format: Bearer <token>
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization header' })
  }

  const token = authHeader.split(' ')[1]

  try {
    // Verify the token was signed with our secret
    // and has not expired. jwt.verify throws if either fails.
    const decoded = jwt.verify(token, config.jwtSecret)

    // Attach decoded payload to request so route handlers
    // can access req.user.user_id and req.user.email
    req.user = decoded

    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' })
    }
    return res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = authenticate