const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
const cloudscraper = require('cloudscraper');
require('dotenv').config();

const env = {
  CHAT_ID_ICY_RUSH: process.env.CHAT_ID_ICY_RUSH,
  CHAT_ID_SEASIDE: process.env.CHAT_ID_SEASIDE,
  CHAT_ID_GARDEN: process.env.CHAT_ID_GARDEN,
  CHAT_ID_MINT: process.env.CHAT_ID_MINT,
  CHAT_ID_HAILA: process.env.CHAT_ID_HAILA,
  CHAT_ID_PURPLE: process.env.CHAT_ID_PURPLE,
  CHAT_ID_TAMRA: process.env.CHAT_ID_TAMRA,
  CHAT_ID_SAMRA: process.env.CHAT_ID_SAMRA,
  CHAT_ID_MAIN: process.env.CHAT_ID_MAIN,
  TOKEN3: process.env.TOKEN3,
};
// تعريف المنتجات
const productNames = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { ar: 'آيسي رش', en: 'icy-rush' },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { ar: 'سي سايد', en: 'seaside-frost' },
  'https://www.dzrt.com/en-sa/products/garden-mint': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/en-sa/products/mint-fusion': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/en-sa/products/hamidh': { ar: 'حامض', en: 'Hamidh' },
  'https://www.dzrt.com/en-sa/products/unqood': { ar: 'عنقود', en: 'Unqood' },
  'https://www.dzrt.com/en-sa/products/manga': { ar: 'منقا', en: 'Manga' },
  'https://www.dzrt.com/en-sa/products/bonna': { ar: 'بنه', en: 'Bonna' },
};

const channels = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { chatId: env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { chatId: env.CHAT_ID_SEASIDE },
  'https://www.dzrt.com/en-sa/products/garden-mint': { chatId: env.CHAT_ID_GARDEN },
  'https://www.dzrt.com/en-sa/products/mint-fusion': { chatId: env.CHAT_ID_MINT },
  'https://www.dzrt.com/en-sa/products/hamidh': { chatId: env.CHAT_ID_HAILA },
  'https://www.dzrt.com/en-sa/products/unqood': { chatId: env.CHAT_ID_PURPLE },
  'https://www.dzrt.com/en-sa/products/manga': { chatId: env.CHAT_ID_TAMRA },
  'https://www.dzrt.com/en-sa/products/bonna': { chatId: env.CHAT_ID_SAMRA },
};

const mainChannelId = env.CHAT_ID_MAIN;
const token = env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });

// تخزين حالة المنتجات
const productStatus = new Map();

Object.keys(productNames).forEach(productUrl => {
  productStatus.set(productUrl, {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false,
  });
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
  //  console.error(`حدث خطأ أثناء جلب تفاصيل المخزون لـ ${url}:`, error.message);
    return null;
  }
};

// دالة لإرسال الإشعارات
const sendNotification = async (chatId, imageUrl, message, replyMarkup = null) => {
  try {
    await bot.sendPhoto(chatId, imageUrl, {
      caption: message,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
    });
  } catch (error) {
  //  console.error(`حدث خطأ أثناء إرسال الإشعار لـ ${chatId}:`, error.message);
  }
};

// دالة لفحص توفر المنتجات
const checkProductPages = async () => {
  const currentTime = Date.now();

  const productChecks = Object.entries(productNames).map(async ([url, productInfo]) => {
    try {
      const inventoryQuantity = await getInventoryDetails(url);
      const isAvailable = inventoryQuantity !== null && inventoryQuantity > 0;
      const status = productStatus.get(url);

      if (isAvailable) {
        const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productInfo.en}.png`);

        const messageAvailable = `*${productInfo.ar}* - متوفر الآن ✅`;
        const replyMarkup = {
          inline_keyboard: [
            [
              { text: 'شراء سريع ⚡', url: 'https://www.dzrt.com/ar-sa/checkout' },
              { text: 'المنتـج 🟢', url: url.replace('/en-sa/', '/ar-sa/') },
            ],
            [
              { text: 'المنتجات 🛒', url: 'https://www.dzrt.com/ar-sa/products' },
              { text: 'إعادة الطلب 🔁', url: 'https://www.dzrt.com/ar-sa/profile/orders' },
            ],
            [
              { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar-sa/login' },
            ],
          ],
        };

        if (!status.isAvailable && !status.notificationLock) {
          console.log(`${productInfo.ar} ✅ - المنتج متوفر الآن`);

          status.isAvailable = true;
          status.isOutOfStockNotified = false;
          status.availableStartTime = currentTime;

          if (!status.isNotifying) {
            status.isNotifying = true;

            await sendNotification(channels[url].chatId, imageUrlAvailable, messageAvailable, replyMarkup);
            await sendNotification(mainChannelId, imageUrlAvailable, messageAvailable, replyMarkup);

            status.isNotifying = false;
          }
        }
      } else {
        if (status.isAvailable && !status.isOutOfStockNotified) {
          const timeAvailable = currentTime - status.availableStartTime;
          const hoursAvailable = Math.floor(timeAvailable / (1000 * 60 * 60));
          const minutesAvailable = Math.floor((timeAvailable % (1000 * 60 * 60)) / (1000 * 60));
          const secondsAvailable = Math.floor((timeAvailable % (1000 * 60)) / 1000);

          let messageOutOfStock = `نفذ المنتج *${productInfo.ar}* ❌\nبقي متوفرًا لمدة: `;

          if (hoursAvailable > 0) {
            messageOutOfStock += `${hoursAvailable} ساعات و ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;
          } else if (minutesAvailable > 0) {
            messageOutOfStock += `${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;
          } else {
            messageOutOfStock += `${secondsAvailable} ثواني فقط.`;
          }

          console.log(`${productInfo.ar} ❌ - المنتج نفذ من المخزون`);

          status.isAvailable = false;
          status.isOutOfStockNotified = true;

          if (!status.isNotifying) {
            status.isNotifying = true;

            const imageUrlOutOfStock = path.join(__dirname, '..', 'images', `${productInfo.en}-outofstock.png`);
            await sendNotification(channels[url].chatId, imageUrlOutOfStock, messageOutOfStock);

            status.isNotifying = false;
          }

          status.notificationLock = true;
          setTimeout(() => {
            status.notificationLock = false;
          }, 5000); // مدة القفل 5 ثوانٍ
        }
      }
    } catch (error) {
    //  console.error(`حدث خطأ أثناء فحص المنتج ${url}:`, error.message);
    }
  });

  await Promise.all(productChecks);
};

// بدء المراقبة
const monitorAvailability = async () => {
  while (true) {
    try {
      await checkProductPages();
    } catch (error) {
   //   console.error("حدث خطأ أثناء مراقبة توفر المنتجات:", error.message);
    } finally {
      await new Promise(resolve => setTimeout(resolve, 1000)); // تأخير بسيط قبل إعادة المحاولة
    }
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
        if (error.response && error.response.body && error.response.body.description === 'Bad Request: PARTICIPANT_ID_INVALID') {
 //         console.log(`User ${userId} is not a participant in channel ${channelId}.`);
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