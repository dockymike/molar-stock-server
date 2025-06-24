// 📁 server.js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

// Routers
import userRoutes from './routes/users.js'
import opsRoutes from './routes/ops.js'
import suppliesRoutes from './routes/supplies.js'
import categoryRoutes from './routes/categories.js'
import supplierRoutes from './routes/suppliers.js'
import opSuppliesRoutes from './routes/opSupplies.js'
import logsRoutes from './routes/logs.js'
import proceduresRoutes from './routes/procedures.js'
import procedureSuppliesRoutes from './routes/procedureSupplies.js'
import lowStockThresholdRoutes from './routes/lowStockThresholdRoutes.js'
import passwordRoutes from './routes/passwordReset.js'
import stripeRoutes from './routes/stripe.js'
import stripeWebhookRouter from './routes/stripeWebhook.js' // ✅ NEW

const app = express()
const port = process.env.PORT || 3001

app.use(cors())

// ✅ Webhook must be mounted BEFORE express.json
app.use('/api/stripe/webhook', stripeWebhookRouter)

app.use(express.json()) // Parse all non-webhook routes as JSON

// Health check
app.get('/', (req, res) => {
  res.send('Dental Inventory API is running ✅')
})

// ROUTES
console.log('📦 Mounting routes...')
app.use('/api/users', userRoutes)
console.log('✅ /api/users mounted')

app.use('/api/ops', opsRoutes)
console.log('✅ /api/ops mounted')

app.use('/api/supplies', suppliesRoutes)
console.log('✅ /api/supplies mounted')

app.use('/api/categories', categoryRoutes)
console.log('✅ /api/categories mounted')

app.use('/api/suppliers', supplierRoutes)
console.log('✅ /api/suppliers mounted')

app.use('/api/op-supplies', opSuppliesRoutes)
console.log('✅ /api/op-supplies mounted')

app.use('/api/logs', logsRoutes)
console.log('✅ /api/logs mounted')

app.use('/api/procedures', proceduresRoutes)
console.log('✅ /api/procedures mounted')

app.use('/api/procedure-supplies', procedureSuppliesRoutes)
console.log('✅ /api/procedure-supplies mounted')

app.use('/api/low-stock', lowStockThresholdRoutes)
console.log('✅ /api/low-stock mounted')

app.use('/api/low-stock-threshold', lowStockThresholdRoutes)
console.log('✅ /api/low-stock-threshold mounted')

app.use('/api/password', passwordRoutes)
console.log('✅ /api/password mounted')

app.use('/api/stripe', stripeRoutes)
console.log('✅ /api/stripe mounted')

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`)
})
