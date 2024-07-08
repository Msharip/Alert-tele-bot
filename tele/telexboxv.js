const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { TwitterApi } = require('twitter-api-v2');
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
  'https://www.dzrt.com/ar/samra.html'
];
const token = '6749756089:AAFMCjy0-85EkyQIrzC4tJU5jIyFJvpnLEI';
const chatId = '-1002122565496';
const bot = new TelegramBot(token, { polling: true });
const productCooldown = 20 * 60 * 1000; // فترة التهدئة لكل منتج على حدة: 25 دقيقة بالمللي ثانية
let productStatus = {};
let lastAllUnavailableTime = 0;

urls.forEach(url => {
  productStatus[url] = { isAvailable: false, lastNotificationTime: 0, messageId: null, individualCooldownTime: 0 };
});

const twitterClient = new TwitterApi({
  appKey: 'HrFfThKnzlbiuVXk2rBMfAndA',
  appSecret: 'NCejLvJb5E8RFfXGGw6lqGH7yqXUhSvjZsZPBthAmFVhhAR095',
  accessToken: '1791965388164440064-6p4RaldWOBEk4XLTlVaXrbT5C0JGVi',
  accessSecret: 'y9R2GZa8ZylPT3pR1BEL3ZYD9A5maVPhv7DIstD9AT2cf',
});

async function checkProductAvailability(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const isUnavailable = $('div.stock.unavailable span').length > 0;
    const currentTime = Date.now();
    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrl = path.join(__dirname, 'images', `${productNames[url].en}.png`);

      if (!isUnavailable && (currentTime - productStatus[url].individualCooldownTime > productCooldown)) {
        // المنتج متوفر الآن وفترة التهدئة الفردية قد انقضت
        const sentMessage = await bot.sendPhoto(chatId, imageUrl, { caption: message, parse_mode: 'Markdown' });
        
        productStatus[url] = {
          isAvailable: true,
          lastNotificationTime: currentTime,
          messageId: sentMessage.message_id,
          individualCooldownTime: currentTime
        };

        // نشر تغريدة على تويتر
        const tweetMessage = `${productNameAr} - متوفر الآن ✅! #دزرت #تنبيه \n${url}`;
        const mediaId = await twitterClient.v1.uploadMedia(imageUrl); // تحميل الصورة إلى تويتر
        await twitterClient.v2.tweet({ text: tweetMessage, media: { media_ids: [mediaId] } });
      } else if (isUnavailable && productStatus[url].isAvailable) {
        // المنتج غير متوفر الآن ولكنه كان متوفرًا في الفحص السابق
        productStatus[url].isAvailable = false;
      }
    }
  } catch (error) {
  }
}

function resetCooldownsIfAllUnavailable() {
  const currentTime = Date.now();
  const allUnavailable = Object.values(productStatus).every(status => !status.isAvailable);

  if (allUnavailable) {
    if (lastAllUnavailableTime === 0) {
      lastAllUnavailableTime = currentTime;
    } else if (currentTime - lastAllUnavailableTime >= 3 * 60 * 1000) {
      // إذا كانت جميع المنتجات غير متوفرة لمدة 5 دقائق، قم بإعادة تعيين فترة التهدئة
      for (const url in productStatus) {
        productStatus[url].individualCooldownTime = 0;
      }
      lastAllUnavailableTime = 0; // إعادة تعيين المؤقت
    }
  } else {
    lastAllUnavailableTime = 0; // إعادة تعيين المؤقت إذا أصبح أي منتج متوفرًا
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
  resetCooldownsIfAllUnavailable();
}

cron.schedule('* * * * * *', () => {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 13 && hour <= 21) {
    checkAllUrls();
  }
});
