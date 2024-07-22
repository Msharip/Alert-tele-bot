const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// SUB-BOT
const subBot = require('./sub-bot/sub.js');
console.log('Running');

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// إعداد Webhook لنفس عنوان URL
app.post(`/bot${process.env.TOKEN4}`, (req, res) => {
  subBot.bot.processUpdate(req.body);
  res.sendStatus(200);
});
