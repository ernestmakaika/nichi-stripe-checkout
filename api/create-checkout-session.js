import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const PRICE = { USD: 250 };
const MAX_NIGHTS = 60;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    checkIn, checkOut, adults, children, currency,
    promoCode, firstName, lastName, email, phone,
  } = body || {};

  if (currency !== 'USD') {
    return json({ error: 'This endpoint only handles USD bookings' }, 400);
  }
  if (!isValidDateString(checkIn) || !isValidDateString(checkOut)) {
    return json({ error: 'Invalid check-in/check-out date' }, 400);
  }

  const checkInDate = new Date(checkIn + 'T00:00:00Z');
  const checkOutDate = new Date(checkOut + 'T00:00:00Z');
  const today = todayUTC();

  if (checkInDate < today) {
    return json({ error: 'Check-in date is in the past' }, 400);
  }
  if (checkOutDate <= checkInDate) {
    return json({ error: 'Check-out must be after check-in' }, 400);
  }
  const nights = Math.round((checkOutDate - checkInDate) / 86400000);
  if (nights > MAX_NIGHTS) {
    return json({ error: 'Stay is too long' }, 400);
  }

  const adultsNum = Number(adults);
  const childrenNum = Number(children);
  if (!Number.isInteger(adultsNum) || adultsNum < 1 || adultsNum > 10) {
    return json({ error: 'Invalid number of adults' }, 400);
  }
  if (!Number.isInteger(childrenNum) || childrenNum < 0 || childrenNum > 10) {
    return json({ error: 'Invalid number of children' }, 400);
  }

  if (!firstName || !lastName || !isValidEmail(email) || !phone) {
    return json({ error: 'Missing or invalid contact details' }, 400);
  }

  const nightlyRate = PRICE.USD;
  const totalAmount = nights * nightlyRate;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  const { data: booking, error: insertError } = await supabase
    .from('bookings')
    .insert({
      check_in: checkIn,
      check_out: checkOut,
      adults: adultsNum,
      children: childrenNum,
      currency: 'USD',
      nightly_rate: nightlyRate,
      total_amount: totalAmount,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      promo_code: promoCode || null,
      payment_provider: 'stripe',
      payment_status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    console.error('Supabase insert error', insertError);
    if (insertError.code === '23P01') {
      return json({ error: 'Those dates were just booked. Please choose different dates.' }, 409);
    }
    return json({ error: 'Could not create booking' }, 500);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || '';

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      client_reference_id: booking.id,
      metadata: { booking_id: booking.id },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(totalAmount * 100),
          product_data: {
            name: `Nichi's Guesthouses — ${nights} night${nights === 1 ? '' : 's'}, ${checkIn} to ${checkOut}`,
          },
        },
      }],
      success_url: `${siteUrl}/booking-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/index.html?booking=cancelled`,
    });
  } catch (err) {
    console.error('Stripe session error', err);
    await supabase.from('bookings').update({ payment_status: 'failed' }).eq('id', booking.id);
    return json({ error: 'Could not start payment' }, 500);
  }

  await supabase
    .from('bookings')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', booking.id);

  return json({ url: session.url }, 200);
}
