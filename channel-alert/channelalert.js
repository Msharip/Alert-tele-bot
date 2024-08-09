const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
const moment = require('moment-timezone');
require('dotenv').config();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const productNames = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush' },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost' },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra' },
  'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist' },
  'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت', en: 'edgy-mint' },
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
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries', chatId: process.env.CHAT_ID_HIGH },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint', chatId: process.env.CHAT_ID_GARDEN },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion', chatId: process.env.CHAT_ID_MINT },
  'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila', chatId: process.env.CHAT_ID_HAILA },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra', chatId: process.env.CHAT_ID_SAMRA },
  'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist', chatId: process.env.CHAT_ID_PURPPLE },
  'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت', en: 'edgy-mint', chatId: process.env.CHAT_ID_EDGY },
  'https://www.dzrt.com/ar/tamra.html': { ar: 'تمرة', en: 'tamra', chatId: process.env.CHAT_ID_TAMRA }
};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
  console.error(`Polling error: ${error.message}`);

  if (error.response && error.response.statusCode === 502) {
    setTimeout(() => {
      console.log('Retrying polling after 10 seconds due to 502 error...bot-1');
      bot.startPolling();
    }, 10000);
  } else if (error.response && error.response.statusCode === 429) {
    const retryAfter = parseInt(error.response.headers['retry-after']) || 30;
    console.log(`Retrying polling after ${retryAfter} seconds due to 429 error...bot-1`);
    setTimeout(() => {
      bot.startPolling();
    }, retryAfter * 1000);
  } else {
    setTimeout(() => {
      console.log('Retrying polling after 5 seconds due to other error... bot-1');
      bot.startPolling();
    }, 5000);
  }
});

const productCooldown = 20 * 60 * 1000; // فترة التهدئة الفردية (20 دقيقة)
let firstNotificationSaved = false; // متغير للتحقق مما إذا تم حفظ أول إشعار أم لا
let priceAlertSent = false; // متغير للتحقق مما إذا تم إرسال إشعار تغير السعر أم لا

const productStatus = {};

urls.forEach(url => {
  productStatus[url] = {
    isAvailable: false,
    lastNotificationTime: 0,
    isNotifying: false,
    isOutOfStockNotified: false,
    individualCooldownTime: 0,
    outOfStockStartTime: null
  };
});

let previousPrices = {};

// الحصول على قيمة السعر للمنتج المحدد
const getPriceValue = async (url) => {
  try {
    const response = await axios.get(url);
    const pageContent = response.data;

    const priceMatch = pageContent.match(/<meta property="product:price:amount" content="(\d+\.\d+|\d+)"/);

    if (priceMatch && priceMatch[1]) {
      return parseFloat(priceMatch[1]);
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
};
// الحصول على الأسعار الأولية لجميع المنتجات
const initializePrices = async () => {
  for (const url of urls) {
    const price = await getPriceValue(url);
    previousPrices[url] = price !== null ? price : 0;
    console.log(`Initial price for ${url}: ${previousPrices[url]}`);
  }
};
async function checkProductAvailability(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const isUnavailable = $('div.stock.unavailable span').length > 0;
    const currentTime = Date.now();

    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productNames[url].en}.png`);

      if (!isUnavailable && !productStatus[url].isAvailable && (currentTime - productStatus[url].individualCooldownTime > productCooldown)) {
        const localTime = moment(currentTime).tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
        const message = `*${productNameAr}* - متوفر الآن ✅`;
        console.log(`*${productNameAr}* - متوفر الآن ✅`);

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

        await bot.sendPhoto(mainChannelId, imageUrlAvailable, {
          caption: message,
          parse_mode: 'Markdown',
          reply_markup: JSON.stringify(replyMarkup)
        });

        await bot.sendPhoto(channels[url].chatId, imageUrlAvailable, {
          caption: message,
          parse_mode: 'Markdown',
          reply_markup: JSON.stringify(replyMarkup)
        });

        productStatus[url] = {
          isAvailable: true,
          lastNotificationTime: currentTime,
          isNotifying: true,
          isOutOfStockNotified: false,
          individualCooldownTime: currentTime
        };

        setTimeout(() => {
          productStatus[url].isNotifying = false;
        }, productCooldown);

        if (!firstNotificationSaved) {
          // إضافة وقت أول إشعار إلى قاعدة البيانات لأول منتج فقط
          const connection = await pool.getConnection();
          try {
            const query = 'INSERT INTO product_notifications (product_url, notification_time) VALUES (?, ?)';
            await connection.query(query, [url, localTime]);
            firstNotificationSaved = true; // تعيين المتغير بعد حفظ أول إشعار
          } finally {
            connection.release();
          }
        }
      } else if (isUnavailable && productStatus[url].isAvailable) {
        // إذا كان المنتج غير متوفر وكان متاحاً سابقاً
        productStatus[url].isAvailable = false;
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
// جدولة تهيئة الأسعار الأولية بين الساعة 13:00 والساعة 23:00 يوميا
cron.schedule('0 13 * * *', async () => {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 13 && hour <= 17) {
    await initializePrices();
    console.log('تم تهيئة الأسعار الأولية بنجاح.');
  }
});

// جدولة التحقق من توفر المنتج كل ثانية بين الساعة 13:00 والساعة 23:00
cron.schedule('* * * * * *', () => {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 13 && hour <= 23) {
    checkAllUrls();
  }
});

// جدولة التحقق من تغير السعر كل دقيقة بين الساعة 13:00 والساعة 23:00
cron.schedule('* * * * *', () => {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 13 && hour <= 17) {
    checkForChange();
  }
});

const checkForChange = async () => {
  if (priceAlertSent) return; // إذا تم إرسال الإشعار بالفعل، لا تقم بفحص التغيرات مرة أخرى

  for (const url of urls) {
    const newPrice = await getPriceValue(url);
    if (newPrice === null) continue;

    if ((!previousPrices[url] || previousPrices[url] === 0) && newPrice === 15) {
      console.log(`السعر تغير من 0 إلى 15 للمنتج في الرابط: ${url}`);
      const message = 'المنتجات على وشك التوفر , أستعد لتسجيل الدخول';
      await sendNotification(message);

      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar/customer/account/login' }
            ]
          ]
        }
      };

      try {
        await bot.sendMessage(mainChannelId, message, options);
      } catch (error) {
        console.error(`Failed to send notification to main channel ${mainChannelId}: ${error.message}`);
      }

      for (const url of urls) {
        try {
          await bot.sendMessage(channels[url].chatId, message, options);
        } catch (error) {
          console.error(`Failed to send notification to ${channels[url].chatId}: ${error.message}`);
        }
      }

      priceAlertSent = true; // تعيين المتغير بعد إرسال أول إشعار
      break; // أرسل الإشعار مرة واحدة فقط
    }

    previousPrices[url] = newPrice;
  }
};

const sendNotification = async (message) => {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar/customer/account/login' }
        ]
      ]
    }
  };

  try {
    await bot.sendMessage(mainChannelId, message, options);
  } catch (error) {
    console.error(`Failed to send notification: ${error.message}`);
  }
};

// استدعاء دالة التهيئة عند بدء التشغيل
(async () => {
  await initializePrices();
  console.log('تم تهيئة الأسعار الأولية بنجاح عند بدء التشغيل.');
  checkAllUrls();
})();


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

async function deactivateUserSubscription(userId) {
  let connection;
  try {
    connection = await pool.getConnection();
    const deactivateQuery = 'UPDATE users SET activated = 0 WHERE id = ?';
    await connection.query(deactivateQuery, [userId]);
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

// جدولة إعادة التحقق من الاشتراكات يوميًا عند الساعة 12:00 بعد منتصف الليل
cron.schedule('0 0 * * *', () => {
  checkUserSubscriptions();
});