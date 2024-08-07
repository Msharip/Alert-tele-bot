const express = require('express');
const app = express();

//SUB-CHANNELES
require('./channel-alert/channelalert.js');

// AXIOS checking
require('./tele/tele.js');

console.log('all Bots are Ruuning');





