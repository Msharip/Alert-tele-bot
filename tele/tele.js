const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();
// دالة تأخير لتنفيذ الفاصل الزمني بين كل منتج

// بيانات Twitter API
const twitterClient = new TwitterApi({
  appKey: 'HrFfThKnzlbiuVXk2rBMfAndA',
  appSecret: 'NCejLvJb5E8RFfXGGw6lqGH7yqXUhSvjZsZPBthAmFVhhAR095',
  accessToken: '1791965388164440064-6p4RaldWOBEk4XLTlVaXrbT5C0JGVi',
  accessSecret: 'y9R2GZa8ZylPT3pR1BEL3ZYD9A5maVPhv7DIstD9AT2cf',
});

const productNames = {
  'purple-mist': { ar: 'بيربل مست', en: 'purple-mist' },
  'highland-berries': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'mint-fusion': { ar: 'منت فيوجن', en: 'mint-fusion' },
  'tamra': { ar: 'تمرة', en: 'tamra' }
};

// قناة واحدة لجميع المنتجات
const token = '6749756089:AAFMCjy0-85EkyQIrzC4tJU5jIyFJvpnLEI';
const chatId = '-1002122565496'; // معرف قناة Telegram الموحدة
const bot = new TelegramBot(token, { polling: false });

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

    // البحث عن `inventory_quantity` داخل السكريبتات
    $('script').each((i, script) => {
      const scriptContent = $(script).html();

      if (scriptContent.includes('inventory_quantity')) {
        const parts = scriptContent.split('inventory_quantity');
        if (parts.length > 1) {
          const afterInventory = parts[1];
          const match = afterInventory.match(/:\s*(-?\d+)/);
          if (match) {
            inventoryQuantity = parseInt(match[1]);
 //           console.log(`URL : ${url} = ${inventoryQuantity}`);
          }
        }
      }
    });
    return inventoryQuantity !== null ? inventoryQuantity : 0;
  } catch (error) {
 //   console.error(`خطأ أثناء جلب تفاصيل المخزون: ${error.message}`);
    return 0;
  }
};

// دالة لإرسال إشعارات Telegram و Twitter
async function sendNotification(productUrl, productNameAr, imageUrlAvailableTelegram, imageUrlAvailableTwitter, isAvailable, messageAvailable, messageOutOfStock) {
  const currentTime = Date.now();

  // إذا كان المنتج متوفر
  if (isAvailable && !productStatus[productUrl].isAvailable && !productStatus[productUrl].notificationLock) {

    productStatus[productUrl].isAvailable = true;
    productStatus[productUrl].isOutOfStockNotified = false;
    productStatus[productUrl].availableStartTime = currentTime;

    if (!productStatus[productUrl].isNotifying) {
      productStatus[productUrl].isNotifying = true;

      // إضافة تأخير لمدة 3 دقائق (180000 مللي ثانية) قبل إرسال الإشعارات
      setTimeout(async () => {
        // إرسال إشعار إلى القناة الموحدة على Telegram مع صورة معينة
        await bot.sendPhoto(chatId, imageUrlAvailableTelegram, {
          caption: messageAvailable,
          parse_mode: 'Markdown',
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                { text: '📦 المنتجات', url: 'https://www.dzrt.com/ar-sa/products' },
                { text: ' المنتـج 🟢', url: `https://www.dzrt.com/ar-sa/products${productUrl}` }              ],
              [
                { text: 'تسجيل دخول 🔒', url: 'https://www.dzrt.com/ar/customer/account/login' }
              ]
            ]
          })
        });

        // نشر تغريدة على تويتر مع صورة مختلفة
        const tweetMessage = `${productNameAr} - 👀👀👀👀👀👇🏻 #دزرت #تنبيه \n\nhttps://www.dzrt.com/ar-sa/${productUrl}`;
        const mediaId = await twitterClient.v1.uploadMedia(imageUrlAvailableTwitter); // تحميل الصورة إلى تويتر
        await twitterClient.v2.tweet({ text: tweetMessage, media: { media_ids: [mediaId] } });

        // إعادة ضبط الحالة
        productStatus[productUrl].isNotifying = false;
      }, 180000); // تأخير 3 دقائق لتليجرام
    }
  }

  // إذا كان المنتج غير متوفر
  if (!isAvailable && productStatus[productUrl].isAvailable && !productStatus[productUrl].isOutOfStockNotified) {
    productStatus[productUrl].isAvailable = false;
    productStatus[productUrl].isOutOfStockNotified = true;

    // حساب مدة التوفر
    const timeAvailable = currentTime - productStatus[productUrl].availableStartTime;
    const minutesAvailable = Math.floor(timeAvailable / 60000);
    const secondsAvailable = Math.floor((timeAvailable % 60000) / 1000);

    // تعديل الرسالة لتشمل مدة التوفر
    const messageOutOfStockWithTime = `نفذ المنتج *${productNameAr}* ❌\nبقى متوفرا لمدة: ${minutesAvailable} دقائق و ${secondsAvailable} ثواني.`;

    // مسار الصورة المخصصة لنفاد المنتج
    const imageUrlUnAvailable = path.join(__dirname, '..', 'images', `${productNames[productUrl].en}-outofstock.png`); // تأكد من وجود الصورة بالمسمى الصحيح

    // إرسال إشعار نفاد المنتج على Telegram مع صورة
    await bot.sendPhoto(chatId, imageUrlUnAvailable, {
      caption: messageOutOfStockWithTime,
      parse_mode: 'Markdown',
    });

    // قفل إشعار التوفر لمدة دقيقة ونصف (90 ثانية)
    productStatus[productUrl].notificationLock = true;
    setTimeout(() => {
      productStatus[productUrl].notificationLock = false;
    }, 90000);
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

  // تحقق مما إذا كان المنتج موجودًا في productNames قبل المتابعة
  if (productNames[productUrl]) {
    const isOutOfStock = $(this).find('span:contains("OUT OF STOCK")').length > 0;
    const isAvailable = !isOutOfStock; // المنتج متوفر إذا لم يكن OUT OF STOCK
    
    // إذا كان المنتج متوفرًا
    if (isAvailable) {
      // جلب كمية المخزون للمنتج
      const inventoryQuantity = await getInventoryDetails(`https://www.dzrt.com/ar-sa/products/${productUrl}`);
      
      // تحقق إذا كانت الكمية أكبر من 0
      if (inventoryQuantity > 50) {
        const productNameAr = productNames[productUrl].ar;
        const imageUrlAvailableTelegram = path.join(__dirname, '..', 'images', `${productNames[productUrl].en}.png`); // صورة Telegram
        const imageUrlAvailableTwitter = path.join(__dirname, '..', 'images', `${productNames[productUrl].en}-twitter.png`); // صورة Twitter
        const messageAvailable = `*${productNameAr}* - متوفر الآن ✅ `;
        const messageOutOfStock = `نفاذ المنتج *${productNameAr}* ❌`;

        await sendNotification(productUrl, productNameAr, imageUrlAvailableTelegram, imageUrlAvailableTwitter, isAvailable, messageAvailable, messageOutOfStock);
        }
      }
  }});
  } catch (error) {
  //  console.error(`حدث خطأ أثناء فحص الصفحة الرئيسية: ${error.message}`);
  }
}

function checkAllRandomly() {
  checkHomePage();
  const randomInterval = Math.floor(Math.random() * (90000 - 60000 + 1)) + 60000;
  setTimeout(checkAllRandomly, randomInterval);
}


checkAllRandomly();
