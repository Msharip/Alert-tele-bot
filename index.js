const express = require('express');
const app = express();


// SUB-CHANNELS
require('./channel-alert/channelalert.js'); 


require('./tele/tele.js');


// بدء الخادم لاستقبال طلبات Webhook
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


console.log('Bots are Running')