// src/shared/payments.js
function detectRegion(phone) {
  const cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('234')) return 'NG';
  return 'CA';
}

async function generatePaymentLink({ jobId, amount, customerName, customerPhone, region, description }) {
  region = region || detectRegion(customerPhone);
  try {
    if (region === 'NG') return await createOxaPayLink({ jobId, amount, description });
    return await createPolarLink({ jobId, amount, customerName, customerPhone, description });
  } catch (err) {
    console.error('Payment link error:', err.message);
    return `${process.env.APP_URL}/pay?job=${jobId}&amount=${amount}`;
  }
}

async function createOxaPayLink({ jobId, amount, description }) {
  const res = await fetch('https://api.oxapay.com/merchants/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant:    process.env.OXAPAY_MERCHANT_KEY,
      amount,
      currency:    'USD',
      lifeTime:    60,
      feePaidByPayer: 1,
      callbackUrl: `${process.env.APP_URL}/webhook/payments/oxapay`,
      returnUrl:   `${process.env.APP_URL}/booking-status.html?job=${jobId}`,
      description: `${description} | Job #${jobId}`,
      orderId:     `JOB-${jobId}`,
    })
  });
  const data = await res.json();
  if (data.result !== 100) throw new Error(`OxaPay: ${data.message}`);
  return data.payLink;
}

async function createPolarLink({ jobId, amount, customerName, customerPhone, description }) {
  const res = await fetch('https://api.polar.sh/v1/checkouts/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      product_id:  process.env.POLAR_PRODUCT_ID,
      amount:      Math.round(amount * 100),
      currency:    'cad',
      success_url: `${process.env.APP_URL}/booking-status.html?job=${jobId}`,
      metadata:    { job_id: String(jobId), customer: customerName, phone: customerPhone },
      customer_name: customerName,
    })
  });
  const data = await res.json();
  if (!data.url) throw new Error(`Polar: ${JSON.stringify(data)}`);
  return data.url;
}

module.exports = { generatePaymentLink, detectRegion };
