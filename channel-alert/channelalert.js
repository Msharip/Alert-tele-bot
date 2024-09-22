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
  'purple-mist': { ar: 'بيربل مست', en: 'purple-mist' },
  'icy-rush': { ar: 'آيسي رش', en: 'icy-rush' },
  'seaside-frost': { ar: 'سي سايد', en: 'seaside-frost' },
  'highland-berries': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'garden-mint': { ar: 'جاردن منت', en: 'garden-mint' },
  'mint-fusion': { ar: 'منت فيوجن', en: 'mint-fusion' },
 // 'haila': { ar: 'هيلة', en: 'haila' },
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
 // 'haila': { chatId: process.env.CHAT_ID_HAILA },
  'samra': { chatId: process.env.CHAT_ID_SAMRA },
  'edgy-mint': { chatId: process.env.CHAT_ID_EDGY },
  'tamra': { chatId: process.env.CHAT_ID_TAMRA }
};
const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });


let previousInventory = {};

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
    console.error(`حدث خطأ أثناء جلب محتوى الصفحة من ${url}:`, error);
    return null;
  }
};

// دالة لفحص المنتجات
const checkForInventoryChange = async (productUrls) => {
  for (const url of productUrls) {
    const inventoryQuantity = await getInventoryDetails(url);
    if (inventoryQuantity === null) continue;

    console.log(`URL : ${url} = ${inventoryQuantity}`);

    // إضافة تأخير لمدة ثانية واحدة قبل الانتقال للمنتج التالي
    await delay(2000);
  }
};

// تخزين حالة المنتجات
const productStatus = {};

Object.keys(productNames).forEach(product => {
  productStatus[product] = {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false
  };
});
async function checkHomePage() {
  try {
    const url = 'https://www.dzrt.com/en-sa/products';
    const options = {
      uri: url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36'
      }
    };
    const data = await cloudscraper.get(options);
    const $ = cheerio.load(data);
    const currentTime = Date.now();

    const productUrls = [];

    $('a[href*="/products/"]').each(async function () {
      const productUrl = $(this).attr('href').split('/products/')[1];

      // التحقق إذا كان المنتج موجودًا في قائمة productNames
      if (productNames[productUrl]) {
        const isOutOfStock = $(this).find('span:contains("OUT OF STOCK")').length > 0;
        const isAvailable = !isOutOfStock;
        productUrls.push(`https://www.dzrt.com/ar-sa/products/${productUrl}`);

        const productNameAr = productNames[productUrl].ar;
        const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productNames[productUrl].en}.png`);
        const imageUrlOutOfStock = path.join(__dirname, '..', 'images', `${productNames[productUrl].en}-outofstock.png`);
        const localTime = moment(currentTime).tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

        const inventoryQuantity = await getInventoryDetails(`https://www.dzrt.com/ar-sa/products/${productUrl}`);

        if (isAvailable && inventoryQuantity > 0) {
          const messageAvailable = `
          *${productNameAr}* - متوفر الآن ✅
          المخزون : ${inventoryQuantity}`;
          const replyMarkup = {
            inline_keyboard: [
              [
                { text: 'شراء سريع ⚡', url: 'https://www.dzrt.com/ar-sa/checkout' },
                { text: ' المنتـج 🟢', url: `https://www.dzrt.com${$(this).attr('href')}` }
              ],
              [
                { text: ' المخزون  📦', callback_data: `inventory_${productUrl}` },
                { text: 'اعادة الطلب 🔁', url: 'https://www.dzrt.com/ar-sa/profile/orders' }
              ],
              [
                { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar/customer/account/login' }
              ]
            ]
          };

          if (!productStatus[productUrl].isAvailable && !productStatus[productUrl].notificationLock) {
            console.log(`${productNameAr} ✅ - المنتج متوفر الآن`);

            productStatus[productUrl].isAvailable = true;
            productStatus[productUrl].isOutOfStockNotified = false;
            productStatus[productUrl].availableStartTime = currentTime;

            if (!productStatus[productUrl].isNotifying) {
              productStatus[productUrl].isNotifying = true;

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

          const timeAvailable = currentTime - productStatus[productUrl].availableStartTime;
          const minutesAvailable = Math.floor(timeAvailable / 60000);
          const secondsAvailable = Math.floor((timeAvailable % 60000) / 1000);
          const messageOutOfStock = `نفذ المنتج *${productNameAr}* ❌\nبقى متوفرا لمدة: ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;

          if (!isAvailable && productStatus[productUrl].isAvailable && !productStatus[productUrl].isOutOfStockNotified) {
            console.log(`${productNameAr} ❌ - المنتج نفذ من المخزون`);

            productStatus[productUrl].isAvailable = false;
            productStatus[productUrl].isOutOfStockNotified = true;

            if (!productStatus[productUrl].isNotifying) {
              productStatus[productUrl].isNotifying = true;

              // إرسال الصورة مع رسالة النفاد
              await bot.sendPhoto(channels[productUrl].chatId, imageUrlOutOfStock, {
                caption: messageOutOfStock,
                parse_mode: 'Markdown'
              });

              productStatus[productUrl].isNotifying = false;
            }

            // قفل لإيقاف إرسال الإشعارات لمدة محددة
            productStatus[productUrl].notificationLock = true;
            setTimeout(() => {
              productStatus[productUrl].notificationLock = false;
            }, 90000); // مدة القفل 90 ثانية
          }
        }
      }
    });

    await checkForInventoryChange(productUrls);
  } catch (error) {
    console.error(`حدث خطأ أثناء فحص الصفحة الرئيسية: ${error.message}`);
  }
}

function checkAllRandomly() {
  console.log('Checking product')
  checkHomePage();
  const randomInterval = Math.floor(Math.random() * (10000 - 7000 + 1)) + 7000;
  setTimeout(checkAllRandomly, randomInterval);
}

checkAllRandomly();

bot.on('callback_query', async (query) => {
  const productUrl = query.data.split('_')[1];

  if (query.data.startsWith('inventory_')) {
    const inventoryQuantity = previousInventory[`https://www.dzrt.com/ar-sa/products/${productUrl}`];
    const popupMessage = `الكمية المتبقية: ${inventoryQuantity !== undefined ? inventoryQuantity : 'غير متوفرة'}`;

    try {
      await bot.answerCallbackQuery(query.id, { text: popupMessage, show_alert: true });
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
          console.log(`User ${userId} is not a participant in channel ${channelId}.`);
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
  //        console.error(`Failed to approve join request for user ${userId} in channel ${channelId}:`, error);
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
  console.log("Running Sub Check");
  checkUserSubscriptions();
});