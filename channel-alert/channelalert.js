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
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد', en: 'seaside-frost' },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra' },
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

const productCooldown = 9 * 60 * 1000; // فترة التهدئة الفردية (25 دقيقة)
let firstNotificationSaved = false; // متغير للتحقق مما إذا تم حفظ أول إشعار أم لا

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
    console.log(`price for ${url}: ${previousPrices[url]}`);
  }
};

const loginNotificationCooldown = 18 * 60 * 1000; // 25 دقائق
let lastLoginNotificationTime = {}; // كائن لتخزين وقت آخر إشعار لكل منتج

const checkForChange = async () => {
  for (const url of ['https://www.dzrt.com/ar/icy-rush.html', 'https://www.dzrt.com/ar/seaside-frost.html']) {
    const newPrice = await getPriceValue(url);
    if (newPrice === null) continue;

    const currentTime = Date.now();

    // تحقق إذا كان السعر تغير من 0 إلى 15 وأرسل الإشعار إذا لم يكن هناك إشعار خلال فترة التهدئة الخاصة بالمنتج
    if ((!previousPrices[url] || previousPrices[url] === 0) && newPrice === 15) {
      if (!lastLoginNotificationTime[url] || currentTime - lastLoginNotificationTime[url] > loginNotificationCooldown) {
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
          parse_mode: 'Markdown' // لضمان تنسيق النص في الرسالة
        };

        try {
          await bot.sendMessage(channels[url].chatId, message, options);
          console.log(`تم إرسال الإشعار بنجاح إلى القناة: ${channels[url].chatId}`);
          lastLoginNotificationTime[url] = currentTime; // تحديث وقت آخر إشعار تسجيل دخول لهذا المنتج
        } catch (error) {
          console.error(`Failed to send notification to ${channels[url].chatId}: ${error.message}`);
        }
      } else {
        console.log(`تم تجاوز إشعار تسجيل الدخول للمنتج في الرابط ${url} بسبب فترة التهدئة.`);
      }
    }

    // تحديث السعر السابق بعد الفحص
    previousPrices[url] = newPrice;
  }
};


// استدعاء دالة التهيئة عند بدء التشغيل
(async () => {
  await initializePrices();
  console.log('تم تهيئة الأسعار الأولية بنجاح عند بدء التشغيل.');
  checkAllUrls();
})();

async function checkProductAvailability(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const isUnavailable = $('div.stock.unavailable span').length > 0;
    const currentTime = Date.now();

    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productNames[url].en}.png`);

      // تحقق من أن المنتج متاح حاليًا وأن فترة التهدئة قد انقضت وأنه لم يتم إرسال إشعار بعد
      if (!isUnavailable && !productStatus[url].isAvailable && !productStatus[url].isNotifying && (currentTime - productStatus[url].individualCooldownTime > productCooldown)) {
        productStatus[url].isNotifying = true;  // تفعيل القفل لمنع إرسال إشعارات متكررة

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

        // إرسال الإشعار
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

        // تحديث حالة المنتج
        productStatus[url].isAvailable = true;
        productStatus[url].lastNotificationTime = currentTime;
        productStatus[url].individualCooldownTime = currentTime;

        // إزالة القفل بعد فترة التهدئة
        setTimeout(() => {
          productStatus[url].isNotifying = false;
        }, productCooldown);

        if (!firstNotificationSaved) {
          const connection = await pool.getConnection();
          try {
            const query = 'INSERT INTO product_notifications (product_url, notification_time) VALUES (?, ?)';
            await connection.query(query, [url, localTime]);
            firstNotificationSaved = true;
          } finally {
            connection.release();
          }
        }
      } else if (isUnavailable) {
        // إذا كان المنتج غير متوفر، تحديث الحالة إلى غير متاح
        productStatus[url].isAvailable = false;
        productStatus[url].isNotifying = false; // تأكد من إلغاء القفل إذا لم يكن المنتج متاحًا
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

// جدولة تهيئة الأسعار الأولية بين الساعة 10:00 الى 10:45 يوميا
cron.schedule('00 09 * * *', async () => {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 9 && (hour < 22 || (hour === 22 && minutes <= 45))) {
    await initializePrices();
    console.log('تم تهيئة الأسعار الأولية بنجاح.');
  }
});

// جدولة التحقق من توفر المنتج كل ثانية بين الساعة 09:03 الى 11:53
cron.schedule('* * * * * *', () => {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  if ((hour === 9 && minutes >= 3) || (hour > 9 && hour < 23) || (hour === 23 && minutes <= 53)) {
    checkAllUrls();
  }
});


// جدولة التحقق من تغير السعر كل 5 ثانية بين الساعة 09:01 الى 11:50
cron.schedule('*/5 * * * * *', () => {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  if ((hour === 9 && minutes >= 1) || (hour > 9 && hour < 23) || (hour === 23 && minutes <= 50)) {
    checkForChange();
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

async function deactivateUserSubscription(userId) {
  let connection;
  try {
    connection = await pool.getConnection();
    const deactivateQuery = 'UPDATE users SET activated = 0 WHERE id = ?';
    await connection.query(deactivateQuery, [userId]);

    // إعداد البوت الفرعي باستخدام TOKEN4
    const subBot = new TelegramBot(process.env.TOKEN4);

    // إرسال إشعار انتهاء الاشتراك للمستخدم مباشرة عبر البوت الفرعي
    const message = `
لقد انتهى اشتراكك.\n شكراً لاستخدامك خدمتنا.
يمكنك تجديد الاشتراك للاستمرار في الاستفادة من الميزات المتاحة.

قم بزيارة الموقع للاشتراك 👇🏻 :
https://www.dzrtgg.com

طريق التفعيل بنفس تفعيلك السابق.

اضغط على /start لاارسال القائمه مره اخرى 
    `;

    try {
      await subBot.sendMessage(userId, message);
    } catch (err) {
      if (err.code === 'ETELEGRAM' && err.response.body.description.includes('bot was blocked by the user')) {
        console.log(`User ${userId} has blocked the bot.`);
        // يمكنك هنا تسجيل الخطأ أو تجاهله بناءً على الحاجة
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

cron.schedule('0 0 * * *', () => {
  console.log("Running Sub Check")
  checkUserSubscriptions();
});