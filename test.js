const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const express = require('express');
const path = require('path');
const mysql = require('mysql2');
require('dotenv').config();

const productNames = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush'  },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost' },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/ar/haila.html': { ar: ' هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة ', en: 'samra' },
  'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست  ', en: 'purple-mist' },
};

const urls = [
  'https://www.dzrt.com/ar/icy-rush.html',
  'https://www.dzrt.com/ar/seaside-frost.html',
  'https://www.dzrt.com/ar/highland-berries.html',
  'https://www.dzrt.com/ar/garden-mint.html',
  'https://www.dzrt.com/ar/mint-fusion.html',
  'https://www.dzrt.com/ar/haila.html',
  'https://www.dzrt.com/ar/samra.html',
  'https://www.dzrt.com/ar/purple-mist.html',
  
];

const channels = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush', chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost', chatId: process.env.CHAT_ID_SEASIDE },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' , chatId: process.env.CHAT_ID_HIGH },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint', chatId: process.env.CHAT_ID_GARDEN },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion', chatId: process.env.CHAT_ID_MINT },
  'https://www.dzrt.com/ar/haila.html': { ar: ' هيلة', en: 'haila', chatId: process.env.CHAT_ID_HAILA },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra', chatId: process.env.CHAT_ID_SAMRA },

};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });


const productCooldown = 30 * 60 * 1000; // فترة التهدئة لكل منتج على حدة: 25 دقيقة بالمللي ثانية
let productStatus = {};

urls.forEach(url => {
  productStatus[url] = { isAvailable: false, lastNotificationTime: 0, messageId: null, individualCooldownTime: 0 };
});


async function checkProductAvailability(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const isUnavailable = $('div.stock.unavailable span').length > 0;
    const currentTime = Date.now();
    
    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrl = path.join(__dirname, 'images', `${productNames[url].en}.png`);

      if (!isUnavailable && (currentTime - productStatus[url].individualCooldownTime > productCooldown)) {
        // المنتج متوفر الآن وفترة التهدئة الفردية قد انقضت
        const message = `*${productNameAr}* - متوفر الآن ✅ \n[ أضغط هنا ](${url})`;
        console.log(message);
        const sentMessage = await bot.sendPhoto(chatId, imageUrl, { caption: message, parse_mode: 'Markdown' });
        
        productStatus[url] = {
          isAvailable: true,
          lastNotificationTime: currentTime,
          messageId: sentMessage.message_id,
          individualCooldownTime: currentTime
        };

      } else if (isUnavailable && productStatus[url].isAvailable) {
        // المنتج غير متوفر الآن ولكنه كان متوفرًا في الفحص السابق
        productStatus[url].isAvailable = false;
      }
    }
  } catch (error) {
  }
}

async function checkAllUrls() {
  for (const url of urls) {
    const currentTime = Date.now();
    // التحقق من فترة التهدئة لكل منتج على حدة
    if (currentTime - productStatus[url].individualCooldownTime > productCooldown) {
      await checkProductAvailability(url);
    }
  }
}

// جدولة الفحص ليعمل كل ثانية
cron.schedule('* * * * * *', () => {
  checkAllUrls();
});








const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT
});


async function checkUserSubscriptions() {
  const currentDate = new Date().toISOString().split('T')[0];
  const query = 'SELECT id, expiryDate FROM users WHERE activated = true';

  db.query(query, async (err, results) => {
    if (err) {
      console.error('Error reading subscriptions from database:', err);
      return;
    }

    const usersToUnban = results.filter(user => new Date(user.expiryDate) < new Date(currentDate));

    for (const user of usersToUnban) {
      const channelIds = [
        mainChannelId,
        process.env.CHAT_ID_ICY_RUSH,
        process.env.CHAT_ID_SEASIDE,
        process.env.CHAT_ID_SAMRA,
        process.env.CHAT_ID_HIGH,
        process.env.CHAT_ID_GARDEN,
        process.env.CHAT_ID_MINT,
        process.env.CHAT_ID_HAILA,
        process.env.CHAT_ID_PURPPLE
      ];

      try {
        await unbanUserFromAllChannels(user.id, channelIds);

        const deleteQuery = 'DELETE FROM users WHERE id = ?';
        db.query(deleteQuery, [user.id], (deleteErr) => {
          if (deleteErr) {
            console.error('Error deleting user from the database:', deleteErr);
          } else {
          }
        });
      } catch (error) {
        console.error(`Failed to remove user ${user.id} from all channels:`, error);
      }
    }
  });
}

async function unbanUserFromAllChannels(userId, channelIds) {
  const unbanPromises = channelIds.map(channelId => {
    if (channelId) {
      return bot.unbanChatMember(channelId, userId);
    } else {
      return Promise.resolve();
    }
  });

  await Promise.all(unbanPromises);
}

async function handleJoinRequests(request) {
  if (request) {
    const userId = request.user_chat_id;
    const channelId = request.chat.id;
    const query = 'SELECT id FROM users WHERE id = ? AND activated = true';

    db.query(query, [userId], async (err, results) => {
      if (err) {
        console.error('Error reading subscriptions from database:', err);
        return;
      }

      if (results.length > 0) {
        try {
          await approveJoinRequestWithDelay(channelId, userId);
        } catch (error) {
        }
      } else {
        console.log(`User ${userId} not found in active subscriptions.`);
      }
    });
  }
}

async function approveJoinRequestWithDelay(channelId, userId) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await bot.approveChatJoinRequest(channelId, userId);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 3000); // Adding a delay of 3 seconds
  });
}

bot.on('chat_join_request', (request) => {
  handleJoinRequests(request);
});

cron.schedule('0 0 * * *', () => {
  console.log('Running daily subscription check');
  checkUserSubscriptions();
});



/* وظيفة لإضافة رموز التفعيل
async function addActivationCodes() {
  const activationCodes = [];
  for (let i = 1; i <= 20; i++) {
    activationCodes.push([`${i}`, -1]);
  }

  const insertQuery = 'INSERT INTO activationcodes (activation_code, duration_in_months) VALUES ?';

  db.query(insertQuery, [activationCodes], (error, results) => {
    if (error) {
      return console.error('Error inserting activation codes:', error);
    }
    console.log('Activation codes inserted:', results.affectedRows);
  });
}

// استدعاء وظيفة إضافة رموز التفعيل
addActivationCodes();
*/


