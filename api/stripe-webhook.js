import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { sendPaymentConfirmedEmail } from './_lib/email.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('stripe_checkout_session_id', session.id)
      .single();

    if (error || !booking) {
      console.error('Webhook: no booking found for session', session.id, error);
    } else if (booking.payment_status !== 'paid') {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          stripe_payment_intent_id: session.payment_intent,
          amount_captured: (session.amount_total ?? 0) / 100,
        })
        .eq('id', booking.id);

      if (updateError) {
        console.error('Webhook: failed to mark booking paid', updateError);
      } else {
        await sendPaymentConfirmedEmail(booking);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
