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

const productNames = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { ar: 'آيسي رش', en: 'icy-rush' },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { ar: 'سي سايد', en: 'seaside-frost' },
  // أضف بقية المنتجات إذا رغبت
};

const channels = {
  'https://www.dzrt.com/en-sa/products/icy-rush': { chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/en-sa/products/seaside-frost': { chatId: process.env.CHAT_ID_SEASIDE },
  // أضف بقية المنتجات إذا رغبت
};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });
let previousUpdatedAt = {}; // لتخزين قيم updated_at لكل منتج
let isInitialRun = true; // علم لتحديد ما إذا كان هذا هو التشغيل الأول

// تخزين حالة المنتجات
const productStatus = {};

Object.keys(productNames).forEach(url => {
  productStatus[url] = {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false,
    updatedAtLocked: false // علم لقفل إشعارات updated_at
  };
});

// دالة لإرسال رسالة إلى Telegram مع خيارات إضافية
const sendTelegramMessage = async (chatId, message, options = {}) => {
  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await axios.post(apiUrl, {
      chat_id: chatId,
      text: message,
      parse_mode: options.parse_mode || 'Markdown',
      reply_markup: options.reply_markup || {}
    });
    console.log('التنبيه المسبق للتلقرام تم إرساله ✅');
  } catch (error) {
    console.error('حدث خطأ أثناء إرسال رسالة إلى Telegram:', error.response ? error.response.data : error.message);
  }
};

// دالة للحصول على التاريخ المحلي بصيغة YYYY-MM-DD
const getLocalDateISO = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // الأشهر تبدأ من 0
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// دالة لجلب تفاصيل `updated_at` من صفحة المنتج
const getUpdatedAtDetails = async (url, datesToMonitor) => {
  try {
    const pageContent = await cloudscraper.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    // تعريف التعبير المنتظم لاستخراج updated_at
    const regex = /\\"updated_at\\":\\"([^\\"]+)\\"/g;
    let match;
    const updatedAtList = [];

    // استخدام حلقة لاستخراج جميع القيم المطابقة
    while ((match = regex.exec(pageContent)) !== null) {
      const updatedAt = match[1];
      updatedAtList.push(updatedAt);
    }

    if (updatedAtList.length === 0) {
      console.log(`لم يتم العثور على updated_at في ${url}`);
      return;
    }

    // فلترة القيم التي تطابق التواريخ المراد مراقبتها فقط
    const filteredUpdatedAt = updatedAtList.filter(updatedAt => {
      const updatedDate = new Date(updatedAt);
      // مقارنة التاريخ بدون الوقت باستخدام التاريخ المحلي
      const updatedDateISO = getLocalDateISO(updatedDate);
      return datesToMonitor.includes(updatedDateISO);
    });

    if (filteredUpdatedAt.length === 0) {
      console.log(`لا توجد قيم updated_at مطابقة للتواريخ المراد مراقبتها (${datesToMonitor.join(', ')}) في ${url}`);
      return;
    }

    // اختيار أحدث قيمة `updated_at` في القيم المفلترة
    const firstUpdatedAt = filteredUpdatedAt[0];
//    console.log(`أحدث قيمة updated_at للمنتج ${productNames[url].ar}: \n\n\n${firstUpdatedAt}`);

    // استخدام URL كمعرف للمنتج
    const productName = url;

    // استخراج تاريخ `firstUpdatedAt`
    const firstUpdatedDateISO = getLocalDateISO(new Date(firstUpdatedAt));

    if (previousUpdatedAt[productName] === undefined) {
      previousUpdatedAt[productName] = {};
    }

    // تهيئة previousUpdatedAt للمنتج إذا لم يكن موجودًا
    if (previousUpdatedAt[productName][firstUpdatedDateISO] === undefined) {
      previousUpdatedAt[productName][firstUpdatedDateISO] = firstUpdatedAt;
      console.log(`تم تهيئة previousUpdatedAt للمنتج ${productName} بتاريخ ${firstUpdatedDateISO}`);
    }

    // التحقق من التغيير في `updated_at` للتاريخ المحدد
    if (previousUpdatedAt[productName][firstUpdatedDateISO] !== firstUpdatedAt) {
      if (!isInitialRun && !productStatus[productName].updatedAtLocked) { // فقط إذا لم يكن التشغيل الأول ولا يوجد قفل
        // إرسال رسالة إلى Telegram عند اكتشاف تحديث جديد
        const message = `
المنتج *${productNames[productName].ar}* على وشك التوفر، سجل دخول
        `;
        const options = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar-sa/login' }
              ]
            ]
          },
          parse_mode: 'Markdown'
        };
        // إرسال الإشعار إلى القناة الخاصة بالمنتج
        await sendTelegramMessage(channels[productName].chatId, message, options);

        // تفعيل القفل على إشعارات updated_at
        productStatus[productName].updatedAtLocked = true;
      }

      // تحديث القيمة المخزنة
      previousUpdatedAt[productName][firstUpdatedDateISO] = firstUpdatedAt;
    }

  } catch (error) {
    console.error(`حدث خطأ أثناء جلب محتوى الصفحة من ${url}:`, error.response ? error.response.data : error.message);
  }
};

// دالة لفحص توفر المنتجات
const checkProductAvailability = async () => {
  const currentTime = Date.now();

  for (const [url, productInfo] of Object.entries(productNames)) {
    try {
      const pageContent = await cloudscraper.get(url);
      const $ = cheerio.load(pageContent);

      // التحقق من وجود عبارة "OUT OF STOCK" في الصفحة
      const isOutOfStock = $('span:contains("OUT OF STOCK")').length > 0;
      const isAvailable = !isOutOfStock; // المنتج متوفر إذا لم يكن OUT OF STOCK

      if (isAvailable) {
        const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productInfo.en}.png`);

        const messageAvailable = `
*${productInfo.ar}* - متوفر الآن ✅
        `;
        const replyMarkup = {
          inline_keyboard: [
            [
              { text: 'شراء سريع ⚡', url: 'https://www.dzrt.com/ar-sa/checkout' },
              { text: 'المنتـج 🟢', url: url }
            ],
            [
              { text: ' المنتجات 🛒', url: 'https://www.dzrt.com/ar-sa/products' },
              { text: 'اعادة الطلب 🔁', url: 'https://www.dzrt.com/ar-sa/profile/orders' }
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
          let messageOutOfStock = `نفذ المنتج *${productInfo.ar}* ❌\nبقى متوفرا لمدة: `;

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

            const imageUrlOutOfStock = path.join(__dirname, '..', 'images', `${productInfo.en}-outofstock.png`); // مسار صورة النفاد

            // إرسال الصورة مع رسالة النفاد
            await bot.sendPhoto(channels[url].chatId, imageUrlOutOfStock, {
              caption: messageOutOfStock,
              parse_mode: 'Markdown'
            });

            // فتح القفل على إشعارات updated_at بعد 5 دقائق
            setTimeout(() => {
              productStatus[url].updatedAtLocked = false;
              console.log(`تم فتح القفل على إشعارات updated_at لمنتج ${url} بعد 5 دقائق من إرسال إشعار النفاد.`);
            }, 5 * 60 * 1000); // 5 دقائق

            productStatus[url].isNotifying = false;
          }

          // قفل لإيقاف إرسال الإشعارات لمدة محددة
          productStatus[url].notificationLock = true;
          setTimeout(() => {
            productStatus[url].notificationLock = false;
          }, 5000); // مدة القفل 5 ثواني
        }
      }

      // إضافة تأخير لمدة 2 ثانية قبل الانتقال للمنتج التالي
      await delay(2000);
    } catch (error) {
      console.error(`حدث خطأ أثناء فحص المنتج ${productInfo.ar}:`, error.response ? error.response.data : error.message);
    }
  }

  if (isInitialRun) {
    isInitialRun = false;
    console.log('تم الانتهاء من التشغيل الأول.');
  }
};

// دالة رئيسية لمعالجة جميع الروابط لمراقبة updated_at
const fetchAllUpdatedAt = async () => {
  try {
    // تحديد تاريخ اليوم الحالي والتاريخ السابق بناءً على التاريخ المحلي
    const today = new Date();
    const todayISO = getLocalDateISO(today);

    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayISO = getLocalDateISO(yesterdayDate);

    const datesToMonitor = [todayISO, yesterdayISO];

    // تنفيذ الطلبات مع تأخير عشوائي بين كل طلب
    for (const url of Object.keys(productNames)) {
      await getUpdatedAtDetails(url, datesToMonitor);
      // إضافة تأخير عشوائي بين 1 إلى 2 ثوانٍ
      const delayMs = Math.floor(Math.random() * 2000) + 1000; // من 1000 إلى 3000 مللي ثانية
      await delay(delayMs);
    }

    if (isInitialRun) {
      // إذا كان التشغيل الأول، نعيّن isInitialRun إلى false بعد تحميل البيانات
      isInitialRun = false;
      console.log('تم تعيين isInitialRun إلى false.');
    }
  } catch (error) {
    console.error("حدث خطأ أثناء جلب قيم updated_at لجميع المنتجات:", error.response ? error.response.data : error.message);
  }
};

// تشغيل المراقبة كل 1 ثانية
setInterval(() => {
  fetchAllUpdatedAt();
  checkProductAvailability();
}, 1000);

// تشغيل الدالة الأولى فورًا عند بدء السكربت
fetchAllUpdatedAt();
checkProductAvailability();


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
        const channelIds = Object.values(channels).map(channel => channel.chatId);

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