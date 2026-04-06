// lib/whatsapp.js — WhatsApp messaging (Meta direct or Twilio)
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
    if (!res.ok) throw new Error(`Meta WhatsApp error: ${JSON.stringify(await res.json())}`);
  } else {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('WhatsApp not configured: set WHATSAPP_TOKEN (Meta) or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN');

    const params = new URLSearchParams({
      From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      To:   `whatsapp:${to}`,
      Body: message
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      }
    );
    if (!res.ok) throw new Error(`Twilio error: ${JSON.stringify(await res.json())}`);
  }
}

module.exports = { sendWhatsAppMessage };
