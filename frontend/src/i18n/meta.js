export const HE_TEXT = {
  home: ['תמונת מצב', 'באזור.', 'חדשות ממקורות פתוחים, מאומתות ומתורגמות כשיש תרגום זמין.'],
  events: ['אירועים', 'והקשר.', 'תיקי אירועים עם מקורות ורמת אימות.'],
  data: ['נתונים', 'ומקורות.', 'ניתוחים בעלי ערך בלבד; טלמטריה גולמית מוסתרת.'],
  analysts: ['פרשנים', 'וניתוחים.', 'דברי הכותבים אינם מהווים אימות עצמאי לעובדות.'],
};
export const HE_CATEGORY = {
  israel_security_preparation: 'היערכות ביטחונית בישראל',
  maritime_suspicious_activity: 'פעילות ימית חריגה',
  security: 'ביטחון',
  aviation: 'תעופה',
  maritime: 'ים',
  other: 'אחר',
};
export const HE_VALID = x =>
  x &&
  x.content_language === 'he' &&
  ['available', 'ready'].includes(x.translation_status) &&
  /[\u0590-\u05ff]/u.test(x.title || '') &&
  /[\u0590-\u05ff]/u.test(x.excerpt || x.body || x.summary || '');
export const HE_ITEMS = v => (Array.isArray(v?.items) ? v.items.filter(HE_VALID) : []);
