const express = require('express');
const app = express();

//SUB-CHANNELES
require('./channel-alert/channelalert.js');

// AXIOS checking
require('./tele/tele.js');

console.log('all Bots are Ruuning');


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


