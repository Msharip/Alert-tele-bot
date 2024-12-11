const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
const cloudscraper = require('cloudscraper'); // تأكد من تثبيت المكتبة عبر npm
require('dotenv').config();

// دالة تأخير لتنفيذ الفاصل الزمني بين كل منتج
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// دالة تأخير لتنفيذ الفاصل الزمني بين كل منتج
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// تعريف المنتجات
const productNames = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { ar: 'آيسي رش', en: 'icy-rush' },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { ar: 'سي سايد', en: 'seaside-frost' },
  // يمكنك إضافة منتجات أخرى هنا...
};

const channels = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { chatId: process.env.CHAT_ID_SEASIDE },
  // تأكد من إضافة chatId لكل منتج
};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });

// تخزين حالة المنتجات
const productStatus = {};

Object.keys(productNames).forEach(productUrl => {
  productStatus[productUrl] = {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false
  };
});

// دالة لجلب تفاصيل `inventory_quantity` من صفحة المنتج
const getInventoryDetails = async (url) => {
  try {
    const pageContent = await cloudscraper.get(url);
    const $ = cheerio.load(pageContent);
    let inventoryQuantity = null;

    $('script').each((i, script) => {
      const scriptContent = $(script).html();

      if (scriptContent.includes('inventory_quantity')) {
        const parts = scriptContent.split('inventory_quantity');
        if (parts.length > 1) {
          const afterInventory = parts[1];
          const match = afterInventory.match(/:\s*(-?\d+)/);
          if (match) {
            inventoryQuantity = parseInt(match[1]);
          }
        }
      }
    });

    return inventoryQuantity;
  } catch (error) {
    return null;
  }
};

// دالة لفحص توفر المنتجات
const checkProductPages = async () => {
  const currentTime = Date.now();

  for (const [url, productInfo] of Object.entries(productNames)) {
    try {
      // التحقق من توفر المنتج من خلال المخزون
      const inventoryQuantity = await getInventoryDetails(url);
      const isAvailable = inventoryQuantity !== null && inventoryQuantity > 0;

      if (isAvailable) {
        const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productInfo.en}.png`);

        const messageAvailable = `
*${productInfo.ar}* - متوفر الآن ✅
        `;
        const replyMarkup = {
          inline_keyboard: [
            [
              { text: 'شراء سريع ⚡', url: 'https://www.dzrt.com/ar-sa/checkout' },
              { text: 'المنتـج 🟢', url: url.replace('/en-sa/', '/ar-sa/') }
            ],
            [
              { text: 'المنتجات 🛒', url: 'https://www.dzrt.com/ar-sa/products' },
              { text: 'إعادة الطلب 🔁', url: 'https://www.dzrt.com/ar-sa/profile/orders' }
            ],
            [
              { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar-sa/login' }
            ]
          ]
        };

        // إرسال الإشعار للمستخدمين
        if (!productStatus[url].isAvailable && !productStatus[url].notificationLock) {
          console.log(`${productInfo.ar} ✅ - المنتج متوفر الآن`);

          productStatus[url].isAvailable = true;
          productStatus[url].isOutOfStockNotified = false;
          productStatus[url].availableStartTime = currentTime;

          if (!productStatus[url].isNotifying) {
            productStatus[url].isNotifying = true;

            await bot.sendPhoto(channels[url].chatId, imageUrlAvailable, {
              caption: messageAvailable,
              parse_mode: 'Markdown',
              reply_markup: JSON.stringify(replyMarkup)
            });

            await bot.sendPhoto(mainChannelId, imageUrlAvailable, {
              caption: messageAvailable,
              parse_mode: 'Markdown',
              reply_markup: JSON.stringify(replyMarkup)
            });

            productStatus[url].isNotifying = false;
          }
        }
      } else {
        // تحقق إذا كان المنتج غير متوفر بعد أن كان متوفرًا
        if (productStatus[url].isAvailable && !productStatus[url].isOutOfStockNotified) {
          const timeAvailable = currentTime - productStatus[url].availableStartTime;
          const hoursAvailable = Math.floor(timeAvailable / (1000 * 60 * 60));
          const minutesAvailable = Math.floor((timeAvailable % (1000 * 60 * 60)) / (1000 * 60));
          const secondsAvailable = Math.floor((timeAvailable % (1000 * 60)) / 1000);

          // إنشاء رسالة بناءً على المدة المتوفرة
          let messageOutOfStock = `نفذ المنتج *${productInfo.ar}* ❌\nبقي متوفرًا لمدة: `;

          if (hoursAvailable > 0) {
            messageOutOfStock += `${hoursAvailable} ساعات و ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;
          } else if (minutesAvailable > 0) {
            messageOutOfStock += `${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;
          } else {
            messageOutOfStock += `${secondsAvailable} ثواني فقط.`;
          }

          console.log(`${productInfo.ar} ❌ - المنتج نفذ من المخزون`);

          productStatus[url].isAvailable = false;
          productStatus[url].isOutOfStockNotified = true;

          if (!productStatus[url].isNotifying) {
            productStatus[url].isNotifying = true;

            const imageUrlOutOfStock = path.join(__dirname, '..', 'images', `${productInfo.en}-outofstock.png`);

            // إرسال الصورة مع رسالة النفاد
            await bot.sendPhoto(channels[url].chatId, imageUrlOutOfStock, {
              caption: messageOutOfStock,
              parse_mode: 'Markdown'
            });

            productStatus[url].isNotifying = false;
          }

          // قفل لإيقاف إرسال الإشعارات لمدة محددة
          productStatus[url].notificationLock = true;
          setTimeout(() => {
            productStatus[url].notificationLock = false;
          }, 5000); // مدة القفل 5 ثوانٍ
        }
      }

      // إضافة تأخير قبل الانتقال للمنتج التالي
      await delay(500); // تأخير بسيط بين المنتجات

    } catch (error) {
      // يمكنك تفعيل السطر أدناه لعرض الأخطاء
      // console.error(`حدث خطأ أثناء فحص المنتج ${url}:`, error.message);
    }
  }
};

// بدء المراقبة
const monitorAvailability = async () => {
  try {
    await checkProductPages();
  } catch (error) {
    console.error("حدث خطأ أثناء مراقبة توفر المنتجات:", error.response ? error.response.data : error.message);
  } finally {
    // نستخدم setTimeout لإعادة استدعاء الدالة بعد 1 ثانية
    setTimeout(monitorAvailability, 1000);
  }
};

monitorAvailability();



// إعدادات قاعدة البيانات
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 26,
  queueLimit: 0
};

// إنشاء مجموعة اتصالات
const pool = mysql.createPool(dbConfig);
const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES = 10000; // تأخير 10 ثوانٍ بين الدفعات
const DELAY_BETWEEN_REMOVALS = 2000; // تأخير 2 ثانية بين عمليات الإزالة

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// إنشاء مثيل البوت الفرعي إذا لم يكن موجودًا
let subBot;
if (!subBot) {
  subBot = new TelegramBot(process.env.TOKEN5, { webHook: true });
}

// دالة للتحقق من اشتراكات المستخدمين
async function checkUserSubscriptions() {
  const currentDate = new Date();
  const query = 'SELECT id, expiryDate FROM users WHERE activated = true'; // تأكد من أن الحقل 'notified' غير موجود هنا
  let connection;

  try {
    connection = await pool.getConnection();
    const [results] = await connection.query(query);

    const usersToUnban = [];
    const usersToNotify = [];

    for (const user of results) {
      const expiryDate = new Date(user.expiryDate);
      const timeDiff = expiryDate - currentDate;
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      if (expiryDate < currentDate) {
        // الاشتراك منتهي
        usersToUnban.push(user);
      } else if (daysDiff <= 2) {
        // الاشتراك سينتهي خلال يومين أو أقل
        usersToNotify.push(user);
      }
    }

    // إرسال إشعارات للمستخدمين الذين سينتهي اشتراكهم قريبًا
    for (let i = 0; i < usersToNotify.length; i += BATCH_SIZE) {
      const batch = usersToNotify.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (user) => {
        try {
          await notifyUserSubscriptionEndingSoon(user.id, user.expiryDate);
        } catch (error) {
          console.error(`Failed to notify user ${user.id}:`, error);
        }
      }));

      // إضافة تأخير بين الدفعات
      await delay(DELAY_BETWEEN_BATCHES);
    }

    // إزالة المستخدمين الذين انتهت اشتراكاتهم
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


// دالة لإرسال رسالة تنبيهية للمستخدم بقرب انتهاء الاشتراك
async function notifyUserSubscriptionEndingSoon(userId, expiryDate) {
  const formattedDate = new Date(expiryDate).toLocaleDateString('ar-EG', { timeZone: 'Asia/Riyadh' });

  const message = `
تنبيه: اشتراكك سينتهي قريبًا بتاريخ ${formattedDate}.\n
قم بتمديد اشتراكك الحالي لتجنب الإزالة من قنوات التنبيهات.\n
www.dzrtgg.com
  `;

  try {
    await subBot.sendMessage(userId, message);
  } catch (err) {
    if (err.code === 'ETELEGRAM' && err.response.body.description.includes('bot was blocked by the user')) {
      console.log(`User ${userId} has blocked the bot.`);
    } else {
      console.error('Failed to send subscription ending soon message to user:', err);
    }
  }
}


// دالة لإزالة المستخدم من جميع القنوات
async function unbanUserFromAllChannels(userId, channelIds) {
  for (const channelId of channelIds) {
    if (channelId) {
      try {
        await bot.unbanChatMember(channelId, userId);
        await delay(DELAY_BETWEEN_REMOVALS);
      } catch (error) {
        if (error.response && error.response.body && error.response.body.description === 'Bad Request: USER_ID_INVALID') {
          console.log(`User ${userId} is not a participant in channel ${channelId}.`);
        } else {
          console.error(`Failed to unban user ${userId} from channel ${channelId}:`, error);
        }
      }
    }
  }
}

// دالة لتعطيل اشتراك المستخدم وإرسال رسالة انتهاء الاشتراك
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

طريقة التفعيل بنفس تفعيلك السابق.
اضغط على /start لإرسال القائمة.
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

// دالة لمعالجة طلبات الانضمام
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

// دالة للموافقة على طلب الانضمام مع تأخير
async function approveJoinRequestWithDelay(channelId, userId) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await bot.approveChatJoinRequest(channelId, userId);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 5000); // تأخير 5 ثوانٍ
  });
}

// استقبال حدث طلبات الانضمام
bot.on('chat_join_request', (request) => {
  handleJoinRequests(request);
});

// جدولة التحقق من الاشتراكات يوميًا
cron.schedule('30 1 * * *', () => {
  console.log("Running Subscription Check");
  checkUserSubscriptions();
});