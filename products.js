// products.js

// أسماء المنتجات
const productNames = {
    'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush' },
    'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد', en: 'seaside-frost' },
    'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries' },
    'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint' },
    'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion' },
    'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila' },
    'https://www.dzrt.com/ar/dzrt-samra-special-edition.html': { ar: 'سمرة - أصدار خاص', en: 'samra-ed' },
    'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist' },
    'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت', en: 'edgy-mint' },
    'https://www.dzrt.com/ar/tamra.html': { ar: 'تمرة', en: 'tamra' },
  };
  
  // الروابط
  const urls = [
    'https://www.dzrt.com/ar/icy-rush.html',
    'https://www.dzrt.com/ar/seaside-frost.html',
    'https://www.dzrt.com/ar/tamra.html',
    'https://www.dzrt.com/ar/highland-berries.html',
    'https://www.dzrt.com/ar/garden-mint.html',
    'https://www.dzrt.com/ar/mint-fusion.html',
    'https://www.dzrt.com/ar/haila.html',
    'https://www.dzrt.com/ar/dzrt-samra-special-edition.html',
    'https://www.dzrt.com/ar/purple-mist.html',
    'https://www.dzrt.com/ar/edgy-mint.html',
  ];
  
  // القنوات
  const channels = {
    'https://www.dzrt.com/ar/icy-rush.html': { ar: 'آيسي رش', en: 'icy-rush', chatId: process.env.CHAT_ID_ICY_RUSH },
    'https://www.dzrt.com/ar/seaside-frost.html': { ar: 'سي سايد', en: 'seaside-frost', chatId: process.env.CHAT_ID_SEASIDE },
    'https://www.dzrt.com/ar/highland-berries.html': { ar: 'هايلاند بيريز', en: 'highland-berries', chatId: process.env.CHAT_ID_HIGH },
    'https://www.dzrt.com/ar/garden-mint.html': { ar: 'جاردن منت', en: 'garden-mint', chatId: process.env.CHAT_ID_GARDEN },
    'https://www.dzrt.com/ar/mint-fusion.html': { ar: 'منت فيوجن', en: 'mint-fusion', chatId: process.env.CHAT_ID_MINT },
    'https://www.dzrt.com/ar/haila.html': { ar: 'هيلة', en: 'haila', chatId: process.env.CHAT_ID_HAILA },
    'https://www.dzrt.com/ar/dzrt-samra-special-edition.html': { ar: 'سمرة - أصدار خاص', en: 'samra-ed', chatId: process.env.CHAT_ID_SAMRA },
    'https://www.dzrt.com/ar/purple-mist.html': { ar: 'بيربل مست', en: 'purple-mist', chatId: process.env.CHAT_ID_PURPPLE },
    'https://www.dzrt.com/ar/edgy-mint.html': { ar: 'ايدجي منت', en: 'edgy-mint', chatId: process.env.CHAT_ID_EDGY },
    'https://www.dzrt.com/ar/tamra.html': { ar: 'تمرة', en: 'tamra', chatId: process.env.CHAT_ID_TAMRA },
  };
  
  // تصدير المنتجات، الروابط والقنوات
  module.exports = { productNames, urls, channels };
  