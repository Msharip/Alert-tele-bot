const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
const moment = require('moment-timezone');
const cloudscraper = require('cloudscraper'); // تأكد من تثبيت المكتبة عبر npm
require('dotenv').config();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const productNames = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush' },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد', en: 'seaside-frost' },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra' },
  'https://www.dzrt.com/ar/dzrt-samra-special-edition.html': { ar: 'سمرة - أصدار خاص', en: 'samra-ed' },
  'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist' },
  'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت', en: 'edgy-mint' },
  'https://www.dzrt.com/ar/tamra.html': { ar: 'تمرة', en: 'tamra' },
};

const urls = [
  'https://www.dzrt.com/ar/icy-rush.html',
  'https://www.dzrt.com/ar/seaside-frost.html',
  'https://www.dzrt.com/ar/tamra.html',
  'https://www.dzrt.com/ar/highland-berries.html',
  'https://www.dzrt.com/ar/garden-mint.html',
  'https://www.dzrt.com/ar/mint-fusion.html',
  'https://www.dzrt.com/ar/haila.html',
  'https://www.dzrt.com/ar/samra.html',
  'https://www.dzrt.com/ar/dzrt-samra-special-edition.html',
  'https://www.dzrt.com/ar/purple-mist.html',
  'https://www.dzrt.com/ar/edgy-mint.html',
];

const channels = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush', chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد', en: 'seaside-frost', chatId: process.env.CHAT_ID_SEASIDE },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries', chatId: process.env.CHAT_ID_HIGH },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint', chatId: process.env.CHAT_ID_GARDEN },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion', chatId: process.env.CHAT_ID_MINT },
  'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila', chatId: process.env.CHAT_ID_HAILA },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra', chatId: process.env.CHAT_ID_SAMRA },
  'https://www.dzrt.com/ar/dzrt-samra-special-edition.html': { ar: 'سمرةأصدار خاص', en: 'samra-ed', chatId: process.env.CHAT_ID_SAMRA },
  'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist', chatId: process.env.CHAT_ID_PURPPLE },
  'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت', en: 'edgy-mint', chatId: process.env.CHAT_ID_EDGY },
  'https://www.dzrt.com/ar/tamra.html': { ar: 'تمرة', en: 'tamra', chatId: process.env.CHAT_ID_TAMRA },
};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
  console.error(`Polling error: ${error.message}`);

  if (error.response && error.response.statusCode === 502) {
    setTimeout(() => {
      console.log('Retrying polling after 10 seconds due to 502 error...bot-');
      bot.startPolling();
    }, 10000);
  } else if (error.response && error.response.statusCode === 429) {
    const retryAfter = parseInt(error.response.headers['retry-after']) || 30;
    console.log(`Retrying polling after ${retryAfter} seconds due to 429 error...bot-`);
    setTimeout(() => {
      bot.startPolling();
    }, retryAfter * 1000);
  } else {
    setTimeout(() => {
      console.log('Retrying polling after 5 seconds due to other error... bot-');
      bot.startPolling();
    }, 5000);
  }
});


let lastLoginNotificationTime = {}; // كائن لتخزين وقت آخر إشعار لكل منتج
let loginNotificationLock = {}; // كائن لتخزين قفل إشعارات السعر لكل منتج
let previousPrices = {}; // كائن لتخزين الأسعار السابقة

const getPriceDetails = async (url) => {
  try {
    const pageContent = await cloudscraper.get(url);
    const priceMetaMatch = pageContent.match(/<meta property="product:price:amount" content="(\d+\.\d+|\d+)"/);
    const priceInfoMatch = pageContent.match(/"final_price":(\d+\.\d+|\d+)/);
    const gtagMatch = pageContent.match(/gtag\(\{event:'view_item',ecommerce : \{.*value: (\d+\.\d+|\d+)/);

    const priceMeta = priceMetaMatch ? parseFloat(priceMetaMatch[1]) : null;
    const priceInfo = priceInfoMatch ? parseFloat(priceInfoMatch[1]) : null;
    const gtagValue = gtagMatch ? parseFloat(gtagMatch[1]) : null;
/*
    console.log(`Meta price: ${priceMeta}`);
    console.log(`Final price: ${priceInfo}`);
    console.log(`Gtag value: ${gtagValue}`);
*/
    return {
      priceMeta,
      priceInfo,
      gtagValue
    };
  } catch (error) {
    return null;
  }
};

const checkForChange = async () => {
  const productUrls = ['https://www.dzrt.com/ar/icy-rush.html', 'https://www.dzrt.com/ar/seaside-frost.html'];

  for (const url of productUrls) {
    const details = await getPriceDetails(url);
    if (!details) continue;

    const currentTime = Date.now();

    // تحقق إذا كانت جميع الشروط متحققة لتغير السعر وإرسال الإشعار
    if ((!previousPrices[url] || previousPrices[url] === 0) &&
        details.priceMeta === 15 &&
        details.priceInfo === 15 &&
        details.gtagValue === 15 &&
        !loginNotificationLock[url] ) {  // تحقق إذا لم يكن هناك قفل للإشعار أو نفاد المنتج

      console.log(`السعر تغير من 0 إلى 15 للمنتج في الرابط: ${url}`);
      const message = 'المنتج على وشك التوفر , سجل دخول';

      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar/customer/account/login' }
            ]
          ]
        },
        parse_mode: 'Markdown'
      };

      try {
        await bot.sendMessage(channels[url].chatId, message, options);
        console.log(`تم إرسال الإشعار بنجاح إلى القناة: ${channels[url].chatId}`);

        lastLoginNotificationTime[url] = currentTime;
        loginNotificationLock[url] = true;  // قفل بعد إرسال إشعار تغير السعر

        // القفل يظل موجودًا حتى ينفد المنتج (لا يوجد مدة هنا، يتم فك القفل عند نفاد المنتج)
      } catch (error) {
        console.error(`Failed to send notification to ${channels[url].chatId}: ${error.message}`);
      }
    }

    // تحديث السعر السابق بعد الفحص
    previousPrices[url] = details.priceMeta;
  }
};


const productStatus = {};

urls.forEach(url => {
  productStatus[url] = {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false, // إضافة قفل للإشعار
  };
});

async function checkProductAvailability(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const isAvailable = $('div.stock.available span').length > 0; // تحقق إذا كان المنتج متوفر
    const currentTime = Date.now();

    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productNames[url].en}.png`);
      const localTime = moment(currentTime).tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
      const messageAvailable = `*${productNameAr}* - متوفر الآن ✅`;

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

      if (isAvailable && !productStatus[url].isAvailable && !productStatus[url].notificationLock) {
        // المنتج أصبح متاحًا
        console.log(`${productNameAr} ✅ - المنتج متوفر الآن`);

        productStatus[url].isAvailable = true;
        productStatus[url].isOutOfStockNotified = false; // إعادة تعيين إشعار النفاد عند توفر المنتج مجددًا
        productStatus[url].availableStartTime = currentTime;

        if (!productStatus[url].isNotifying) {
          productStatus[url].isNotifying = true;

          await bot.sendPhoto(mainChannelId, imageUrlAvailable, {
            caption: messageAvailable,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(replyMarkup)
          });

          await bot.sendPhoto(channels[url].chatId, imageUrlAvailable, {
            caption: messageAvailable,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(replyMarkup)
          });

          productStatus[url].isNotifying = false;
        }
      }

      const timeAvailable = currentTime - productStatus[url].availableStartTime;
      const minutesAvailable = Math.floor(timeAvailable / 60000);
      const secondsAvailable = Math.floor((timeAvailable % 60000) / 1000);
      const messageOutOfStock = `نفاذ المنتج *${productNameAr}* ❌ \n\nبقى متوفرا لمدة: ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;

      if (!isAvailable && productStatus[url].isAvailable && !productStatus[url].isOutOfStockNotified) {
        // المنتج نفد من المخزون
        console.log(`${productNameAr} ❌ - المنتج نفذ من المخزون`);

        productStatus[url].isAvailable = false;
        productStatus[url].isOutOfStockNotified = true; // تمييز أن إشعار النفاد قد تم إرساله

        if (!productStatus[url].isNotifying) {
          productStatus[url].isNotifying = true;

          await bot.sendMessage(channels[url].chatId, messageOutOfStock, { parse_mode: 'Markdown' });
          console.log(`إشعار النفاد تم إرساله للمنتج: ${productNameAr}`);

          productStatus[url].isNotifying = false;
        }

        // قفل إشعار التوفر لمدة دقيقة ونصف (90 ثانية)
        productStatus[url].notificationLock = true;
        setTimeout(() => {
          productStatus[url].notificationLock = false;
        }, 90000); // 90000 ميلي ثانية تعادل دقيقة ونصف
        
                // إضافة قفل لمدة 18 دقيقة بعد نفاد المنتج يمنع إشعارات السعر
                loginNotificationLock[url] = true;
                setTimeout(() => {
                  loginNotificationLock[url] = false;
                  console.log(`تم فك قفل إشعارات السعر بعد نفاد المنتج: ${productNameAr}`);
                }, 18 * 60 * 1000); // 18 دقائق

                
      }
    }
  } catch (error) {
  }
}

async function checkAllUrls() {
  for (const url of urls) {
    if (!productStatus[url].isNotifying) {
      await checkProductAvailability(url);
    }
  }
}


cron.schedule('* * * * * *', () => {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();

  // الفحص بين 9:01 صباحاً و11:55 مساءً
  if (
    (hour === 9 && minutes >= 1) ||  // يبدأ من 9:01 صباحاً
    (hour > 9 && hour < 23) ||       // يستمر حتى 11 مساءً
    (hour === 23 && minutes <= 55)   // يتوقف عند الساعة 11:55 مساءً
  ) {
    checkForChange();
  }

  // الفحص بين 12:01 صباحاً و6:00 صباحاً
  if (
    (hour === 0 && minutes >= 1) ||  // يبدأ من الساعة 12:01 صباحاً
    (hour > 0 && hour < 6) ||        // يستمر حتى 6:00 صباحاً
    (hour === 6 && minutes === 0)    // يتوقف عند 6:00 صباحاً
  ) {
    checkForChange();
  }
});


cron.schedule('* * * * * *', () => {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  // الفحص بين 09:03 صباحاً و6:00 صباحاً
  if ( (hour === 9 && minutes >= 3) || (hour > 9 || hour < 6) || (hour === 6 && minutes === 0)
  ) {
    checkAllUrls();
  }
});


const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 26, // الحد الأقصى لعدد الاتصالات في التجمع
  queueLimit: 0       // عدم وجود حد لطول قائمة الانتظار
};

// إنشاء مجموعة من الاتصالات
const pool = mysql.createPool(dbConfig);
const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES = 10000; // 10 ثواني تأخير بين الدفعات
const DELAY_BETWEEN_REMOVALS = 1000; // 1 ثانية تأخير بين عمليات الإزالة

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkUserSubscriptions() {
  const currentDate = new Date().toISOString().split('T')[0];
  const query = 'SELECT id, expiryDate FROM users WHERE activated = true';
  let connection;

  try {
    connection = await pool.getConnection();
    const [results] = await connection.query(query);
    const usersToUnban = results.filter(user => new Date(user.expiryDate) < new Date(currentDate));

    for (let i = 0; i < usersToUnban.length; i += BATCH_SIZE) {
      const batch = usersToUnban.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (user) => {
        const channelIds = [
          process.env.CHAT_ID_MAIN,
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
          await deactivateUserSubscription(user.id);
        } catch (error) {
          console.error(`Failed to process user ${user.id}:`, error);
        }
      }));

      // إضافة تأخير بين الدفعات
      await delay(DELAY_BETWEEN_BATCHES);
    }
  } catch (err) {
    console.error('Error reading subscriptions from database:', err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function unbanUserFromAllChannels(userId, channelIds) {
  for (const channelId of channelIds) {
    if (channelId) {
      try {
        await bot.unbanChatMember(channelId, userId);
        await delay(DELAY_BETWEEN_REMOVALS); // تأخير 1 ثانية بين عمليات الإزالة
      } catch (error) {
        if (error.response && error.response.body && error.response.body.description === 'Bad Request: PARTICIPANT_ID_INVALID') {
        } else {
          console.error(`Failed to unban user ${userId} from channel ${channelId}:`, error);
        }
      }
    }
  }
}

// تأكد من إنشاء مثيل البوت الفرعي مرة واحدة فقط
let subBot;
if (!subBot) {
  subBot = new TelegramBot(process.env.TOKEN4, { webHook: true });
}

async function deactivateUserSubscription(userId) {
  let connection;
  try {
    connection = await pool.getConnection();
    const deactivateQuery = 'UPDATE users SET activated = 0 WHERE id = ?';
    await connection.query(deactivateQuery, [userId]);

    const message = `
لقد انتهى اشتراكك.\n شكراً لاستخدامك خدمتنا.
يمكنك تجديد الاشتراك للاستمرار في الاستفادة من الميزات المتاحة.

قم بزيارة الموقع للاشتراك 👇🏻 :
https://www.dzrtgg.com

طريق التفعيل بنفس تفعيلك السابق.
اضغط على /start للإرسال القائمه
    `;

    try {
      await subBot.sendMessage(userId, message);
    } catch (err) {
      if (err.code === 'ETELEGRAM' && err.response.body.description.includes('bot was blocked by the user')) {
        console.log(`User ${userId} has blocked the bot.`);
      } else {
        console.error('Failed to send subscription end message to user:', err);
      }
    }

  } catch (err) {
    console.error('Error deactivating subscription:', err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}


async function handleJoinRequests(request) {
  if (request) {
    const userId = request.user_chat_id;
    const channelId = request.chat.id;
    const query = 'SELECT id FROM users WHERE id = ? AND activated = true';
    let connection;

    try {
      connection = await pool.getConnection();
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
        connection.release();
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
    }, 5000); // إضافة تأخير قدره 5 ثواني
  });
}

bot.on('chat_join_request', (request) => {
  handleJoinRequests(request);
});

cron.schedule('28 0 * * *', () => {
  console.log("Running Sub Check")
  checkUserSubscriptions();
});