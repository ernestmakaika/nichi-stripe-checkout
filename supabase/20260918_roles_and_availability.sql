-- Run this migration once in the Supabase SQL editor, after schema.sql.
-- It prevents overlapping whole-property bookings.

-- A whole-property reservation blocks every overlapping stay. Checkout on the
-- same day as another guest checks in is allowed. Cancelled, failed, and
-- refunded bookings release the dates. The advisory lock closes the race where
-- two checkout requests arrive at the same time.
create or replace function public.prevent_booking_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status not in ('cancelled', 'failed', 'refunded') then
    perform pg_advisory_xact_lock(hashtext('nichis-whole-property-booking'));
    if exists (
      select 1 from public.bookings b
      where b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and b.payment_status not in ('cancelled', 'failed', 'refunded')
        and b.check_in < new.check_out
        and b.check_out > new.check_in
    ) then
      raise exception 'Those dates are no longer available. Please choose different dates.'
        using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_booking_overlap on public.bookings;
create trigger trg_prevent_booking_overlap
before insert or update of check_in, check_out, payment_status on public.bookings
for each row execute function public.prevent_booking_overlap();
