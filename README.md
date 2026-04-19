#  Channel Alert Bot — بوت تنبيهات 

بوت تيليغرام يراقب حاله توفر منتج عالي الطلب بشكل مستمر ويُرسل إشعارات فورية لقنوات تيليغرام المخصصة عند توفر أي منتج أو نفاده، مع إدارة طلبات الانضمام ومراقبة انتهاء الاشتراكات.

---

##المميزات

-مراقبة مستمرة للمنتج
- إشعار فوري عند توفر أي منتج مع صورة المنتج
- إشعار عند نفاد المنتج مع مدة توفره بالدقائق والثواني
- إرسال الإشعارات لقناة كل منتج + القناة الرئيسية
- قبول طلبات الانضمام للقنوات تلقائيًا للمشتركين
- تنبيه تلقائي للمشتركين قبل انتهاء اشتراكهم بيومين
-إزالة تلقائية للمستخدمين منتهي اشتراكهم من جميع القنوات
- حماية من Cloudflare عبر cloudscraper
---

##التقنيات المستخدمة

| التقنية | الاستخدام |
|---|---|
| Node.js | بيئة التشغيل |
| node-telegram-bot-api | التعامل مع Telegram API |
| axios | طلبات HTTP |
| cheerio | تحليل HTML (Web Scraping) |
| cloudscraper | تجاوز حماية Cloudflare |
| node-cron | جدولة المهام اليومية |
| MySQL2 | قاعدة البيانات |
| dotenv | إدارة المتغيرات البيئية |

---

## المتطلبات

- Node.js v16+
- MySQL Database
- بوتان على تيليغرام (بوت المراقبة + بوت الإشعارات)
- صور المنتجات في مجلد `/images`
- خادم يعمل بشكل مستمر (Heroku, Railway, VPS...)

---

## طريقة التثبيت

```bash
# استنساخ المشروع
git clone https://github.com/Msharip/test-.git
cd test-/channel-alert

# تثبيت الحزم
npm install
```

---

##إعداد صور المنتجات


```
images/
├── icy-rush.png              # صورة توفر المنتج 
├── icy-rush-outofstock.png   # صورة نفاد المنتج 
├── seaside-frost.png
├── seaside-frost-outofstock.png
├── garden-mint.png
├── garden-mint-outofstock.png
├── mint-fusion.png
├── mint-fusion-outofstock.png
├── Hamidh.png
├── Hamidh-outofstock.png
├── Unqood.png
├── Unqood-outofstock.png
├── Manga.png
├── Manga-outofstock.png
├── Bonna.png
└── Bonna-outofstock.png
```

---

##إعداد المتغيرات البيئية

```env
# توكن البوت الرئيسي (للمراقبة وقبول الطلبات)
TOKEN3=your_main_bot_token

# توكن البوت الفرعي (لإرسال رسائل للمستخدمين)
TOKEN5=your_sub_bot_token

# قاعدة البيانات
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_DATABASE=your_database_name
DB_PORT=3306

# معرفات القنوات
CHAT_ID_MAIN=your_main_channel_id
CHAT_ID_ICY_RUSH=your_icy_rush_channel_id
CHAT_ID_SEASIDE=your_seaside_channel_id
CHAT_ID_GARDEN=your_garden_channel_id
CHAT_ID_MINT=your_mint_channel_id
CHAT_ID_HAILA=your_hamidh_channel_id
CHAT_ID_PURPLE=your_unqood_channel_id
CHAT_ID_TAMRA=your_manga_channel_id
CHAT_ID_SAMRA=your_bonna_channel_id
CHAT_ID_HIGH=your_highland_channel_id
CHAT_ID_EDGY=your_edgy_channel_id
CHAT_ID_PURPPLE=your_purple_channel_id
```

---

## قاعدة البيانات

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  activated BOOLEAN DEFAULT false,
  subscriptionType VARCHAR(50),
  startDate DATE,
  expiryDate DATE
);
```

---

##تشغيل البوت

```bash
node channelalert.js
```

---

## كيف يعمل البوت؟

```
فحص حاله المنتج ── فحص صفحة كل منتج على الموقع الخاص بالمنتج
                    │
         ┌──────────┴──────────┐
      متوفر ✅               نافد ❌
         │                     │
  إشعار للقناة           إشعار بمدة التوفر
  الخاصة + الرئيسية       للقناة الخاصة
```

**جدولة يومية (1:30 ص):**
- فحص جميع المشتركين
- تنبيه من تبقى له يومان أو أقل
- إزالة منتهي الاشتراك من جميع القنوات تلقائيًا

---

#

---

##الرخصة
هذا المشروع خاص وغير مرخص للاستخدام العام.
