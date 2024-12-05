const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
const moment = require('moment-timezone');
const cloudscraper = require('cloudscraper'); // تأكد من تثبيت المكتبة عبر npm
require('dotenv').config();

// دالة تأخير لتنفيذ الفاصل الزمني بين كل منتج
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const productNames = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { ar: 'آيسي رش', en: 'icy-rush', checkInventory: true },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { ar: 'سي سايد', en: 'seaside-frost', checkInventory: false },
 // 'https://www.dzrt.com/en-sa/products/tamra': { ar: 'تمرة', en: 'tamra', checkInventory: false  },

};

const channels = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { chatId: process.env.CHAT_ID_SEASIDE },
//  'https://www.dzrt.com/en-sa/products/tamra': { chatId: process.env.CHAT_ID_TAMRA },


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
        const match = scriptContent.match(/"inventory_quantity":(\d+)/);
        if (match && match[1]) {
          inventoryQuantity = parseInt(match[1]);
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
      const pageContent = await cloudscraper.get(url);
      const $ = cheerio.load(pageContent);

      let isAvailable = false;

      if (productInfo.checkInventory) {
        // التحقق من توفر المنتج من خلال المخزون
        const inventoryQuantity = await getInventoryDetails(url);
        isAvailable = inventoryQuantity !== null && inventoryQuantity > 0;
      } else {
        // التحقق من توفر المنتج من خلال عدم وجود عبارة "OUT OF STOCK"
        const isOutOfStock = $('span:contains("OUT OF STOCK")').length > 0;
        isAvailable = !isOutOfStock;
      }

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
          let messageOutOfStock = `نفذ المنتج *${productInfo.ar}* ❌\ متوفرًا لمدة: `;

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


const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 26, // الحد الأقصى لعدد الاتصالات
  queueLimit: 0       // عدم وجود حد لطول قائمة الانتظار
};

// إنشاء مجموعة اتصالات
const pool = mysql.createPool(dbConfig);
const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES = 10000; // تأخير 10 ثواني بين الدفعات
const DELAY_BETWEEN_REMOVALS = 2000; // تأخير 1 ثانية بين عمليات الإزالة

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
 //         console.log(`User ${userId} is not a participant in channel ${channelId}.`);
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
  subBot = new TelegramBot(process.env.TOKEN5, { webHook: true });
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

cron.schedule('30 0 * * *', () => {
  console.log("Running Sub Check");
  checkUserSubscriptions();
});