// Guests read these screens; staff are trained on one language. A plain object
// and a lookup cover that without a translation runtime or a build step.
// ponytail: flat keys, no interpolation library. Values that vary are passed as
// arguments and joined by the caller.
export const locales = ["en", "th", "zh"] as const;
export type Locale = typeof locales[number];
export const localeNames: Record<Locale, string> = { en: "EN", th: "ไทย", zh: "中文" };

const en = {
  "guest.table": "Table",
  "guest.needStaff": "This table isn’t taking orders. Please ask a member of staff.",
  "guest.needSeating": "Please ask a member of staff to seat you, then scan again.",
  "guest.welcome": "Welcome!",
  "guest.alreadyOrdered": "Already ordered",
  "guest.billSoFar": "Bill so far",
  "guest.yourOrder": "Your order",
  "guest.backToMenu": "← Back to menu",
  "guest.nothingAdded": "Nothing added yet.",
  "guest.total": "Total",
  "guest.send": "Send to the kitchen",
  "guest.sending": "Sending…",
  "guest.menuNotReady": "The menu isn’t ready yet. Please ask a member of staff.",
  "guest.items": "items",
  "guest.item": "item",
  "guest.thanks": "Thank you! Your order is with the kitchen.",
  "guest.all": "All",
  "queue.yourNumber": "Your queue number",
  "queue.waiting": "Waiting",
  "queue.aheadOfYou": "ahead of you",
  "queue.youAreNext": "You’re next.",
  "queue.called": "Your table is ready!",
  "queue.goToTable": "Please go to table",
  "queue.seated": "You’re seated. Enjoy your meal.",
  "queue.noShow": "This queue ticket is no longer active. Please see a member of staff.",
  "queue.party": "Party of",
  "queue.joinedAt": "Joined",
  "queue.refreshes": "This page updates on its own.",
  "slip.queueTicket": "QUEUE TICKET",
  "slip.scanToTrack": "Scan to follow your queue",
  "slip.keepThis": "Please keep this slip",
  "call.nowCalling": "NOW CALLING",
  "call.table": "TABLE",
  "call.guests": "guests",
  "call.welcome": "Welcome",
  "call.askStaff": "Please see a member of staff to join the queue.",
  "call.alsoReady": "Also ready",
  "call.waiting": "Waiting",
  "call.nobody": "Nobody waiting",
} as const;

export type MessageKey = keyof typeof en;

const th: Partial<Record<MessageKey, string>> = {
  "guest.table": "โต๊ะ",
  "guest.needStaff": "โต๊ะนี้ยังสั่งอาหารไม่ได้ กรุณาติดต่อพนักงาน",
  "guest.needSeating": "กรุณาให้พนักงานจัดที่นั่งก่อน แล้วสแกนอีกครั้ง",
  "guest.welcome": "ยินดีต้อนรับ",
  "guest.alreadyOrdered": "รายการที่สั่งแล้ว",
  "guest.billSoFar": "ยอดรวมขณะนี้",
  "guest.yourOrder": "รายการของคุณ",
  "guest.backToMenu": "← กลับไปที่เมนู",
  "guest.nothingAdded": "ยังไม่ได้เลือกรายการ",
  "guest.total": "รวมทั้งหมด",
  "guest.send": "ส่งไปที่ครัว",
  "guest.sending": "กำลังส่ง…",
  "guest.menuNotReady": "เมนูยังไม่พร้อม กรุณาติดต่อพนักงาน",
  "guest.items": "รายการ",
  "guest.item": "รายการ",
  "guest.thanks": "ขอบคุณค่ะ ออเดอร์ส่งถึงครัวแล้ว",
  "guest.all": "ทั้งหมด",
  "queue.yourNumber": "หมายเลขคิวของคุณ",
  "queue.waiting": "กำลังรอ",
  "queue.aheadOfYou": "คิวก่อนหน้าคุณ",
  "queue.youAreNext": "คุณเป็นคิวถัดไป",
  "queue.called": "โต๊ะของคุณพร้อมแล้ว!",
  "queue.goToTable": "เชิญที่โต๊ะ",
  "queue.seated": "คุณได้รับที่นั่งแล้ว ขอให้อร่อย",
  "queue.noShow": "คิวนี้ไม่มีผลแล้ว กรุณาติดต่อพนักงาน",
  "queue.party": "จำนวน",
  "queue.joinedAt": "เวลาที่รับคิว",
  "queue.refreshes": "หน้านี้อัปเดตอัตโนมัติ",
  "slip.queueTicket": "บัตรคิว",
  "slip.scanToTrack": "สแกนเพื่อดูคิวของคุณ",
  "slip.keepThis": "กรุณาเก็บบัตรนี้ไว้",
  "call.nowCalling": "กำลังเรียกคิว",
  "call.table": "โต๊ะ",
  "call.guests": "ท่าน",
  "call.welcome": "ยินดีต้อนรับ",
  "call.askStaff": "กรุณาติดต่อพนักงานเพื่อรับคิว",
  "call.alsoReady": "คิวที่พร้อมแล้ว",
  "call.waiting": "กำลังรอ",
  "call.nobody": "ไม่มีคิวรออยู่",
};

const zh: Partial<Record<MessageKey, string>> = {
  "guest.table": "桌号",
  "guest.needStaff": "此桌暂不能点餐，请联系服务员。",
  "guest.needSeating": "请先由服务员安排入座，然后重新扫码。",
  "guest.welcome": "欢迎光临",
  "guest.alreadyOrdered": "已点菜品",
  "guest.billSoFar": "当前账单",
  "guest.yourOrder": "您的订单",
  "guest.backToMenu": "← 返回菜单",
  "guest.nothingAdded": "尚未选择菜品",
  "guest.total": "合计",
  "guest.send": "发送至厨房",
  "guest.sending": "发送中…",
  "guest.menuNotReady": "菜单尚未准备好，请联系服务员。",
  "guest.items": "项",
  "guest.item": "项",
  "guest.thanks": "谢谢！您的订单已送至厨房。",
  "guest.all": "全部",
  "queue.yourNumber": "您的排队号",
  "queue.waiting": "等待中",
  "queue.aheadOfYou": "组在您前面",
  "queue.youAreNext": "下一位就是您。",
  "queue.called": "您的餐桌已准备好！",
  "queue.goToTable": "请前往桌号",
  "queue.seated": "您已入座，祝用餐愉快。",
  "queue.noShow": "此排队号已失效，请联系服务员。",
  "queue.party": "人数",
  "queue.joinedAt": "取号时间",
  "queue.refreshes": "本页面会自动更新。",
  "slip.queueTicket": "排队号票",
  "slip.scanToTrack": "扫码查看排队进度",
  "slip.keepThis": "请保留此票",
  "call.nowCalling": "正在叫号",
  "call.table": "桌号",
  "call.guests": "位",
  "call.welcome": "欢迎光临",
  "call.askStaff": "请联系服务员取号。",
  "call.alsoReady": "已叫到",
  "call.waiting": "等待中",
  "call.nobody": "暂无排队",
};

const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { en, th, zh };

// An untranslated key falls back to English rather than rendering the key name.
export function translate(locale: Locale, key: MessageKey): string {
  return dictionaries[locale]?.[key] ?? en[key];
}

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);

// Accepts a query value, a cookie, or an Accept-Language header, in that order.
export function resolveLocale(...candidates: (string | null | undefined)[]): Locale {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isLocale(candidate)) return candidate;
    for (const part of candidate.split(",")) {
      const tag = part.split(";")[0].trim().toLowerCase();
      if (isLocale(tag)) return tag;
      const base = tag.split("-")[0];
      if (isLocale(base)) return base;
      if (base === "cmn" || base === "yue") return "zh";
    }
  }
  return "en";
}
