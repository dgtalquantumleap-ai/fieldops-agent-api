// src/shared/whatsapp.js
async function sendWhatsAppMessage(to, message) {
  const provider = process.env.WHATSAPP_TOKEN ? 'meta' : 'twilio';

  if (provider === 'meta') {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message }
        })
      }
    );
    if (!res.ok) throw new Error(`Meta error: ${JSON.stringify(await res.json())}`);

  } else {
    const params = new URLSearchParams({
      From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      To:   `whatsapp:${to}`,
      Body: message
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      }
    );
    if (!res.ok) throw new Error(`Twilio error: ${JSON.stringify(await res.json())}`);
  }
}

module.exports = { sendWhatsAppMessage };
