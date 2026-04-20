# Channel Alert Bot — بوت تنبيهات توفر المنتجات

بوت تيليغرام يراقب منتجات عالية الطلب تنفد خلال دقائق، ويُرسل إشعارات فورية بالصورة لقنوات مخصصة. مدمج معه نظام يُدير عضوية المشتركين تلقائيًا.

>  مشروع خاص — معروض كنموذج عمل فقط

---

## فكرة المشروع

منتجات تنفد في دقائق معدودة — المستخدم الذي يعرف أولًا يشتري أولًا. البوت يفحص صفحات المنتجات كل ثانية، ويُرسل إشعارًا فوريًا مع أزرار شراء مباشرة لحظة التوفر. وعند النفاد يُعلن كم بقي المنتج متاحًا بالثواني.

---

## التقنيات المستخدمة

**Node.js · Telegram Bot API · cheerio · cloudscraper · MySQL2 · node-cron · axios**

---

## شرح الكود — ميزة بميزة

### 1. Web Scraping مع تجاوز Cloudflare
```js
const pageContent = await cloudscraper.get(url);
const $ = cheerio.load(pageContent);
const isOutOfStock = $('span:contains("OUT OF STOCK")').length > 0;
```
الموقع محمي بـ Cloudflare — `cloudscraper` يتجاوز هذه الحماية تلقائيًا. بعدها `cheerio` يُحلل الـ HTML ويبحث عن نص "OUT OF STOCK". إذا لم يجده، المنتج متوفر.

---

### 2. مراقبة مستمرة كل ثانية بدون توقف
```js
const monitorAvailability = async () => {
  try {
    await checkProductPages();
  } finally {
    setTimeout(monitorAvailability, 1000);
  }
};
monitorAvailability();
```
يستخدم `setTimeout` داخل `finally` — حتى لو حدث خطأ في أي دورة، المراقبة لا تتوقف وتُعيد المحاولة بعد ثانية.

---

### 3. فاصل زمني بين كل منتج
```js
await delay(500); // 500ms بين كل منتج
```
8 منتجات يُفحص كل واحد منها مع فاصل نصف ثانية. يمنع إرهاق الموقع بطلبات متزامنة ويتجنب الحظر.

---

### 4. إدارة حالة كل منتج في الذاكرة
```js
productStatus[url] = {
  isAvailable: false,       // هل متوفر الآن؟
  isNotifying: false,       // هل في منتصف إرسال إشعار؟
  isOutOfStockNotified: false, // هل أُرسل إشعار النفاد؟
  availableStartTime: null, // متى بدأ التوفر؟
  notificationLock: false   // قفل منع التكرار
};
```
كل منتج له 5 متغيرات تتحكم في منطق الإشعارات. يمنع الإشعارات المكررة ويتتبع دورة التوفر بدقة.

---

### 5. إشعار التوفر — صورة + أزرار شراء فوري
```js
await bot.sendPhoto(channels[url].chatId, imageUrlAvailable, {
  caption: `*${productInfo.ar}* - متوفر الآن ✅`,
  reply_markup: JSON.stringify({
    inline_keyboard: [
      [{ text: 'شراء سريع ⚡', url: 'dzrt.com/checkout' },
       { text: 'المنتج 🟢', url: productUrl }],
      [{ text: 'المنتجات 🛒', url: '...' },
       { text: 'إعادة الطلب 🔁', url: '...' }],
      [{ text: 'تسجيل دخول 🔒', url: '...' }]
    ]
  })
});
```
الإشعار يُرسل لقناة المنتج المحددة **والقناة الرئيسية** في نفس الوقت. الأزرار مرتبة بالأهم أولًا — شراء سريع في الأعلى.

---

### 6. قنوات مخصصة لكل منتج عالي الطلب
```js
const channels = {
  'icy-rush':      { chatId: process.env.CHAT_ID_ICY_RUSH },
  'seaside-frost': { chatId: process.env.CHAT_ID_SEASIDE },
  'garden-mint':   { chatId: process.env.CHAT_ID_GARDEN },
  'mint-fusion':   { chatId: process.env.CHAT_ID_MINT },
  'hamidh':        { chatId: process.env.CHAT_ID_HAILA },
  'unqood':        { chatId: process.env.CHAT_ID_PURPLE },
  'manga':         { chatId: process.env.CHAT_ID_TAMRA },
  'bonna':         { chatId: process.env.CHAT_ID_SAMRA },
};
```
كل منتج له قناة مستقلة — المشترك يختار المنتجات التي يهتم بها فقط ولا يتلقى إشعارات عن غيرها.

---

### 7. إشعار النفاد مع توقيت دقيق بالثواني
```js
const timeAvailable = currentTime - productStatus[url].availableStartTime;
const hoursAvailable   = Math.floor(timeAvailable / (1000 * 60 * 60));
const minutesAvailable = Math.floor((timeAvailable % (1000 * 60 * 60)) / (1000 * 60));
const secondsAvailable = Math.floor((timeAvailable % (1000 * 60)) / 1000);

// النتيجة مثلاً:
// "نفذ المنتج ❌ — بقي متوفرًا لمدة: 3 دقائق و 47 ثانية."
```
البوت يحفظ وقت التوفر، وعند النفاد يحسب الفرق ويعرضه بدقة. معلومة مفيدة للمستخدمين لمعرفة سرعة النفاد.

---

### 8. Notification Lock لمنع الإشعارات المكررة
```js
productStatus[url].notificationLock = true;
setTimeout(() => {
  productStatus[url].notificationLock = false;
}, 5000);
```
بعد إشعار النفاد، يُغلق البوت إمكانية إرسال إشعار جديد لمدة 5 ثوانٍ. يمنع الإشعارات المتكررة إذا تذبذب المخزون.

---

### 9. قبول طلبات الانضمام تلقائيًا
```js
bot.on('chat_join_request', (request) => {
  handleJoinRequests(request);
});

// داخل handleJoinRequests:
const [results] = await connection.query(query, [userId]);
if (results.length > 0) {
  await approveJoinRequestWithDelay(channelId, userId);
}
```
عند طلب انضمام لأي قناة، البوت يتحقق من قاعدة البيانات — إذا المستخدم مشترك يقبله تلقائيًا، وإذا لا فلا.

---

### 10. تأخير 5 ثوانٍ عند قبول الطلبات
```js
const approveJoinRequestWithDelay = (channelId, userId) => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      await bot.approveChatJoinRequest(channelId, userId);
      resolve();
    }, 5000);
  });
};
```
تأخير مقصود لتجنب تجاوز حدود Telegram API عند وصول طلبات كثيرة في وقت واحد.

---

### 11. فحص الاشتراكات المنتهية — جدولة يومية
```js
cron.schedule('30 1 * * *', () => {
  checkUserSubscriptions();
});
```
كل يوم الساعة 1:30 صباحًا البوت يفحص جميع المشتركين:
- **تبقى يومان أو أقل** → إرسال تنبيه بتاريخ الانتهاء
- **انتهى الاشتراك** → إزالة من جميع القنوات + تعطيل الحساب

---

### 12. الإزالة من 11 قناة دفعةً واحدة
```js
const channelIds = [
  CHAT_ID_MAIN, CHAT_ID_ICY_RUSH, CHAT_ID_SEASIDE,
  CHAT_ID_SAMRA, CHAT_ID_HIGH, CHAT_ID_GARDEN,
  CHAT_ID_MINT, CHAT_ID_HAILA, CHAT_ID_PURPPLE,
  CHAT_ID_EDGY, CHAT_ID_TAMRA
];
await unbanUserFromAllChannels(userId, channelIds);
```
بدل الإزالة اليدوية، البوت يمر على كل القنوات ويُزيل المستخدم تلقائيًا مع تأخير ثانيتين بين كل قناة لتجنب حدود Telegram API.

---

### 13. معالجة الأخطاء في الإزالة
```js
} catch (error) {
  if (error.response.body.description === 'Bad Request: PARTICIPANT_ID_INVALID') {
    // المستخدم غير موجود في القناة — يتجاوز بصمت
  } else {
    console.error(`Failed to unban user ${userId}:`, error);
  }
}
```
إذا المستخدم لم يكن في القناة أصلًا، الكود يتجاوز الخطأ بصمت بدل أن يتوقف.

---

### 14. إرسال الإشعارات على دفعات — Batch Processing
```js
const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES = 10000; // 10 ثوانٍ بين كل دفعة

for (let i = 0; i < usersToNotify.length; i += BATCH_SIZE) {
  const batch = usersToNotify.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(user => notifyUser(user)));
  await delay(DELAY_BETWEEN_BATCHES);
}
```
عند إرسال إشعارات لعدد كبير من المستخدمين، يُرسل 20 رسالة في نفس الوقت ثم ينتظر 10 ثوانٍ — يحترم حدود Telegram API ولا يُحظر.

---

## 🗄️ قاعدة البيانات — الجدول وكيف يتعامل معه البوت

بوت التنبيهات يتعامل مع **جدول واحد** فقط — جدول `users` — لكنه يقرأ ويكتب ويتخذ قرارات منه بشكل كامل.

---

### جدول `users` — المرجع الأساسي

| العمود | النوع | الوصف |
|---|---|---|
| `id` | BIGINT | معرف المستخدم من تيليغرام — المفتاح الأساسي |
| `activated` | BOOLEAN | `1` = مشترك نشط، `0` = منتهي |
| `subscriptionType` | VARCHAR | نص يصف المدة مثل `"3 أشهر"` أو `"7 يوم"` |
| `startDate` | DATE | تاريخ بداية الاشتراك |
| `expiryDate` | DATE | تاريخ انتهاء الاشتراك — الأساس في كل القرارات |

---

### كيف يستخدم البوت هذا الجدول؟

**1. عند طلب الانضمام لقناة:**
```js
// هل هذا المستخدم مشترك نشط؟
SELECT id FROM users WHERE id = ? AND activated = true
// إذا رجع نتيجة → يقبل الطلب
// إذا لم يرجع → يتجاهل الطلب
```

**2. في الفحص اليومي (1:30 صباحًا):**
```js
// يجلب جميع المشتركين النشطين
SELECT id, expiryDate FROM users WHERE activated = true

// ثم يصنفهم:
// expiryDate < اليوم         → اشتراك منتهي  → يُزال من القنوات
// الفرق <= يومان             → اشتراك قارب النهاية → يُرسل له تنبيه
```

**3. بعد انتهاء الاشتراك — تعطيل تلقائي:**
```js
UPDATE users SET activated = 0 WHERE id = ?
```
بعد الإزالة من القنوات مباشرة، يُحدّث حقل `activated` إلى `0` في قاعدة البيانات.

---

### دورة حياة المستخدم في قاعدة البيانات

```
التفعيل (بوت الاشتراكات)
    activated = 1
    expiryDate = تاريخ الانتهاء
         ↓
طلب انضمام لقناة
    SELECT id WHERE activated = true
    ✅ موجود → قبول تلقائي
         ↓
الفحص اليومي
    expiryDate قارب النهاية → تنبيه
    expiryDate انتهى        → إزالة من القنوات
         ↓
تعطيل الحساب
    activated = 0
         ↓
المستخدم يجدد → يعود activated = 1
```

---

## 📸 نموذج إشعار التوفر

```
[صورة المنتج]

منتج عالي الطلب - متوفر الآن ✅

[ شراء سريع ⚡ ]  [ المنتج 🟢       ]
[ المنتجات 🛒   ]  [ إعادة الطلب 🔁 ]
[     تسجيل دخول 🔒      ]
```

## 📸 نموذج إشعار النفاد

```
[صورة نافد]

نفذ المنتج ❌
بقي متوفرًا لمدة: 3 دقائق و 47 ثانية.
```
