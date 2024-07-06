const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');
const cron = require('node-cron');
const rateLimit = require('rate-limiter-flexible');
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

const pool = mysql.createPool(dbConfig);

const activeUsers = new Map();
const userClicks = new Map();

const rateLimiter = new rateLimit.RateLimiterMemory({
  points: 1, // عدد النقاط المتاحة لكل فترة
  duration: 2, // المدة بالثواني لكل نقطة
  blockDuration: 10, // مدة الحظر بالثواني إذا تم تجاوز عدد النقاط المسموح بها
});

async function activateUserSubscription(userId, code, duration, callback) {
  let connection;
  try {
    connection = await pool.getConnection();
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

    await connection.execute('UPDATE users SET activated = true WHERE id = ?', [userId]);
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error activating subscription:', err);
    callback('⚠️ حدث خطأ أثناء تفعيل الاشتراك.');
  } finally {
    if (connection) connection.release();
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

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  userClicks.set(userId, 0);
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
        { text: 'تجربة مجانية 🎁', callback_data: 'free_trial_command' },
      ],
      [
        { text: 'قنوات التنبيهات 🔔', callback_data: 'notification_channels_command' },
        { text: 'تفعيل الاشتراك 🔑', callback_data: 'activate_subscription_command' }
      ],
      [
        { text: 'الدعم الفني 📩', url: 'https://t.me/MZZ_2' },
        { text: 'حالة الاشتراك 📊', callback_data: 'subscription_status_command' }
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
        { text: 'تمرة 🌴', url: 'https://t.me/+T62d0ZHKjfY2NTlk' },
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

  const mainKeyboardWithChannels = {
    inline_keyboard: [
      [
        { text: 'الدعم الفني 📩', url: 'https://t.me/MZZ_2' },
        { text: 'قنوات التنبيهات 🔔', callback_data: 'notification_channels_command' }
      ],
      [
        { text: 'رابط المتجر 🛒', url: 'https://www.dzrt.com/ar/our-products.html' }
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


  bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const callbackUserId = callbackQuery.from.id;
    if (callbackUserId !== userId) return;
  
    // التحقق من النقر المتتالي السريع
    if (data !== 'start') { // استثناء زر الرجوع من التحقق
      try {
        await rateLimiter.consume(callbackUserId.toString());
      } catch (rateLimiterRes) {
        bot.answerCallbackQuery(callbackQuery.id, {
          text: '⚠️\n\nتجنب النقر المتتالي على الأزرار \n\n تم إيقاف البوت لمدة قصيرة',
          show_alert: true
        });
        return;
      }
    }
  
    const updateMessage = (text, keyboard, msg) => {
      const isContentDifferent = msg.text !== text;
      const isKeyboardDifferent = JSON.stringify(msg.reply_markup) !== JSON.stringify(keyboard);
  
      if (isContentDifferent || isKeyboardDifferent) {
        bot.editMessageText(text, {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        }).catch((error) => {
          if (error.response.body.error_code === 400 && error.response.body.description.includes("message is not modified")) {
          }
        });
      }
    };

    if (data === 'notification_channels_command') {
      const notificationChannelsText = `
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
      updateMessage(notificationChannelsText, notificationChannelsKeyboard, msg);
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
      updateMessage(activationMessage, keyboard, msg);

      activeUsers.set(userId, 'activating');

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
        updateMessage(response, keyboard, msg);
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
      updateMessage(extendMessage, keyboard, msg);

      activeUsers.set(userId, 'extending');

    } else if (data === 'support_command') {
      const supportMessage = ``;
      const keyboard = {
        inline_keyboard: [
          [
            { text: 'رجوع 🔙', callback_data: 'start' }
          ]
        ]
      };
      updateMessage(supportMessage, keyboard, msg);
    } else if (data === 'free_trial_command') {
      handleFreeTrial(userId, async (response, showChannelsButton) => {
        const keyboard = showChannelsButton ? mainKeyboardWithChannels : mainKeyboard;
        updateMessage(response, keyboard, msg);
      });
    } else if (data === 'start') {
      updateMessage(welcomeMessage, mainKeyboard, msg);
    }
  });

  bot.on('message', async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (activeUsers.has(userId) && (activeUsers.get(userId) === 'activating' || activeUsers.get(userId) === 'extending')) {
      const code = msg.text.trim();
      const action = activeUsers.get(userId);
      activeUsers.delete(userId);

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
    connection = await pool.getConnection();
    const [results] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (results.length === 0 || results[0].activated === 0) {
      callback('ليس لديك اشتراك حاليًا ⚠️ ');
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
    if (connection) connection.release();
  }
}

async function activateSubscription(userId, code, callback) {
  let connection;
  try {
    connection = await pool.getConnection();
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
    if (connection) connection.release();
  }
}

async function handleFreeTrial(userId, callback) {
  let connection;
  try {
    connection = await pool.getConnection();
    const [results] = await connection.execute('SELECT trial_used, activated FROM users WHERE id = ?', [userId]);

    if (results.length > 0) {
      const user = results[0];
      const [trialCountResult] = await connection.execute('SELECT count FROM trial_usage WHERE id = 1');
      const trialCount = trialCountResult[0].count;

      if (user.trial_used) {
        callback('لقد استخدمت التجربة المجانية مسبقًا ⚠️.\n\nبامكانك الاشتراك من هنا:\n[رابط المتجر] او الضغط على زر المتجر👇🏻\n\n https://www.dzrt.com/ar/our-products.html', true);
      } else if (user.activated) {
        callback('لديك اشتراك نشط حاليًا ⚠️.', true);
      } else if (trialCount >= 20) {
        callback('لقد تم استخدام جميع الاشتراكات التجريبية المجانية لهذا اليوم ⚠️.', true);
      } else {
        await activateFreeTrial(userId, connection);
        await connection.execute('UPDATE trial_usage SET count = count + 1 WHERE id = 1');
        console.log('Trial count after update:', trialCount + 1);
        callback('تم تفعيل الاشتراك التجريبي المجاني ليوم واحد بنجاح 🎉 \n\n  قم بالضغط على قنوات التنبيهات وانضم الى ماترغب به', true);
      }
    } else {
      const [trialCountResult] = await connection.execute('SELECT count FROM trial_usage WHERE id = 1');
      const trialCount = trialCountResult[0].count;

      if (trialCount >= 20) {
        callback('لقد تم استخدام جميع الاشتراكات التجريبية المجانية لهذا اليوم ⚠️.\n\n يوميا الساعه 12 ظهرا سيتم اعادة تعيين التجربة الى اول 20 شخص', true);
      } else {
        await activateFreeTrial(userId, connection);
        await connection.execute('UPDATE trial_usage SET count = count + 1 WHERE id = 1');
        callback('تم تفعيل الاشتراك التجريبي المجاني ليوم واحد بنجاح 🎉 \n\n قم بالضغط على قنوات التنبيهات وانضم الى ماترغب به', true);
      }
    }
  } catch (err) {
    console.error('Error handling free trial:', err);
    callback('⚠️ حدث خطأ أثناء تفعيل الاشتراك التجريبي.', false);
  } finally {
    if (connection) connection.release();
  }
}

async function activateFreeTrial(userId, connection) {
  const startDate = new Date().toISOString().split('T')[0];
  let expiryDate = new Date();
  expiryDate.setHours(23, 59, 59, 999); // تعيين وقت الانتهاء ليكون في نهاية اليوم الحالي

  const insertOrUpdateQuery = `
    INSERT INTO users (id, activated, subscriptionType, startDate, expiryDate, trial_used)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE activated = VALUES(activated), subscriptionType = VALUES(subscriptionType), startDate = VALUES(startDate), expiryDate = VALUES(expiryDate), trial_used = VALUES(trial_used)
  `;
  await connection.execute(insertOrUpdateQuery, [userId, true, '1 يوم', startDate, expiryDate.toISOString().split('T')[0], true]);
}

// جدولة إعادة تعيين العداد عند الساعة 12 ظهرًا
cron.schedule('31 5 * * *', async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.execute('UPDATE trial_usage SET count = 0 WHERE id = 1');
  } catch (err) {
    console.error('Error resetting trial count:', err);
  } finally {
    if (connection) connection.release();
  }
});

