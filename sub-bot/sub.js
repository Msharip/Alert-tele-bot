const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT
};

const token = process.env.TOKEN4;
const bot = new TelegramBot(token, { polling: true });

async function activateUserSubscription(userId, code, duration, callback) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.beginTransaction();

    const [existingUsers] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const user = existingUsers.length > 0 ? existingUsers[0] : null;

    if (user) {
      await extendUserSubscription(connection, userId, code, duration, callback);
    } else {
      const startDate = new Date().toISOString().split('T')[0];
      let expiryDate = new Date();
      if (duration < 0) {
        expiryDate.setDate(expiryDate.getDate() - duration);
      } else {
        expiryDate.setMonth(expiryDate.getMonth() + duration);
      }

      const insertQuery = `
        INSERT INTO users (id, activated, subscriptionType, startDate, expiryDate)
        VALUES (?, ?, ?, ?, ?)
      `;
      await connection.execute(insertQuery, [userId, true, `${Math.abs(duration)} ${duration < 0 ? 'يوم' : 'أشهر'}`, startDate, expiryDate.toISOString().split('T')[0]]);
      await deleteActivationCode(connection, code);
      await connection.commit();
      callback(`**تم تفعيل اشتراكك بنجاح لمدة ${Math.abs(duration)} ${duration < 0 ? 'يوم' : 'أشهر'}.** 🎉`);
    }
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error activating subscription:', err);
    callback('⚠️ حدث خطأ أثناء تفعيل الاشتراك.');
  } finally {
    if (connection) await connection.end();
  }
}

async function extendUserSubscription(connection, userId, code, duration, callback) {
  try {
    const [existingUsers] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const user = existingUsers.length > 0 ? existingUsers[0] : null;

    if (!user) {
      callback('ليس لديك اشتراك حاليًا ⚠️ ');
      return;
    }

    let expiryDate = new Date(user.expiryDate);
    let totalDuration = '';

    if (user.subscriptionType.includes('يوم')) {
      if (duration > 0) {
        expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + duration);
        totalDuration = `${duration} أشهر`;
      } else {
        expiryDate.setDate(expiryDate.getDate() - duration);
        const totalDays = user.subscriptionType.match(/\d+/) ? parseInt(user.subscriptionType.match(/\d+/)[0]) - duration : Math.abs(duration);
        totalDuration = `${totalDays} يوم`;
      }
    } else {
      if (duration < 0) {
        expiryDate.setDate(expiryDate.getDate() - duration);
        const totalMonths = user.subscriptionType.match(/\d+/) ? parseInt(user.subscriptionType.match(/\d+/)[0]) + Math.floor(duration / 30) : Math.abs(duration);
        totalDuration = `${totalMonths} أشهر`;
      } else {
        expiryDate.setMonth(expiryDate.getMonth() + duration);
        const totalMonths = user.subscriptionType.match(/\d+/) ? parseInt(user.subscriptionType.match(/\d+/)[0]) + duration : duration;
        totalDuration = `${totalMonths} أشهر`;
      }
    }

    const updateQuery = `
      UPDATE users SET expiryDate = ?, subscriptionType = ? WHERE id = ?
    `;
    await connection.execute(updateQuery, [expiryDate.toISOString().split('T')[0], totalDuration, userId]);
    await deleteActivationCode(connection, code);
    await connection.commit();
    callback(`**تم تمديد اشتراكك بنجاح لمدة ${Math.abs(duration)} ${duration < 0 ? 'يوم' : 'أشهر'}.**\n\n الآن مجموع الاشتراك هو ${totalDuration} 🎉`);
  } catch (err) {
    console.error('Error extending subscription:', err);
    callback('⚠️ حدث خطأ أثناء تمديد الاشتراك.');
  }
}

async function deleteActivationCode(connection, code) {
  const deleteQuery = 'DELETE FROM activationcodes WHERE activation_code = ?';
  await connection.execute(deleteQuery, [code]);
}

const activeUsers = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const welcomeMessage = `
⚡ **انضم إلى البوت الأسرع والأكثر تقدمًا** ⚡

قروب دزرت فوري العام 👇🏻:
[قروب دزرت فوري](https://t.me/+hrIusgChjeMwY2Zk)

- قم بزيارة متجرنا الآن
- أكمل عملية الشراء
- استخدم الرمز لتفعيل الاشتراك
- وبإمكانك تمديد اشتراكك
عن طريق زر *معرفة الاشتراك*

👇🏻 **انضم الآن وقم بزيارة المتجر والاشتراك!** 👇🏻
[رابط متجر دزرت فوري](https://dzrt.com)
`;

  const mainKeyboard = {
    inline_keyboard: [
      [
        { text: 'قنوات التنبيهات 🔔', callback_data: 'notification_channels_command' },
        { text: 'تفعيل الاشتراك 🔑', callback_data: 'activate_subscription_command' }
      ],
      [
        { text: 'الدعم الفني 📩', url: 'https://t.me/MZZ_2' },
        { text: ' حالة الاشتراك 📊', callback_data: 'subscription_status_command' }
      ],
      [
        { text: 'رابط المتجر 🛒', url: 'https://www.dzrt.com/ar/our-products.html' }
      ]
    ]
  };

  const notificationChannelsKeyboard = {
    inline_keyboard: [
      [
        { text: 'سي سايد 🌊', url: 'https://t.me/+5sBd8-LCYR9hMDBk' },
        { text: 'ايسي رش ❄️', url: 'https://t.me/+gqDbjTPNS9NiMjJk' }
      ],
      [
        { text: 'هيلة 🌾', url: 'https://t.me/+iPjCEuLjIadkMmU0' },
        { text: 'هيلاند بيريز 🍇', url: 'https://t.me/+-l3iURW1JJQ2MDBk' }
      ],
      [
        { text: 'تمرة  🌴', url: 'https://t.me/+T62d0ZHKjfY2NTlk' },
        { text: 'سمرة 🌟', url: 'https://t.me/+MSFh3FWe_vs5MjY0' }
      ],
      [
        { text: 'جاردن منت 🍃', url: 'https://t.me/+Sul2NHCi-s9jNGM8' },
        { text: 'منت فيوجن 🍃', url: 'https://t.me/+G3R8OkjZk2w1ZWE8' }
      ],
      [
        { text: 'بيربل ميست 🌺', url: 'https://t.me/+b529gE_uouxiOThk' },
        { text: 'ايدجي منت ☘ ', url: 'https://t.me/+P34lacNg8gZiOTlk' }
      ],
      [
        { text: 'جميع المنتجات 🛒', url: 'https://t.me/+3imWhRxXVngxMWE0' }
      ],
      [
        { text: 'رجوع 🔙', callback_data: 'start' }
      ]
    ]
  };

  bot.sendMessage(chatId, welcomeMessage, {
    reply_markup: mainKeyboard,
    parse_mode: 'Markdown'
  });

  bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const callbackUserId = callbackQuery.from.id;

    if (callbackUserId !== userId) return;

    const updateMessage = (text, keyboard) => {
      if (msg.text !== text || JSON.stringify(msg.reply_markup) !== JSON.stringify(keyboard)) {
        bot.editMessageText(text, {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        }).catch(error => {
          console.error(error);
        });
      }
    };

    if (data === 'notification_channels_command') {
      const notificationChannelsText =  `
      ⚡ **انضم إلى البوت الأسرع والأكثر تقدمًا** ⚡
      
      قروب دزرت فوري العام 👇🏻:
      [قروب دزرت فوري](https://t.me/+hrIusgChjeMwY2Zk)
      
      - قم بزيارة متجرنا الآن
      - أكمل عملية الشراء
      - استخدم الرمز لتفعيل الاشتراك
      - وبإمكانك تمديد اشتراكك
      عن طريق زر *معرفة الاشتراك*
      
      👇🏻 **انضم الآن وقم بزيارة المتجر والاشتراك!** 👇🏻
      [رابط متجر دزرت فوري](https://dzrt.com)
      `;
      updateMessage(notificationChannelsText, notificationChannelsKeyboard);
    } else if (data === 'activate_subscription_command') {
      const activationMessage = `
**قم بإدخال الرمز لتفعيل الاشتراك 🔑:**
      `;
      const keyboard = {
        inline_keyboard: [
          [
            { text: 'رجوع 🔙', callback_data: 'start' }
          ]
        ]
      };
      updateMessage(activationMessage, keyboard);

      activeUsers[userId] = 'activating';

    } else if (data === 'subscription_status_command') {
      getSubscriptionStatus(userId, (response) => {
        const keyboard = {
          inline_keyboard: [
            [
              { text: 'تمديد الاشتراك 🔄', callback_data: 'extend_subscription_command' }
            ],
            [
              { text: 'رجوع 🔙', callback_data: 'start' }
            ]
          ]
        };
        updateMessage(response, keyboard);
      });
    } else if (data === 'extend_subscription_command') {
      const extendMessage = `
**قم بإدخال الرمز لتمديد الاشتراك 🔄:**
      `;
      const keyboard = {
        inline_keyboard: [
          [
            { text: 'رجوع 🔙', callback_data: 'subscription_status_command' }
          ]
        ]
      };
      updateMessage(extendMessage, keyboard);

      activeUsers[userId] = 'extending';

    } else if (data === 'support_command') {
      const supportMessage = `
**الدعم الفني:**

للحصول على المساعدة
يمكنك التواصل معنا عبر الرابط التالي:

[الدعم الفني](https://t.me/MZZ_2)
      `;
      const keyboard = {
        inline_keyboard: [
          [
            { text: 'رجوع 🔙', callback_data: 'start' }
          ]
        ]
      };
      updateMessage(supportMessage, keyboard);
    } else if (data === 'start') {
      updateMessage(welcomeMessage, mainKeyboard);
    }
  });

  bot.on('message', async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (activeUsers[userId] === 'activating' || activeUsers[userId] === 'extending') {
      const code = msg.text.trim();
      const action = activeUsers[userId];
      delete activeUsers[userId];

      const callback = async (res) => {
        await bot.sendMessage(chatId, res, { parse_mode: 'Markdown' });

        if (!res.includes('⚠️')) {
          const fullResponse = `
          **  قنوات  التنبيهات 🔔 :  
اختر قناة المنتجات التي ترغب بها


واستمتع باسرع اشعارات لمنتجاتك المخصصة:**`;
          await bot.sendMessage(chatId, fullResponse, {
            reply_markup: notificationChannelsKeyboard,
            parse_mode: 'Markdown'
          });
        }
      };

      if (action === 'activating') {
        await activateSubscription(userId, code, callback);
      } else if (action === 'extending') {
        await activateSubscription(userId, code, callback);
      }
    }
  });
});

async function getSubscriptionStatus(userId, callback) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [results] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (results.length === 0) {
      callback(' ليس لديك اشتراك حاليًا ⚠️ ');
      return;
    }
    const user = results[0];
    const subscriptionType = user.subscriptionType;
    const remainingDays = Math.floor((new Date(user.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    callback(`📊 **حالة الاشتراك:**\n\n🔹 **نوع الاشتراك:** ${subscriptionType}\n🔹 **مدة باقية للاشتراك:** ${remainingDays} يومًا`);
  } catch (err) {
    console.error('Error getting subscription status:', err);
    callback('⚠️ حدث خطأ أثناء التحقق من حالة الاشتراك.');
  } finally {
    if (connection) await connection.end();
  }
}

async function getSubscriptionStatusText(userId) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [results] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (results.length === 0) {
      return ' ليس لديك اشتراك حاليًا ⚠️';
    }
    const user = results[0];
    const subscriptionType = user.subscriptionType;
    const remainingDays = Math.floor((new Date(user.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    return `📊 **حالة الاشتراك:**\n\n🔹 **نوع الاشتراك:** ${subscriptionType}\n🔹 **مدة باقية للاشتراك:** ${remainingDays} يومًا`;
  } catch (err) {
    console.error('Error getting subscription status:', err);
    return '⚠️ حدث خطأ أثناء التحقق من حالة الاشتراك.';
  } finally {
    if (connection) await connection.end();
  }
}

async function activateSubscription(userId, code, callback) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [results] = await connection.execute('SELECT * FROM activationcodes WHERE activation_code = ?', [code]);
    if (results.length > 0) {
      const duration = results[0].duration_in_months;
      await activateUserSubscription(userId, code, duration, callback);
    } else {
      callback(' الرمز غير صالح⚠️');
    }
  } catch (err) {
    console.error('Error checking activation codes:', err);
    callback(' حدث خطأ أثناء التحقق من الكود⚠️');
  } finally {
    if (connection) await connection.end();
  }
}
