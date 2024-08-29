const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { TwitterApi } = require('twitter-api-v2');
const path = require('path');

const productNames = {

  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
  'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'https://www.dzrt.com/ar/haila.html': { ar: ' هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة ', en: 'samra' },
};
const urls = [

  'https://www.dzrt.com/ar/highland-berries.html',
  'https://www.dzrt.com/ar/garden-mint.html',
  'https://www.dzrt.com/ar/mint-fusion.html',
  'https://www.dzrt.com/ar/haila.html',
  'https://www.dzrt.com/ar/samra.html',

];


const token = '6749756089:AAFMCjy0-85EkyQIrzC4tJU5jIyFJvpnLEI';
const chatId = '-1002122565496';
const bot = new TelegramBot(token, { polling: true });

const twitterClient = new TwitterApi({
  appKey: 'HrFfThKnzlbiuVXk2rBMfAndA',
  appSecret: 'NCejLvJb5E8RFfXGGw6lqGH7yqXUhSvjZsZPBthAmFVhhAR095',
  accessToken: '1791965388164440064-6p4RaldWOBEk4XLTlVaXrbT5C0JGVi',
  accessSecret: 'y9R2GZa8ZylPT3pR1BEL3ZYD9A5maVPhv7DIstD9AT2cf',
});

const productCooldown = 45 * 60 * 1000; // فترة التهدئة لكل منتج على حدة: 45 دقيقة بالمللي ثانية
let productStatus = {};

urls.forEach(url => {
  productStatus[url] = { isAvailable: false, lastNotificationTime: 0, messageId: null, individualCooldownTime: 0, hasSentNotification: false };
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

      if (!isUnavailable && !productStatus[url].hasSentNotification) {
        // المنتج متوفر الآن ولم يتم إرسال إشعار من قبل
        const message = `*${productNameAr}* - متوفر الآن ✅ \n`;

        // إضافة تأخير قبل إرسال الإشعار
        setTimeout(async () => {
          const sentMessage = await bot.sendPhoto(chatId, imageUrl, {
            caption: message,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📦 المنتجات', url: 'https://www.dzrt.com/ar/our-products.html' },
                  { text: '🛒 الإضافة للسلة', url: url },

                ]
              ]
            }
          });
          productStatus[url] = {
            isAvailable: true,
            lastNotificationTime: currentTime,
            messageId: sentMessage.message_id,
            individualCooldownTime: currentTime,
            hasSentNotification: true // تحديث حالة إرسال الإشعار
          };

          // نشر تغريدة على تويتر
          const tweetMessage = `${productNameAr} - متوفر الآن ✅! #دزرت #تنبيه \n${url}`;
          const mediaId = await twitterClient.v1.uploadMedia(imageUrl); // تحميل الصورة إلى تويتر
          await twitterClient.v2.tweet({ text: tweetMessage, media: { media_ids: [mediaId] } });

        }, 180000); // تأخير لمدة 3 دقائق (180000 مللي ثانية)

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

  if (hour >= 12 && hour <= 16) {
    checkAllUrls();
  }
});
