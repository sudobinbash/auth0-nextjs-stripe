import { getSession, withApiAuthRequired } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Creates a Stripe billing portal session for the user
export const GET = withApiAuthRequired(async function handler(req, res) {
  try {
    const { user } = await getSession(req, res);
    const returnUrl = `${process.env.AUTH0_BASE_URL}/api/auth/login`;

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.redirect(session.url, res);
  } catch (error) {
    console.log(error);
  }
});