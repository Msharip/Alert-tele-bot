
const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { TwitterApi } = require('twitter-api-v2');
const path = require('path');

  const productNames = {
    'https://www.dzrt.com/ar-sa/products/icy-rush': { ar: 'آيسي رش', en: 'icy-rush' },
    'https://www.dzrt.com/ar-sa/products/seaside-frost': { ar: 'سي سايد', en: 'seaside-frost' },
    'https://www.dzrt.com/ar-sa/products/highland-berries': { ar: 'هايلاند بيريز', en: 'highland-berries' },
    'https://www.dzrt.com/ar-sa/products/samra': { ar: 'سمرة - أصدار خاص', en: 'samra-ed' }
  };

  const urls = [
    'https://www.dzrt.com/ar-sa/products/icy-rush',
    'https://www.dzrt.com/ar-sa/products/seaside-frost',
    'https://www.dzrt.com/ar-sa/products/highland-berries',
    'https://www.dzrt.com/ar-sa/products/samra'
  ];

  const token = '6749756089:AAFMCjy0-85EkyQIrzC4tJU5jIyFJvpnLEI';
  const chatId = '-1002122565496';
  const bot = new TelegramBot(token);
  
  const twitterClient = new TwitterApi({
    appKey: 'HrFfThKnzlbiuVXk2rBMfAndA',
    appSecret: 'NCejLvJb5E8RFfXGGw6lqGH7yqXUhSvjZsZPBthAmFVhhAR095',
    accessToken: '1791965388164440064-6p4RaldWOBEk4XLTlVaXrbT5C0JGVi',
    accessSecret: 'y9R2GZa8ZylPT3pR1BEL3ZYD9A5maVPhv7DIstD9AT2cf',
  });

// Initialize product status
const productStatus = {};
urls.forEach(url => {
  productStatus[url] = {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false,
  };
});

// Function to check product availability
async function checkProductAvailability(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const isOutOfStock = $('span:contains("OUT OF STOCK")').length > 0;
    const isAvailable = !isOutOfStock; // إذا لم يكن المنتج "OUT OF STOCK"، فهو متاح
    const currentTime = Date.now();

    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrlAvailable = path.join(__dirname, '..', 'images', `${productNames[url].en}.png`);
      const imageUrlUnAvailable = path.join(__dirname, '..', 'images', `${productNames[url].en}-outofstock.png`);
      const messageAvailable = `*${productNameAr}* - متوفر الآن ✅`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: ' المنتجات 📦', url: 'https://www.dzrt.com/ar/our-products.html' },
            { text: 'إضافة للسلة 🛒', url: url }
          ],
          [
            { text: 'تسجيل دخول 🔑', url: 'https://www.dzrt.com/ar/customer/account/login' }
          ]
        ]
      };

      if (isAvailable && !productStatus[url].isAvailable && !productStatus[url].notificationLock) {
        // The product is now available

        productStatus[url].isAvailable = true;
        productStatus[url].isOutOfStockNotified = false; // Reset out-of-stock notification
        productStatus[url].availableStartTime = currentTime;

        if (!productStatus[url].isNotifying) {
          productStatus[url].isNotifying = true;

          // Delay notification for 3 minutes (180000 milliseconds)
          setTimeout(async () => {
            // Send photo to the channel
            await bot.sendPhoto(chatId, imageUrlAvailable, {
              caption: messageAvailable,
              parse_mode: 'Markdown',
              reply_markup: JSON.stringify(replyMarkup)
            });

            // Tweet the availability
            const tweetMessage = `${productNameAr} - متوفر الآن ✅! #دزرت #تنبيه \n${url}`;
            const mediaId = await twitterClient.v1.uploadMedia(imageUrlAvailable); // Upload image to Twitter
            await twitterClient.v2.tweet({ text: tweetMessage, media: { media_ids: [mediaId] } });

            productStatus[url].isNotifying = false;
          }, 180000); // 3 minutes delay
        }
      }

      // Calculate time the product has been available
      const timeAvailable = currentTime - productStatus[url].availableStartTime;
      const minutesAvailable = Math.floor(timeAvailable / 60000);
      const secondsAvailable = Math.floor((timeAvailable % 60000) / 1000);
      const messageOutOfStock = `نفذ المنتج *${productNameAr}* ❌\nبقى متوفرا لمدة: ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;


// Inside the out-of-stock notification logic
if (!isAvailable && productStatus[url].isAvailable && !productStatus[url].isOutOfStockNotified) {
  // The product is now out of stock
  console.log(`${productNameAr} ❌ - المنتج نفذ من المخزون`);

  productStatus[url].isAvailable = false;
  productStatus[url].isOutOfStockNotified = true;

  if (!productStatus[url].isNotifying) {
    productStatus[url].isNotifying = true;

    // Delay out-of-stock notification for 3 minutes (180000 milliseconds)
    setTimeout(async () => {
      // Send out-of-stock notification with the image to the channel
      await bot.sendPhoto(chatId, imageUrlUnAvailable, {
        caption: messageOutOfStock,
        parse_mode: 'Markdown'
      });

      productStatus[url].isNotifying = false;
    }, 180000); // 3 minutes delay
  }

  // Lock notification for 90 seconds to prevent duplicate notifications
  productStatus[url].notificationLock = true;
  setTimeout(() => {
    productStatus[url].notificationLock = false;
  }, 90000); // 90 seconds
}

    }
  } catch (error) {
  }
}

// Function to check all URLs
async function checkAllUrls() {
  for (const url of urls) {
    if (!productStatus[url].isNotifying) {
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