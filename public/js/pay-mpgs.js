// Opens the Mastercard Hosted Checkout page for the session created on the server.
/* global Checkout */
window.mpgsError = () => {
  document.querySelector('.pay-note').textContent = 'The card payment page could not be opened. Please go back and try again.';
};
const el = document.getElementById('mpgs');
if (el && window.Checkout) {
  Checkout.configure({ session: { id: el.dataset.session } });
  Checkout.showPaymentPage();
}
