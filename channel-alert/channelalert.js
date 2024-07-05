const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const productNames = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush'  },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost' },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/ar/haila.html': { ar: ' هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة ', en: 'samra' },
  'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist' },
  'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت ', en: 'edgy-mint' },
  'https://www.dzrt.com/ar/tamra.html': { ar: 'تمرة', en: 'tamra' }



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
  'https://www.dzrt.com/ar/edgy-mint.html',
  'https://www.dzrt.com/ar/tamra.html'

  
];

const channels = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush', chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost', chatId: process.env.CHAT_ID_SEASIDE },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' , chatId: process.env.CHAT_ID_HIGH },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint', chatId: process.env.CHAT_ID_GARDEN },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion', chatId: process.env.CHAT_ID_MINT },
  'https://www.dzrt.com/ar/haila.html': { ar: ' هيلة', en: 'haila', chatId: process.env.CHAT_ID_HAILA },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra', chatId: process.env.CHAT_ID_SAMRA },
  'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist', chatId: process.env.CHAT_ID_PURPPLE },
  'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت ', en: 'edgy-mint', chatId: process.env.CHAT_ID_EDGY },
  'https://www.dzrt.com/ar/tamra.html': { ar: ' تمرة ', en: 'tamra', chatId: process.env.CHAT_ID_TAMRA },



};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });



const productCooldown = 10 * 60 * 1000; // فترة التهدئة لكل منتج على حدة: 10 دقائق بالمللي ثانية
const resetCooldownInterval = 5 * 60 * 1000; // فترة التحقق إذا ظلت جميع المنتجات غير متوفرة: 5 دقائق بالمللي ثانية

let productStatus = {};

urls.forEach(url => {
  productStatus[url] = { isAvailable: false, lastNotificationTime: 0, messageId: null, individualCooldownTime: 0, isNotifying: false };
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
        if (!productStatus[url].isAvailable && !productStatus[url].isNotifying) {
          const message = `*${productNameAr}* - متوفر الآن ✅ `;
          console.log(message);
          const replyMarkup = {
            inline_keyboard: [
              [
                { text: 'شراء سريع ⚡', url: 'https://www.dzrt.com/ar/onestepcheckout.html' },
                { text: 'إضافة للسلة 🛒', url: url }
              ],
              [
                { text: 'اعادة الطلب 🔁', url: 'https://www.dzrt.com/ar/sales/order/history/' }
              ]
            ]
          };

          // إرسال الإشعار للقناة الرئيسية
          const mainChannelMessage = await bot.sendPhoto(mainChannelId, imageUrl, {
            caption: message,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(replyMarkup)
          });

          // إرسال الإشعار للقناة الخاصة بالمنتج
          await bot.sendPhoto(channels[url].chatId, imageUrl, {
            caption: message,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(replyMarkup)
          });

          productStatus[url] = {
            isAvailable: true,
            lastNotificationTime: currentTime,
            messageId: mainChannelMessage.message_id,
            individualCooldownTime: currentTime,
            isNotifying: true // تعيين المنتج كقيد الإشعار لمنع تكرار الإشعارات
          };

          // تعيين مؤقت لإعادة تمكين الفحص بعد 10 دقائق
          setTimeout(() => {
            productStatus[url].isNotifying = false;
          }, productCooldown);
        }
      } else if (isUnavailable && productStatus[url].isAvailable) {
        // المنتج غير متوفر الآن ولكنه كان متوفرًا في الفحص السابق
        productStatus[url].isAvailable = false;
      } else if (!isUnavailable && productStatus[url].isAvailable) {
        // المنتج لا يزال متوفرًا ولكن لا يجب إرسال إشعار جديد
        productStatus[url].individualCooldownTime = currentTime; // تحديث وقت التهدئة الفردية
      }
    }
  } catch (error) {
  }
}

async function checkAllUrls() {
  const currentTime = new Date();
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();

  for (const url of urls) {
    // التحقق من أن الوقت الحالي ليس بين الساعة 11:56 و 11:58 للمنتج المحدد
    if (url === 'https://www.dzrt.com/ar/edgy-mint.html' && currentHour === 11 && currentMinute >= 56 && currentMinute <= 59) {
      continue;
    }

    if (!productStatus[url].isNotifying) { // التحقق من أن المنتج ليس قيد الإشعار
      await checkProductAvailability(url);
    }
  }
}

function resetCooldownsIfAllUnavailable() {
  const allUnavailable = Object.values(productStatus).every(status => !status.isAvailable);
  if (allUnavailable) {
    for (const url in productStatus) {
      productStatus[url].individualCooldownTime = 0; // إعادة تعيين وقت التهدئة الفردية
    }
  }
}

// جدولة الفحص ليعمل كل ثانية
cron.schedule('* * * * * *', () => {
  checkAllUrls();
});

// جدولة التحقق من حالة جميع المنتجات كل 5 دقائق
setInterval(() => {
  resetCooldownsIfAllUnavailable();
}, resetCooldownInterval);



const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT
};

// دالة تأخير باستخدام Promise
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkUserSubscriptions() {
  const currentDate = new Date().toISOString().split('T')[0];
  const query = 'SELECT id, expiryDate FROM users WHERE activated = true';
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    const [results] = await connection.query(query);
    const usersToUnban = results.filter(user => new Date(user.expiryDate) < new Date(currentDate));

    for (const user of usersToUnban) {
      const channelIds = [
        process.env.MAIN_CHANNEL_ID,
        process.env.CHAT_ID_ICY_RUSH,
        process.env.CHAT_ID_SEASIDE,
        process.env.CHAT_ID_SAMRA,
        process.env.CHAT_ID_HIGH,
        process.env.CHAT_ID_GARDEN,
        process.env.CHAT_ID_MINT,
        process.env.CHAT_ID_HAILA,
        process.env.CHAT_ID_PURPPLE,
        process.env.CHAT_ID_EDGY,
        process.env.CHAT_ID_TAMRA
      ];

      try {
        await unbanUserFromAllChannels(user.id, channelIds);

        // الانتظار لمدة 10 ثواني
        await delay(10000);

        const deactivateQuery = 'UPDATE users SET activated = 0 WHERE id = ?';
        await connection.query(deactivateQuery, [user.id]);
      } catch (error) {
        console.error(`Failed to remove user ${user.id} from all channels:`, error);
      }
    }
  } catch (err) {
    console.error('Error reading subscriptions from database:', err);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
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
    let connection;

    try {
      connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.query(query, [userId]);

      if (results.length > 0) {
        try {
          await approveJoinRequestWithDelay(channelId, userId);
        } catch (error) {
          console.error(`Failed to approve join request for user ${userId} in channel ${channelId}:`, error);
        }
      }
    } catch (err) {
      console.error('Error reading subscriptions from database:', err);
    } finally {
      if (connection) {
        await connection.end();
      }
    }
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
    }, 5000); // Adding a delay of 5 seconds
  });
}

bot.on('chat_join_request', (request) => {
  handleJoinRequests(request);
});

cron.schedule('31 2 * * *', () => {
  console.log('Running daily subscription check');
  checkUserSubscriptions();
});

