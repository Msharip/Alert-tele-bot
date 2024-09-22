const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone');
const cloudscraper = require('cloudscraper');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

const twitterClient = new TwitterApi({
  appKey: 'HrFfThKnzlbiuVXk2rBMfAndA',
  appSecret: 'NCejLvJb5E8RFfXGGw6lqGH7yqXUhSvjZsZPBthAmFVhhAR095',
  accessToken: '1791965388164440064-6p4RaldWOBEk4XLTlVaXrbT5C0JGVi',
  accessSecret: 'y9R2GZa8ZylPT3pR1BEL3ZYD9A5maVPhv7DIstD9AT2cf',
});

const productNames = {
  'purple-mist': { ar: 'بيربل مست', en: 'purple-mist' },
  'icy-rush': { ar: 'آيسي رش', en: 'icy-rush' },
  'seaside-frost': { ar: 'سي سايد', en: 'seaside-frost' },
  'highland-berries': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'mint-fusion': { ar: 'منت فيوجن', en: 'mint-fusion' },
};

const token = '6749756089:AAFMCjy0-85EkyQIrzC4tJU5jIyFJvpnLEI';
const chatId = '-1002122565496';
const bot = new TelegramBot(token, { polling: true });

const productStatus = {};

// تهيئة حالة كل منتج
Object.keys(productNames).forEach(product => {
  productStatus[product] = {
    isAvailable: false,
    isNotifying: false,
    isOutOfStockNotified: false,
    availableStartTime: null,
    notificationLock: false
  };
});

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
    console.error(`Error fetching inventory quantity from ${url}:`, error);
    return null;
  }
};async function sendNotification(productUrl, productNameAr, imageUrlAvailableTelegram, imageUrlAvailableTwitter, isAvailable, isForSubscribersOnly, messageAvailable, messageOutOfStock) {
  const currentTime = Date.now();

  // إذا كان المنتج متوفر
  if (isAvailable && !productStatus[productUrl].isAvailable && !productStatus[productUrl].notificationLock) {
    console.log(`${productNameAr} 🟡 - المنتج متاح للمشتركين فقط`);

    productStatus[productUrl].isAvailable = true;
    productStatus[productUrl].isOutOfStockNotified = false;
    productStatus[productUrl].availableStartTime = currentTime;

    if (!productStatus[productUrl].isNotifying) {
      productStatus[productUrl].isNotifying = true;

      // تأخير لمدة 3 دقائق قبل إرسال الإشعار
      setTimeout(async () => {
        // إرسال إشعار إلى القناة الموحدة على Telegram مع صورة معينة
        await bot.sendPhoto(chatId, imageUrlAvailableTelegram, {
          caption: isForSubscribersOnly ? `${productNameAr} - متوفر فقط للمشتركين 🟡` : messageAvailable,
          parse_mode: 'Markdown',
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                { text: '📦 المنتجات', url: 'https://www.dzrt.com/ar-sa/products' },
                { text: ' المنتـج 🟢', url: `https://www.dzrt.com/ar-sa/products/${productUrl}` }
              ],
              [
                { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar-sa/login' }
              ]
            ]
          })
        });

        // نشر تغريدة على تويتر مع تمييز المنتجات المتاحة للمشتركين فقط
        const tweetMessage = isForSubscribersOnly 
          ? `${productNameAr} - للمشتركين 👀👀\n#دزرت #تنبيه\n\nhttps://www.dzrt.com/ar-sa/products/${productUrl}`
          : `${productNameAr} - 👀👀👀👀👀👇🏻 #دزرت #تنبيه \n\nhttps://www.dzrt.com/ar-sa/products/${productUrl}`;
        
        try {
          const mediaId = await twitterClient.v1.uploadMedia(imageUrlAvailableTwitter); // تحميل الصورة إلى تويتر
          await twitterClient.v2.tweet({ text: tweetMessage, media: { media_ids: [mediaId] } });
        } catch (error) {
 //         console.error('Error posting tweet:', error);
        }

        productStatus[productUrl].isNotifying = false;
      }, 180000); // تأخير لمدة 3 دقائق (180000 مللي ثانية)
    }
  }

  // إذا كان المنتج غير متوفر
  if (!isAvailable && productStatus[productUrl].isAvailable && !productStatus[productUrl].isOutOfStockNotified) {
    productStatus[productUrl].isAvailable = false;
    productStatus[productUrl].isOutOfStockNotified = true;
    console.log(`${productNameAr} ✅ - المنتج متوفر الآن`);

    // حساب مدة التوفر
    const timeAvailable = currentTime - productStatus[productUrl].availableStartTime;
    const minutesAvailable = Math.floor(timeAvailable / 60000);
    const secondsAvailable = Math.floor((timeAvailable % 60000) / 1000);

    const messageOutOfStockWithTime = `نفذ المنتج *${productNameAr}* ❌\nبقى متوفرا لمدة: ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;

    const imageUrlUnAvailable = path.join(__dirname, 'images', `${productNames[productUrl].en}-outofstock.png`);

    await bot.sendPhoto(chatId, imageUrlUnAvailable, {
      caption: messageOutOfStockWithTime,
      parse_mode: 'Markdown',
    });

    productStatus[productUrl].notificationLock = true;
    setTimeout(() => {
      productStatus[productUrl].notificationLock = false;
    }, 90000); // قفل لمدة 90 ثانية
  }
}


// دالة لفحص الصفحة الرئيسية
async function checkHomePage() {
  try {
    const url = 'https://www.dzrt.com/en-sa/products';
    const data = await cloudscraper.get(url);
    const $ = cheerio.load(data);

    $('a[href*="/products/"]').each(async function () {
      const productUrl = $(this).attr('href').split('/products/')[1];
      const isOutOfStock = $(this).find('span:contains("OUT OF STOCK")').length > 0;
      const isAvailable = !isOutOfStock;

      if (productNames[productUrl]) {
        const productNameAr = productNames[productUrl].ar;

        const imageUrlAvailableTelegram = path.join(__dirname, '..', 'images', `${productNames[productUrl].en}.png`);
        const imageUrlAvailableTwitter = path.join(__dirname, '..', 'images', `${productNames[productUrl].en}-twitter.png`);

        const messageAvailable = `*${productNameAr}* - متوفر الآن ✅`;
        const messageOutOfStock = `نفاذ المنتج *${productNameAr}* ❌`;

        const inventoryQuantity = await getInventoryDetails(`https://www.dzrt.com/ar-sa/products/${productUrl}`);
        const isForSubscribersOnly = !isOutOfStock && inventoryQuantity === 0;

        await sendNotification(productUrl, productNameAr, imageUrlAvailableTelegram, imageUrlAvailableTwitter, isAvailable, isForSubscribersOnly, messageAvailable, messageOutOfStock);
      }
    });
  } catch (error) {
    console.error(`Error while checking homepage: ${error}`);
  }
}

// دالة لجدولة الفحص كل دقيقتين
function checkEveryTwoMinutes() {
  checkHomePage();
  const interval = 10000; // 120,000 مللي ثانية (2 دقائق)
  setTimeout(checkEveryTwoMinutes, interval);
}

// بدء الفحص كل دقيقتين
checkEveryTwoMinutes();
