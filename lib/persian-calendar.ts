// Persian calendar utilities
export const persianMonths = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
]

export const persianWeekDaysShort = ["ش", "ی", "د", "س", "چ", "پ", "ج"]

// Iranian national holidays (1403)
export const iranianHolidays: Record<string, string> = {
  "1403-01-01": "نوروز",
  "1403-01-02": "نوروز",
  "1403-01-03": "نوروز",
  "1403-01-04": "نوروز",
  "1403-01-12": "روز جمهوری اسلامی",
  "1403-01-13": "سیزده‌به‌در",
  "1403-02-14": "رحلت حضرت امام خمینی",
  "1403-03-15": "قیام ۱۵ خرداد",
  "1403-11-22": "پیروزی انقلاب اسلامی",
  "1403-12-29": "روز ملی شدن صنعت نفت",
}

function div(a: number, b: number): number {
  return Math.floor(a / b)
}

function mod(a: number, b: number): number {
  return a - div(a, b) * b
}
// ... کدهای موجود بدون تغییر ...

// ========================================
// 🆕 Helper Functions برای محاسبات تاریخ شمسی
// ========================================

/**
 * اضافه کردن ماه به تاریخ شمسی با حفظ روز
 * مثال: addJalaliMonths("1403/01/31", 1) → "1403/02/31"
 */
export function addJalaliMonths(jalaliDateStr: string, months: number): string {
  const [year, month, day] = jalaliDateStr.split("/").map(Number)
  
  let newYear = year
  let newMonth = month + months
  
  // Handle year overflow
  while (newMonth > 12) {
    newMonth -= 12
    newYear += 1
  }
  
  while (newMonth < 1) {
    newMonth += 12
    newYear -= 1
  }
  
  // Handle day overflow (مثلاً 31 بهمن نداریم)
  const maxDays = getPersianMonthDays(newYear, newMonth)
  const newDay = Math.min(day, maxDays)
  
  return formatPersianDate(newYear, newMonth, newDay)
}

/**
 * اضافه کردن روز به تاریخ شمسی
 * مثال: addJalaliDays("1403/01/10", 7) → "1403/01/17"
 */
export function addJalaliDays(jalaliDateStr: string, days: number): string {
  const [year, month, day] = jalaliDateStr.split("/").map(Number)
  
  // Convert to Gregorian
  const [gy, gm, gd] = jalaliToGregorian(year, month, day)
  const date = new Date(gy, gm - 1, gd)
  
  // Add days
  date.setDate(date.getDate() + days)
  
  // Convert back to Jalali
  const [newYear, newMonth, newDay] = gregorianToJalali(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  )
  
  return formatPersianDate(newYear, newMonth, newDay)
}

/**
 * اضافه کردن سال به تاریخ شمسی
 * مثال: addJalaliYears("1403/12/30", 1) → "1404/12/29" (اگر سال غیر کبیسه باشه)
 */
export function addJalaliYears(jalaliDateStr: string, years: number): string {
  const [year, month, day] = jalaliDateStr.split("/").map(Number)
  const newYear = year + years
  
  // Handle day overflow (مثلاً 30 اسفند در سال غیر کبیسه نداریم)
  const maxDays = getPersianMonthDays(newYear, month)
  const newDay = Math.min(day, maxDays)
  
  return formatPersianDate(newYear, month, newDay)
}

/**
 * تبدیل تاریخ شمسی به میلادی (string to string)
 * مثال: jalaliStringToGregorianString("1403/01/10") → "2024-03-30"
 */
export function jalaliStringToGregorianString(jalaliDateStr: string): string {
  const [year, month, day] = jalaliDateStr.split("/").map(Number)
  const [gy, gm, gd] = jalaliToGregorian(year, month, day)
  return `${gy}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`
}

/**
 * تبدیل تاریخ میلادی به شمسی (string to string)
 * مثال: gregorianStringToJalaliString("2024-03-30") → "1403/01/10"
 */
export function gregorianStringToJalaliString(gregorianDateStr: string): string {
  const [year, month, day] = gregorianDateStr.split("-").map(Number)
  const [jy, jm, jd] = gregorianToJalali(year, month, day)
  return formatPersianDate(jy, jm, jd)
}


// Convert Gregorian to Persian (Jalali) - الگوریتم دقیق از jalaali-js (کتابخانه استاندارد)
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  let jy: number
  let jm: number
  let jd: number

  if (gy > 1600) {
    jy = 979
    gy -= 1600
  } else {
    jy = 0
    gy -= 621
  }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][gm - 1]

  jy += 33 * div(days, 12053)
  days %= 12053

  jy += 4 * div(days, 1461)
  days %= 1461

  if (days > 365) {
    jy += div(days - 1, 365)
    days = (days - 1) % 365
  }

  jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)

  return [jy, jm, jd]
}

// Convert Persian (Jalali) to Gregorian - الگوریتم دقیق از jalaali-js
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) {
    gy = 1600
    jy -= 979
  } else {
    gy = 621
    jy -= 0
  }
  let days =
    365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)

  gy += 400 * div(days, 146097)
  days %= 146097

  let leapFlag = true
  if (days >= 36525) {
    days--
    gy += 100 * div(days, 36524)
    days %= 36524
    if (days >= 365) days++
    else leapFlag = false
  }

  gy += 4 * div(days, 1461)
  days %= 1461
  if (days >= 366) {
    leapFlag = false
    days--
    gy += div(days, 365)
    days %= 365
  }

  let gd = days + 1
  const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0
  const sal_a = [0, 31, leapFlag && isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm = 0
  for (gm = 0; gm < 13; gm++) {
    if (gd <= sal_a[gm]) break
    gd -= sal_a[gm]
  }
  return [gy, gm, gd]
}

export function getTodayPersian(): [number, number, number] {
  const now = new Date()
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function getPersianMonthDays(year: number, month: number): number {
  if (month <= 6) return 31
  if (month <= 11) return 30
  return isLeapJalaliYear(year) ? 30 : 29
}

export function isLeapJalaliYear(year: number): boolean {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
  ]
  let jp = breaks[0]
  let jump = 0
  for (let i = 1; i < breaks.length; i++) {
    const jm = breaks[i]
    jump = jm - jp
    if (year < jm) break
    jp = jm
  }
  let n = year - jp
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return leap === 0
}

export function formatPersianDate(year: number, month: number, day: number): string {
  return `${year}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`
}



export function toPersianDigits(str: string | number): string {
  if (str === null || str === undefined) return ""
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"]
  return String(str).replace(/\d/g, (digit) => persianDigits[Number.parseInt(digit)])
}

export function toEnglishDigits(str: string): string {
  if (!str) return ""
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"]
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٣", "٨", "٩"]

  return str
    .split("")
    .map((char) => {
      const persianIndex = persianDigits.indexOf(char)
      if (persianIndex !== -1) return persianIndex.toString()
      const arabicIndex = arabicDigits.indexOf(char)
      if (arabicIndex !== -1) return arabicIndex.toString()
      return char
    })
    .join("")
}

export function formatCurrencyPersian(amount: number): string {
  // Format with thousand separators
  const formatted = new Intl.NumberFormat("en-US").format(amount)
  // Convert to Persian digits
  return toPersianDigits(formatted)
}

export function parseCurrencyInput(value: string): number {
  // Remove all non-numeric characters except Persian/Arabic digits
  const english = toEnglishDigits(value)
  const cleaned = english.replace(/[^\d]/g, "")
  return cleaned ? Number.parseInt(cleaned) : 0
}
