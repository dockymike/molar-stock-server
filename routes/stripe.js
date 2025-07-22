// 📁 routes/stripe.js
import express from 'express'
import Stripe from 'stripe'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// ✅ Create Checkout Session (Subscribe)
router.post('/create-checkout-session', async (req, res) => {
  const { priceId, userId } = req.body

  try {
    // Create Stripe Customer and store customer ID in DB
    const customer = await stripe.customers.create({ metadata: { userId } })

    await pool.query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [customer.id, userId]
    )

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard-page?checkout=success`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard-page?checkout=cancel`,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('Stripe session creation failed:', err)
    res.status(500).json({ error: 'Unable to create Stripe Checkout session' })
  }
})

// ✅ Create Billing Portal Session (Manage Subscription)
router.post('/create-portal-session', verifyToken, async (req, res) => {
  const userId = req.user.id

  try {
    const result = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    )

    const customerId = result.rows[0]?.stripe_customer_id

    if (!customerId) {
      return res.status(400).json({ error: 'Stripe customer ID not found' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard-page`,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('Error creating portal session:', err)
    res.status(500).json({ error: 'Unable to create Stripe Portal session' })
  }
})

export default router
