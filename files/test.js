const axios = require('axios');
const cheerio = require('cheerio-without-node-native');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const express = require('express');
const path = require('path');
const mysql = require('mysql2');
require('dotenv').config();

const productNames = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush' },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost' },
  'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
  'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila' },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra' },
};

const urls = [
  'https://www.dzrt.com/ar/icy-rush.html',
  'https://www.dzrt.com/ar/seaside-frost.html',
  'https://www.dzrt.com/ar/highland-berries.html',
  'https://www.dzrt.com/ar/haila.html',
  'https://www.dzrt.com/ar/samra.html',
];

const channels = {
  'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush', chatId: process.env.CHAT_ID_ICY_RUSH },
  'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد فروست', en: 'seaside-frost', chatId: process.env.CHAT_ID_SEASIDE },
  'https://www.dzrt.com/ar/samra.html': { ar: 'سمرة', en: 'samra', chatId: process.env.CHAT_ID_SAMRA },
};

const mainChannelId = process.env.CHAT_ID_MAIN;
const token = process.env.TOKEN3;
const bot = new TelegramBot(token, { polling: true });

let productStatus = {};

urls.forEach(url => {
  productStatus[url] = { isAvailable: false, lastNotificationTime: 0, messageId: null };
});


async function checkProductAvailability(url) {
  try {


    if (productNames[url]) {
      const productNameAr = productNames[url].ar;
      const imageUrl = path.join(__dirname, 'images', `${productNames[url].en}.png`);

      if (!isUnavailable && !productStatus[url].isAvailable) {
        const message = `*${productNameAr}* - متوفر الآن 🟢 !`;
        const productUrl = url;
        const replyMarkup = {
          inline_keyboard: [
            [
              { text: 'شراء سريع ⚡', url: 'https://www.dzrt.com/ar/onestepcheckout.html' },
              { text: 'إضافة للسلة 🛒', url: productUrl }
            ],
            [
              { text: 'اعادة الطلب 🔁', url: 'https://www.dzrt.com/ar/sales/order/history/' }
            ]
          ]
        };

        console.log(message);
        
        // إرسال الإشعار إلى القناة الخاصة بالمنتج إذا كانت محددة
        if (channels[url]) {
          const sentMessage = await bot.sendPhoto(channels[url].chatId, imageUrl, { caption: message, parse_mode: 'Markdown', reply_markup: replyMarkup });
          if (productStatus[url].messageId) {
            await bot.deleteMessage(channels[url].chatId, productStatus[url].messageId);
          }
          productStatus[url].messageId = sentMessage.message_id;
        }

        // إرسال الإشعار إلى القناة الرئيسية
        await bot.sendPhoto(mainChannelId, imageUrl, { caption: message, parse_mode: 'Markdown', reply_markup: replyMarkup });

        productStatus[url].isAvailable = true;
        productStatus[url].lastNotificationTime = currentTime;

      } else if (isUnavailable && productStatus[url].isAvailable) {




        productStatus[url].isAvailable = false;
        productStatus[url].lastNotificationTime = currentTime;
        productStatus[url].messageId = null;
      }
    }
  } catch (error) {
  }
}

async function checkAllUrls() {
  for (const url of urls) {
    await checkProductAvailability(url);
  }
}

cron.schedule('* * * * * *', () => {
  checkAllUrls();
});
