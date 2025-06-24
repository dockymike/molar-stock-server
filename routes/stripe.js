import express from 'express'
import Stripe from 'stripe'
import pool from '../db/index.js'

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

router.post('/create-checkout-session', async (req, res) => {
  const { priceId, userId } = req.body

  try {
    // Create a customer for the user
    const customer = await stripe.customers.create({
      metadata: { userId },
    })

    // Store the Stripe customer ID in your database
    await pool.query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [customer.id, userId]
    )

    // Create checkout session
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

export default router
