# Supabase setup

1. Run `schema.sql`, then run `20260918_roles_and_availability.sql`, in that order, in the Supabase SQL editor.

Note: `20260918_roles_and_availability.sql` also sets up admin/staff auth roles for a `/admin` portal that isn't part of this repo — only its booking-overlap exclusion constraint is used here.

The booking-overlap trigger considers pending and paid bookings to be reserved. Mark a failed, cancelled, or refunded booking accordingly to release its dates.
