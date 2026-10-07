import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // No .env file: rely on the real environment.
}

const env = process.env;

export const config = {
  root,
  port: Number(env.PORT) || 3000,
  production: env.NODE_ENV === 'production',
  // Public base URL, used to build payment gateway return URLs.
  baseUrl: (env.BASE_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),
  dbFile: env.DB_FILE || path.join(root, 'data', 'zaqa.db'),
  uploadsDir: path.join(root, 'public', 'uploads'),
  admin: {
    email: env.ADMIN_EMAIL || 'admin@zaqa.pk',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'ZAQA Admin',
  },
  // simulate: built-in test checkout (no real money); sandbox: gateway test servers; live: real payments.
  paymentMode: ['simulate', 'sandbox', 'live'].includes(env.PAYMENT_MODE) ? env.PAYMENT_MODE : 'simulate',
  jazzcash: {
    merchantId: env.JAZZCASH_MERCHANT_ID || '',
    password: env.JAZZCASH_PASSWORD || '',
    integritySalt: env.JAZZCASH_INTEGRITY_SALT || '',
    txnType: env.JAZZCASH_TXN_TYPE || 'MWALLET',
  },
  easypaisa: {
    storeId: env.EASYPAISA_STORE_ID || '',
    hashKey: env.EASYPAISA_HASH_KEY || '',
    // Credentials for the Inquire Transaction API, used to verify payments server-side.
    username: env.EASYPAISA_USERNAME || '',
    password: env.EASYPAISA_PASSWORD || '',
    accountNum: env.EASYPAISA_ACCOUNT_NUM || '',
  },
  nayapay: {
    merchantId: env.NAYAPAY_MERCHANT_ID || '',
    apiKey: env.NAYAPAY_API_KEY || '',
    secret: env.NAYAPAY_SECRET || '',
    apiBase: env.NAYAPAY_API_BASE || '',
  },
  mastercard: {
    // Mastercard Payment Gateway Services (MPGS) host given by your acquiring bank.
    gateway: (env.MPGS_GATEWAY_URL || 'https://test-gateway.mastercard.com').replace(/\/$/, ''),
    merchantId: env.MPGS_MERCHANT_ID || '',
    apiPassword: env.MPGS_API_PASSWORD || '',
    apiVersion: env.MPGS_API_VERSION || '73',
  },
};
