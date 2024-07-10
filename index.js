const express = require('express');
const app = express();

//require('./channel-alert/channelalert.js');
require('./tele/tele.js');
require('./sub-bot/sub.js');
require('./channel-alert/test.js');




console.log('all Bots are Ruuning');

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});