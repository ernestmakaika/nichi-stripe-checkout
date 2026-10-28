import { createClient } from '@supabase/supabase-js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function isDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }

export async function GET(request) {
  const url = new URL(request.url);
  const checkIn = url.searchParams.get('checkIn');
  const checkOut = url.searchParams.get('checkOut');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  // No specific dates given: return every currently-active booking's date
  // range, so the calendar can grey out booked days before the guest picks.
  if (!checkIn && !checkOut) {
    const { data, error } = await supabase.from('bookings').select('check_in, check_out')
      .not('payment_status', 'in', '(cancelled,failed,refunded)');
    if (error) return json({ error: 'Could not load availability.' }, 500);
    return json({ ranges: data.map((b) => ({ checkIn: b.check_in, checkOut: b.check_out })) });
  }

  if (!isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn) return json({ error: 'Invalid dates.' }, 400);
  const { data, error } = await supabase.from('bookings').select('id')
    .lt('check_in', checkOut).gt('check_out', checkIn)
    .not('payment_status', 'in', '(cancelled,failed,refunded)').limit(1);
  if (error) return json({ error: 'Could not check availability.' }, 500);
  return json({ available: data.length === 0 });
}
