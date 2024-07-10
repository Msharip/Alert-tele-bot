const axios = require('axios');
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
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra' }
};

const urls = [
  'https://www.dzrt.com/ar/icy-rush.html',
  'https://www.dzrt.com/ar/seaside-frost.html',
  'https://www.dzrt.com/ar/highland-berries.html',
  'https://www.dzrt.com/ar/garden-mint.html',
  'https://www.dzrt.com/ar/mint-fusion.html',
  'https://www.dzrt.com/ar/haila.html',
  'https://www.dzrt.com/ar/samra.html'
];

const channels = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush', chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost', chatId: process.env.CHAT_ID_SEASIDE },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries', chatId: process.env.CHAT_ID_HIGH },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint', chatId: process.env.CHAT_ID_GARDEN },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion', chatId: process.env.CHAT_ID_MINT },
  'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila', chatId: process.env.CHAT_ID_HAILA },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra', chatId: process.env.CHAT_ID_SAMRA }
};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });


const productCooldown = 14 * 60 * 1000; // فترة التهدئة لكل منتج على حدة: 14 دقيقة بالمللي ثانية
let productStatus = {};

urls.forEach(url => {
  productStatus[url] = { isAvailable: false, lastNotificationTime: 0, messageId: null, individualCooldownTime: 0 };
});

async function checkProductAvailability(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const isUnavailable = $('div.stock.unavailable span').length > 0;
    const currentTime = Date.now();
    
    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrl = path.join(__dirname, '..', 'images', `${productNames[url].en}.png`);
      const imageUrlUnavailable = path.join(__dirname, '..', 'images', `${productNames[url].en}-outofstock.png`);

      if (!isUnavailable && (currentTime - productStatus[url].individualCooldownTime > productCooldown)) {
        // المنتج متوفر الآن وفترة التهدئة الفردية قد انقضت
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

        const sentMessage = await bot.sendPhoto(mainChannelId, imageUrl, { caption: message, parse_mode: 'Markdown', reply_markup: JSON.stringify(replyMarkup) });
        
        productStatus[url] = {
          isAvailable: true,
          lastNotificationTime: currentTime,
          messageId: sentMessage.message_id,
          individualCooldownTime: currentTime
        };
        
      } else if (isUnavailable && productStatus[url].isAvailable) {
        // المنتج غير متوفر الآن ولكنه كان متوفرًا في الفحص السابق
        const message = `*${productNameAr}* - نفذ من المخزون ❌`;
        await bot.sendPhoto(channels[url].chatId, imageUrlUnavailable, { caption: message, parse_mode: 'Markdown' });

        productStatus[url].isAvailable = false;
      }
    }
  } catch (error) {
  }
}

async function checkAllUrls() {
  for (const url of urls) {
    const currentTime = Date.now();
    // التحقق من فترة التهدئة لكل منتج على حدة
    if (currentTime - productStatus[url].individualCooldownTime > productCooldown) {
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
