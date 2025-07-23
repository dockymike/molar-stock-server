import jwt from 'jsonwebtoken'


export function verifyToken(req, res, next) {
    // 🍪 Log incoming cookies for debugging
  console.log('🍪 Incoming cookies:', req.cookies)
  // Try to get token from httpOnly cookie first, fallback to Authorization header for backward compatibility
  let token = req.cookies?.authToken
  
  if (!token) {
    const authHeader = req.headers.authorization
    if (authHeader) {
      const parts = authHeader.split(' ')
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1]
      }
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' })
  }
}

