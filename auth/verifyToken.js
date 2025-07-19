import jwt from 'jsonwebtoken'

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    console.log('⛔ No Authorization header received')
    return res.status(401).json({ error: 'Access denied. No token provided.' })
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.log('⛔ Token format invalid:', authHeader)
    return res.status(401).json({ error: 'Token format invalid.' })
  }

  const token = parts[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log('✅ Token verified:', decoded)
    req.user = decoded
    next()
  } catch (err) {
    console.log('⛔ Token verification failed:', err.message)
    return res.status(403).json({ error: 'Invalid token' })
  }
}

