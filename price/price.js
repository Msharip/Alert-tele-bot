const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');
const moment = require('moment-timezone');
require('dotenv').config();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const urls = [
  'https://www.dzrt.com/ar/icy-rush.html',
  'https://www.dzrt.com/ar/seaside-frost.html',
];

const channels = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush', chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد', en: 'seaside-frost', chatId: process.env.CHAT_ID_SEASIDE },
  
};

const token = process.env.TOKEN4; // استخدام توكن جديد للبوت المنفصل
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

let previousPrices = {};

// الحصول على جميع القيم المطلوبة للمنتج المحدد
const getPriceDetails = async (url) => {
  try {
    const response = await axios.get(url);
    const pageContent = response.data;

    console.log(`Fetching details for ${url}...`);
    console.log(`Page content length: ${pageContent.length}`);

    const priceMetaMatch = pageContent.match(/<meta property="product:price:amount" content="(\d+\.\d+|\d+)"/);
    const priceInfoMatch = pageContent.match(/"final_price":(\d+\.\d+|\d+)/);
    const gtagMatch = pageContent.match(/gtag\(\{event:'view_item',ecommerce : \{.*value: (\d+\.\d+|\d+)/);

    const priceMeta = priceMetaMatch ? parseFloat(priceMetaMatch[1]) : null;
    const priceInfo = priceInfoMatch ? parseFloat(priceInfoMatch[1]) : null;
    const gtagValue = gtagMatch ? parseFloat(gtagMatch[1]) : null;

    console.log(`Meta price: ${priceMeta}`);
    console.log(`Final price: ${priceInfo}`);
    console.log(`Gtag value: ${gtagValue}`);

    return {
      priceMeta,
      priceInfo,
      gtagValue
    };
  } catch (error) {
    console.error(`Failed to fetch details for ${url}: ${error.message}`);
    return null;
  }
};

const loginNotificationCooldown = 18 * 60 * 1000; // 18 دقائق
let lastLoginNotificationTime = {}; // كائن لتخزين وقت آخر إشعار لكل منتج

const checkForChange = async () => {
  for (const url of ['https://www.dzrt.com/ar/icy-rush.html', 'https://www.dzrt.com/ar/seaside-frost.html']) {
    const details = await getPriceDetails(url);
    if (!details) continue;

    const currentTime = Date.now();

    // تحقق إذا كانت جميع الشروط متحققة
    if ((!previousPrices[url] || previousPrices[url] === 0) &&
        details.priceMeta === 15 &&
        details.priceInfo === 15 &&
        details.gtagValue === 15) {
      
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
    previousPrices[url] = details.priceMeta;
  }
};

// جدولة التحقق من تغير السعر كل 5 ثانية بين الساعة 09:01 الى 11:50
cron.schedule('* * * * * *', () => {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  if ((hour === 9 && minutes >= 1) || (hour > 9 && hour < 23) || (hour === 23 && minutes <= 50)) {
    checkForChange();
  }
});