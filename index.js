const express = require('express');
const app = express();

// نحتاج لتفعيل Webhook في tele.js فقط
app.use(express.json());

// SUB-CHANNELS
require('./channel-alert/channelalert.js'); // هذا الملف يستخدم Polling

// تضمين tele.js الذي يستخدم Webhook
require('./tele/tele.js')(app); // تمرير app حتى يتمكن من استخدام Webhook

console.log("Bots are Running");

// بدء الخادم لاستقبال طلبات Webhook
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
