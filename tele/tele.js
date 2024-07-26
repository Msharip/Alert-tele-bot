const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const path = require('path');

const productNames = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush' },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost' },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/ar/haila.html': { ar: ' هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة ', en: 'samra' },
};

const urls = [
  'https://www.dzrt.com/ar/icy-rush.html',
  'https://www.dzrt.com/ar/seaside-frost.html',
  'https://www.dzrt.com/ar/highland-berries.html',
  'https://www.dzrt.com/ar/garden-mint.html',
  'https://www.dzrt.com/ar/mint-fusion.html',
  'https://www.dzrt.com/ar/haila.html',
  'https://www.dzrt.com/ar/samra.html',
];

const token = '6749756089:AAFMCjy0-85EkyQIrzC4tJU5jIyFJvpnLEI';
const chatId = '-1002122565496';
const bot = new TelegramBot(token, {
  polling: {
    interval: 3000, // فترة الاستطلاع بالمللي ثانية (3 ثواني)
    autoStart: true,
    params: {
      timeout: 10 // مدة المهلة بالثواني
    }
  }
});

bot.on('polling_error', (error) => {
  console.error(`Polling error: ${error.message}`);
  
  if (error.response && error.response.statusCode === 502) {
    // في حالة خطأ 502، انتظر لمدة قصيرة قبل إعادة المحاولة
    setTimeout(() => {
      console.log('Retrying polling after 10 seconds due to 502 error...');
      bot.startPolling();
    }, 10000); // إعادة المحاولة بعد 10 ثواني
  } else if (error.response && error.response.statusCode === 429) {
    // في حالة خطأ 429، انتظر لمدة أطول قبل إعادة المحاولة
    const retryAfter = parseInt(error.response.headers['retry-after']) || 30;
    console.log(`Retrying polling after ${retryAfter} seconds due to 429 error...`);
    setTimeout(() => {
      bot.startPolling();
    }, retryAfter * 1000); // إعادة المحاولة بعد الفترة المحددة في retry-after
  } else {
    // لأخطاء أخرى، أعد المحاولة بعد فترة قصيرة
    setTimeout(() => {
      console.log('Retrying polling after 5 seconds due to other error...');
      bot.startPolling();
    }, 5000); // إعادة المحاولة بعد 5 ثواني
  }
});// 2 ثانية
const productCooldown = 14 * 60 * 1000; // فترة التهدئة لكل منتج على حدة: 25 دقيقة بالمللي ثانية
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

      if (!isUnavailable && (currentTime - productStatus[url].individualCooldownTime > productCooldown)) {
        // المنتج متوفر الآن وفترة التهدئة الفردية قد انقضت
        const message = `*${productNameAr}* - متوفر الآن ✅ \n[ أضغط هنا - اضافة الى السلة ](${url})`;
        const sentMessage = await bot.sendPhoto(chatId, imageUrl, { caption: message, parse_mode: 'Markdown' });
        
        productStatus[url] = {
          isAvailable: true,
          lastNotificationTime: currentTime,
          messageId: sentMessage.message_id,
          individualCooldownTime: currentTime
        };
      } else if (isUnavailable && productStatus[url].isAvailable) {
        // المنتج غير متوفر الآن ولكنه كان متوفرًا في الفحص السابق
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

cron.schedule('* * * * *', () => {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 13 && hour <= 22) {
    checkAllUrls();
  }
});
