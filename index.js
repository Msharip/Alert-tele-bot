const express = require('express');
const app = express();

//SUB-CHANNELES
require('./channel-alert/channelalert.js');
//require('./channel-alert/test.js');
//require('./channel-alert/test-cloudflare.js');



// AXIOS checking
//require('./tele/tele.js');
// CLOUDFLARE - BYPASS
//require('./tele/tele-passcloudflare.js')

// SUB-BOT
require('./sub-bot/sub.js');
console.log('all Bots are Ruuning');

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});