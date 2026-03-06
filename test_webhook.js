const crypto = require('crypto');

const secretKey = 'sk_live_ac597596c3489f2343e7cfe4ab83db48a8508cd5';

// Test webhook payload
const payload = {
  event: 'charge.success',
  data: {
    reference: 'test-reference-123',
    amount: 150000,
    customer: {
      email: 'test@example.com'
    }
  }
};

// Generate signature
const hash = crypto.createHmac('sha512', secretKey).update(JSON.stringify(payload)).digest('hex');

console.log('Generated Signature:', hash);
console.log('\nTest with:');
console.log(`curl -X POST https://www.naijaspride.com/api/v1/payments/webhook \\\n  -H "Content-Type: application/json" \\\n  -H "x-paystack-signature: ${hash}" \\\n  -d '${JSON.stringify(payload)}'`);
