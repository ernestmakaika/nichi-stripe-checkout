import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.BOOKING_FROM_EMAIL;

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMoney(amount) {
  return '$' + Number(amount).toLocaleString('en-US');
}

function bookingDetailsHtml(booking) {
  return `
    <p><strong>Check-in:</strong> ${formatDate(booking.check_in)}</p>
    <p><strong>Check-out:</strong> ${formatDate(booking.check_out)}</p>
    <p><strong>Nights:</strong> ${booking.nights}</p>
    <p><strong>Guests:</strong> ${booking.adults} adult(s)${booking.children ? ', ' + booking.children + ' child(ren)' : ''}</p>
    <p><strong>Total:</strong> ${formatMoney(booking.total_amount)}</p>
    <p><strong>Confirmation code:</strong> ${booking.confirmation_code}</p>
  `;
}

export async function sendPaymentConfirmedEmail(booking) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: booking.email,
      subject: "Your Nichi's Guesthouses booking is confirmed",
      html: `
        <p>Hi ${booking.first_name},</p>
        <p>Thanks for booking with Nichi's Guesthouses — your payment has gone through and your stay is confirmed.</p>
        ${bookingDetailsHtml(booking)}
        <p>We look forward to hosting you. If you have any questions, just reply to this email.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send payment confirmation email', err);
  }
}
