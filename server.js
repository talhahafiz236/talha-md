require('dotenv').config();
const express = require('express');
const path = require('path');

const config = require('./config');
const whatsapp = require('./lib/whatsapp');
const messageHandler = require('./lib/handler');
const db = require('./lib/database');

const app = express();
const PORT = config.PORT || 3005;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect WhatsApp handler
whatsapp.setMessageHandler(messageHandler);

// Start WhatsApp Client on boot
whatsapp.start();

// API Endpoints for Pairing Web Portal
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number is required.' });
  }

  try {
    const code = await whatsapp.requestPairingCode(phone);
    res.json({ success: true, code });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to generate pairing code' });
  }
});

// Status check (Session ID is NEVER exposed to frontend or visitors)
app.get('/api/status', (req, res) => {
  res.json({
    status: whatsapp.status,
    pairingCode: whatsapp.pairingCode,
    qrCode: whatsapp.qrCodeDataUrl,
    sessionId: (whatsapp.status === 'connected') ? whatsapp.getSessionId() : null,
    botName: config.BOT_NAME,
    owner: config.OWNER_NAME,
    mode: db.get('MODE'),
    prefix: db.get('PREFIX')
  });
});

// Reset / Unlink to allow linking a new number
app.post('/api/reset', async (req, res) => {
  try {
    await whatsapp.resetAuth();
    res.json({ success: true, message: 'Ready to pair new number!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🚀 TALHA MD SERVER IS RUNNING ON PORT ${PORT} `);
  console.log(`  🌐 Web Pairing Portal: http://localhost:${PORT}        `);
  console.log(`  ⚡ Obsidian Hero Pure Phone Pairing Active!            `);
  console.log(`======================================================\n`);
});
