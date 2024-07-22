const express = require('express');
const bodyParser = require('body-parser');
const app = express();

//SUB-CHANNELES
require('./channel-alert/channelalert.js');

// AXIOS checking
require('./tele/tele.js');

// SUB-BOT
require('./sub-bot/sub.js');
console.log('all Bots are Ruuning');

app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


