const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
const moment = require('moment-timezone');
const cloudscraper = require('cloudscraper'); // تأكد من تثبيت المكتبة عبر npm
require('dotenv').config();


const productNames = {
  'purple-mist': { ar: 'بيربل مست', en: 'purple-mist' },
  'icy-rush': { ar: 'آيسي رش', en: 'icy-rush' },
  'seaside-frost': { ar: 'سي سايد', en: 'seaside-frost' },
  'highland-berries': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'garden-mint': { ar: 'جاردن منت', en: 'garden-mint' },
  'mint-fusion': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'haila': { ar: 'هيلة', en: 'haila' },
  'samra': { ar: 'سمرة', en: 'samra' },
  'edgy-mint': { ar: 'ايدجي منت', en: 'edgy-mint' },
  'tamra': { ar: 'تمرة', en: 'tamra' }
};

const channels = {
  'purple-mist': { chatId: process.env.CHAT_ID_PURPLE },
  'icy-rush': { chatId: process.env.CHAT_ID_ICY_RUSH },
  'seaside-frost': { chatId: process.env.CHAT_ID_SEASIDE },
  'highland-berries': { chatId: process.env.CHAT_ID_HIGH },
  'garden-mint': { chatId: process.env.CHAT_ID_GARDEN },
  'mint-fusion': { chatId: process.env.CHAT_ID_MINT },
  'haila': { chatId: process.env.CHAT_ID_HAILA },
  'samra': { chatId: process.env.CHAT_ID_SAMRA },
  'edgy-mint': { chatId: process.env.CHAT_ID_EDGY },
  'tamra': { chatId: process.env.CHAT_ID_TAMRA }
};


const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN4;
const bot = new TelegramBot(token, { polling: true });

// دالة لجلب تفاصيل `inventory_quantity` من صفحة المنتج
const getInventoryDetails = async (url) => {
  try {
    const pageContent = await cloudscraper.get(url);
    const $ = cheerio.load(pageContent);
    let inventoryQuantity = null;

    $('script').each((i, script) => {
      const scriptContent = $(script).html();

      // تحقق إذا كان السكربت يحتوي على 'inventory_quantity'
      if (scriptContent.includes('inventory_quantity')) {
        // تقسيم النص إلى أجزاء حول "inventory_quantity"
        const parts = scriptContent.split('inventory_quantity');

        if (parts.length > 1) {
          // استخراج الجزء بعد "inventory_quantity"
          const afterInventory = parts[1];
          // البحث عن الرقم بعد "inventory_quantity"
          const match = afterInventory.match(/:\s*(-?\d+)/);
          if (match) {
            inventoryQuantity = parseInt(match[1]);
 //           console.log(`URL : ${url} = ${inventoryQuantity}`);
          }
        }
      }
    });

    return inventoryQuantity;
  } catch (error) {
    console.error(`حدث خطأ أثناء جلب محتوى الصفحة من ${url}:`, error);
    return null;
  }
};

// دالة لفحص تغيير `inventory_quantity` وإرسال الإشعار
const checkForInventoryChange = async () => {
  const productUrls = [
  ];

  for (const product of productUrls) {
    const inventoryQuantity = await getInventoryDetails(product.url);
    if (inventoryQuantity === null) continue;

    // تحقق إذا كانت القيمة السابقة `0` والآن أصبحت أكبر من `0`
    if ((!previousInventory[product.url] || previousInventory[product.url] === 0) && inventoryQuantity > 0) {
      // يمكنك إزالة إشعار تغيير السعر هنا بعد تحقق `inventory_quantity` إذا كنت ترغب في ذلك
      console.log(`تغيرت الكمية المتاحة للمنتج ${product.product} ولكن لا يتم إرسال إشعار.`);
    }

    // تحديث قيمة `inventory_quantity` السابقة بعد الفحص
    previousInventory[product.url] = inventoryQuantity;

    // إضافة تأخير بين المنتجات بمقدار 500 ملي ثانية
    await delay(100000);
  }
};

// دالة تأخير لتنفيذ الفاصل الزمني بين كل منتج
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


const productStatus = {};

Object.keys(productNames).forEach(product => {
  productStatus[product] = {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false
  };
});async function checkHomePage() {
  try {
    const url = 'https://www.dzrt.com/en-sa/products';
    const data = await cloudscraper.get(url);
    const $ = cheerio.load(data);

    const currentTime = Date.now();

    $('a[href*="/products/"]').each(async function () {
      const productUrl = $(this).attr('href').split('/products/')[1];
      const isOutOfStock = $(this).find('span:contains("OUT OF STOCK")').length > 0;
      const isAvailable = !isOutOfStock;

      if (productNames[productUrl]) {
        const productNameAr = productNames[productUrl].ar;
        const imageUrlAvailable = path.join(__dirname, '..', 'images',  `${productNames[productUrl].en}.png`);
        const imageUrlOutOfStock = path.join(__dirname, '..', 'images',  `${productNames[productUrl].en}-outofstock.png`);
        const localTime = moment(currentTime).tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

        // جلب الكمية المتاحة باستخدام `getInventoryDetails`
        const inventoryQuantity = await getInventoryDetails(`https://www.dzrt.com/ar-sa/products/${productUrl}`);

        // تحقق من الشرط: لا يوجد "OUT OF STOCK" و `inventory_quantity` أكبر من 0
        if (isAvailable && inventoryQuantity > 0) {
          // إعداد رسالة التوفر مع الكمية المتاحة
          const messageAvailable = `
*${productNameAr}* - متوفر الآن ✅
الكمية المتاحة: ${inventoryQuantity} علبة`;

          const replyMarkup = {
            inline_keyboard: [
              [
                { text: 'شراء سريع ⚡', url: 'https://www.dzrt.com/ar-sa/checkout' },
                { text: ' المنتـج 🟢', url: `https://www.dzrt.com${$(this).attr('href')}` }
              ],
              ...(productUrl === 'icy-rush' || productUrl === 'seaside-frost' ? [
                { text: ' المخزون  📦', callback_data: `inventory_${productUrl}` },
                { text: 'اعادة الطلب 🔁', url: 'https://www.dzrt.com/ar-sa/profile/orders' } 
              ] : [
                { text: 'اعادة الطلب 🔁', url: 'https://www.dzrt.com/ar-sa/profile/orders' },
                { text: 'السلــــة 🛒', url: 'https://www.dzrt.com/ar-sa/cart' }
              ]),
              [
                { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar/customer/account/login' }
              ]
            ]
          };

          // إرسال الإشعار فقط عند توفر المنتج والكمية المتاحة أكبر من 0
          if (!productStatus[productUrl].isAvailable && !productStatus[productUrl].notificationLock) {
            console.log(`${productNameAr} ✅ - المنتج متوفر الآن`);

            productStatus[productUrl].isAvailable = true;
            productStatus[productUrl].isOutOfStockNotified = false;
            productStatus[productUrl].availableStartTime = currentTime;

            if (!productStatus[productUrl].isNotifying) {
              productStatus[productUrl].isNotifying = true;

              // إرسال الصورة مع رسالة التوفر والكميات المتاحة
              await bot.sendPhoto(channels[productUrl].chatId, imageUrlAvailable, {
                caption: messageAvailable,
                parse_mode: 'Markdown',
                reply_markup: JSON.stringify(replyMarkup)
              });

              await bot.sendPhoto(mainChannelId, imageUrlAvailable, {
                caption: messageAvailable,
                parse_mode: 'Markdown',
                reply_markup: JSON.stringify(replyMarkup)
              });

              productStatus[productUrl].isNotifying = false;
            }
          }

          // حساب مدة التوفر
          const timeAvailable = currentTime - productStatus[productUrl].availableStartTime;
          const minutesAvailable = Math.floor(timeAvailable / 60000);
          const secondsAvailable = Math.floor((timeAvailable % 60000) / 1000);
          const messageOutOfStock = `نفذ المنتج *${productNameAr}* ❌\nبقى متوفرا لمدة: ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;

          // إرسال إشعار النفاذ عند انتهاء المخزون
          if (!isAvailable && productStatus[productUrl].isAvailable && !productStatus[productUrl].isOutOfStockNotified) {
            console.log(`${productNameAr} ❌ - المنتج نفذ من المخزون`);

            productStatus[productUrl].isAvailable = false;
            productStatus[productUrl].isOutOfStockNotified = true;

            if (!productStatus[productUrl].isNotifying) {
              productStatus[productUrl].isNotifying = true;

              // إرسال إشعار نفاذ المخزون
              await bot.sendPhoto(channels[productUrl].chatId, imageUrlOutOfStock, {
                caption: messageOutOfStock,
                parse_mode: 'Markdown'
              });

              console.log(`إشعار النفاذ تم إرساله للمنتج: ${productNameAr}`);

              productStatus[productUrl].isNotifying = false;
            }

            // قفل إشعار التوفر لمدة دقيقة ونصف (90 ثانية)
            productStatus[productUrl].notificationLock = true;
            setTimeout(() => {
              productStatus[productUrl].notificationLock = false;
            }, 90000);
          }
        }
      }
    });
  } catch (error) {
    console.error(`حدث خطأ أثناء فحص الصفحة الرئيسية: ${error.message}`);
  }
}

// بدء الفحص الموحد مع فاصل 500 ملي ثانية بين كل منتج
function checkAllRandomly() {
  checkHomePage();
  checkForInventoryChange();

  const randomInterval = Math.floor(Math.random() * (10000 - 6000 + 1)) + 3000;
  setTimeout(checkAllRandomly, randomInterval);
}

// بدء الفحص العشوائي الموحد
checkAllRandomly();

bot.on('callback_query', async (query) => {
  const productUrl = query.data.split('_')[1];

  if (query.data.startsWith('inventory_')) {
    const inventoryQuantity = previousInventory[`https://www.dzrt.com/ar-sa/products/${productUrl}`];
    const popupMessage = `الكمية المتبقية: ${inventoryQuantity !== undefined ? inventoryQuantity : 'غير متوفرة'}`;

    try {
      // إرسال نافذة منبثقة تحتوي على الكمية المتبقية
      await bot.answerCallbackQuery(query.id, { text: popupMessage, show_alert: true });
      console.log(`الكمية المتبقية: ${productNames[productUrl].ar}`);
    } catch (error) {
      console.error(`فشل عرض النافذة المنبثقة: ${error.message}`);
    }
  }
});


console.log('bot is running')


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