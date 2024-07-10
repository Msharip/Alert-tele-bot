const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

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

const productCooldown = 14 * 60 * 1000; // فترة التهدئة الفردية (30 دقائق)
const confirmationPeriod = 8 * 1000; // فترة التأكيد قبل إرسال إشعار النفاد (8 ثواني)

const productStatus = {};

urls.forEach(url => {
  productStatus[url] = {
    isAvailable: false,
    lastNotificationTime: 0,
    isNotifying: false,
    isOutOfStockNotified: false,
    individualCooldownTime: 0,
    outOfStockStartTime: 0 // وقت بداية فترة التأكيد لنفاد المنتج
  };
});

async function checkProductAvailability(url) {
  try {
    const data = await cloudscraper.get(url);
    const $ = cheerio.load(data);
    const isUnavailable = $('div.stock.unavailable span').length > 0;
    const currentTime = Date.now();
    
    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productNames[url].en}.png`);
      const imageUrlUnavailable = path.join(__dirname, '..', 'images', `${productNames[url].en}-outofstock.png`);

      // عند توفر المنتج
      if (!isUnavailable && (currentTime - productStatus[url].individualCooldownTime > productCooldown)) {
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

        // إعادة تعيين فترة التهدئة عند توفر المنتج
        productStatus[url] = {
          isAvailable: true,
          lastNotificationTime: currentTime,
          isNotifying: true,
          isOutOfStockNotified: false,
          individualCooldownTime: currentTime, // إعادة تعيين إلى الوقت الحالي
          outOfStockStartTime: 0 // إعادة تعيين وقت بداية فترة التأكيد
        };

        setTimeout(() => {
          productStatus[url].isNotifying = false;
        }, productCooldown);
      
      // عند نفاد المنتج
      } else if (isUnavailable && productStatus[url].isAvailable && !productStatus[url].isOutOfStockNotified) {
        // التحقق من فترة التأكيد
        if (productStatus[url].outOfStockStartTime === 0) {
          productStatus[url].outOfStockStartTime = currentTime; // تعيين وقت بداية فترة التأكيد
        } else if (currentTime - productStatus[url].outOfStockStartTime > confirmationPeriod) {
          const message = `*${productNameAr}* - نفذ من المخزون ❌`;
          await bot.sendPhoto(channels[url].chatId, imageUrlUnavailable, {
            caption: message,
            parse_mode: 'Markdown'
          });

          // إعادة تعيين فترة التهدئة عند نفاد المنتج
          productStatus[url].isOutOfStockNotified = true;
          productStatus[url].individualCooldownTime = 0; // تعيين إلى 0 يعني إعادة تعيين فترة التهدئة
          productStatus[url].isAvailable = false;
          productStatus[url].outOfStockStartTime = 0; // إعادة تعيين وقت بداية فترة التأكيد
        }
      } else if (!isUnavailable) {
        // إعادة تعيين وقت بداية فترة التأكيد إذا عاد المنتج إلى التوفر قبل انتهاء فترة التأكيد
        productStatus[url].outOfStockStartTime = 0;
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

  if (hour >= 13 && hour <= 22) {
    checkAllUrls();
  }
});
