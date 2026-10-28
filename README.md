# Nichi's Guesthouses — Stripe Checkout

A direct-booking flow with Stripe Checkout handling payment, built for a small hospitality business.

## The problem

Guests need to pick dates, see accurate availability, and pay without two guests ever being able to book the same dates, and without losing track of a payment that's still in flight.

## How it's wired up

**Calendar & availability** — `GET /api/check-availability` returns every active booking's date range so the front-end calendar can grey out booked days before a guest even starts checkout. The authoritative check happens again server-side at booking time, backed by a Postgres exclusion constraint (`supabase/20260918_roles_and_availability.sql`) so two guests can't win a race on the same dates — the DB rejects the second insert (`23P01`) rather than relying on the application layer to catch it.

**Checkout** — `POST /api/create-checkout-session`:
1. Validates the request (dates, guest counts, contact info) server-side — never trusts client-computed totals.
2. Inserts a `pending` booking row first, then creates a Stripe Checkout Session with `client_reference_id` and `metadata.booking_id` pointing at it.
3. Redirects the guest to Stripe's hosted Checkout page — card data never touches this server.

**Confirmation via webhook, not the redirect** — `POST /api/stripe-webhook` verifies the Stripe signature, then on `checkout.session.completed` looks up the booking by `stripe_checkout_session_id` and marks it paid. Confirmation is driven by the webhook not by the guest's browser landing on the success URL.

## Stack

- Vercel serverless functions (Node, Fetch API `Request`/`Response`) for the API
- Stripe Checkout Sessions (hosted, test mode)
- Supabase (Postgres) for bookings
- Resend for transactional confirmation emails