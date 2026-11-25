const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

// ── WhatsApp OTP send — same WABA/template approach as the reference
//    street-vendor backend's sendWhatsAppOtp.js, using this project's
//    WA_API_URL / WA_API_TOKEN (set in .env). Falls back to console-log
//    delivery whenever those aren't configured, so OTP login/registration
//    still works locally without WhatsApp credentials. ──
async function sendViaWhatsApp(mobile, otp) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: `91${mobile}`,
    type: "template",
    template: {
      name: "citizen_otp",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: String(otp) }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: String(otp) }],
        },
      ],
    },
  };

  const res = await fetch(process.env.WA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WA_API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return data;
}

// purpose: "login" | "registration" (kept for parity with the earlier SMS
// version's signature — the WhatsApp template itself doesn't vary by purpose)
async function sendOtp(mobile, otp, purpose = "login") {
  const devMode = process.env.OTP_DEV_MODE === "true";
  const waConfigured = !!(process.env.WA_API_URL && process.env.WA_API_TOKEN);

  // No WhatsApp API configured yet (or explicitly forced into dev mode) —
  // just log it so the flow is still testable locally.
  if (devMode || !waConfigured) {
    console.log(`📱 [DEV OTP] ${purpose.toUpperCase()} OTP for ${mobile}: ${otp}`);
    return { success: true, devMode: true };
  }

  try {
    const data = await sendViaWhatsApp(mobile, otp);
    if (data?.error) {
      console.error(`❌ WhatsApp OTP send failed (${purpose}) to ${mobile}:`, data.error);
      console.log(`📱 [FALLBACK OTP] ${purpose.toUpperCase()} OTP for ${mobile}: ${otp}`);
      return { success: false, error: data.error };
    }
    console.log(`✅ WhatsApp OTP sent (${purpose}) to ${mobile}:`, data);
    return { success: true, response: data };
  } catch (error) {
    console.error(`❌ WhatsApp OTP send failed (${purpose}) to ${mobile}:`, error.message);
    // Still log it so the flow is testable even if the WhatsApp API is down.
    console.log(`📱 [FALLBACK OTP] ${purpose.toUpperCase()} OTP for ${mobile}: ${otp}`);
    return { success: false, error: error.message };
  }
}

module.exports = sendOtp;
