// 📁 server.js
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'

dotenv.config()

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set in environment variables')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in environment variables')
  process.exit(1)
}


// Routers
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import opsRoutes from './routes/ops.js'
import suppliesRoutes from './routes/supplies.js'
import categoryRoutes from './routes/categories.js'
import supplierRoutes from './routes/suppliers.js'
import logsRoutes from './routes/logs.js'
import proceduresRoutes from './routes/procedures.js'
import procedureSuppliesRoutes from './routes/procedureSupplies.js'
import lowStockThresholdRoutes from './routes/lowStockThresholdRoutes.js'
import passwordRoutes from './routes/passwordReset.js'
import stripeRoutes from './routes/stripe.js'
import stripeWebhookRouter from './routes/stripeWebhook.js'
import barcodeRoutes from './scanning/routes/barcode.js'
import inventoryRoutes from './routes/inventory.js' // USED instead of op_supplies
import locationsRoutes from './routes/locations.js'

// Import error handling middleware
import { errorHandler, dbHealthCheck } from './middleware/errorHandler.js'

const app = express()
// 👇 Crucial for Heroku + cookies to work
app.set('trust proxy', 1)

const port = process.env.PORT || 3001

// Configure CORS based on environment
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://app.molarstock.com' 
    : ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}

app.use(cors(corsOptions))
app.use(cookieParser()) // Parse cookies

// Webhook must be mounted BEFORE express.json
app.use('/api/stripe/webhook', stripeWebhookRouter)

app.use(express.json()) // Parse all non-webhook routes as JSON

// Health check
app.get('/', (req, res) => {
  res.send('Dental Inventory API is running')
})

// Test cookie endpoint
app.get('/api/test-cookie', (req, res) => {
  
  res.cookie('testCookie', 'testValue', {
    httpOnly: false,  // Make it visible to JS for testing
    maxAge: 60000,    // 1 minute
    path: '/'
  })
  
  res.json({ message: 'Test cookie set' })
})

// ROUTES
app.use('/api', authRoutes)
app.use('/api/auth', userRoutes)
app.use('/api/users', userRoutes)
app.use('/api/ops', opsRoutes)
app.use('/api/supplies', suppliesRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/logs', logsRoutes)
app.use('/api/procedures', proceduresRoutes)
app.use('/api/procedure-supplies', procedureSuppliesRoutes)
app.use('/api/low-stock', lowStockThresholdRoutes)
app.use('/api/low-stock-threshold', lowStockThresholdRoutes)
app.use('/api/password', passwordRoutes)
app.use('/api/stripe', stripeRoutes)
app.use('/api/barcode', barcodeRoutes)
app.use('/api/inventory', inventoryRoutes)

app.use('/api/locations', locationsRoutes)

// Database health check removed for now to avoid blocking requests

// Global error handler (must be last)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server running on port ${port}`)

  // Test database connection on startup
  import('./db/utils.js').then(({ testConnection }) => {
    testConnection()
  })
})
