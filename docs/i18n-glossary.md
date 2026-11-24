# Fedo i18n glossary (draft)

Status: **approved by Behzad, Nov 24 2026**. Based on `main` @ f02cb21 (3.0.0).
English mockups: https://claude.ai/artifact/S2KAPCJ1TTBHqLH7ZhFzQZ (page «En - Fedo»).

Every English string must use these terms. Same Persian term = same English term, everywhere.

## Real numbers after 3.0.0

| | Issue said | Now |
|---|---|---|
| Source lines with Persian UI text | ~700 | ~1,120 (app.js 508, fedora.js 365, context.js 62, translate.js 39, imgedit.js 36, emoji.js 36, others < 25) |
| Unique Persian strings | n/a | ~1,280 |
| Physical left/right CSS rules | ~28 | ~66 (chrome.css mostly; rough count, some may be intentional) |

`fedora.js` (AI assistant) did not exist when the issue was written.

## 1. Core objects

| Persian | English | Note |
|---|---|---|
| سند | document | Generic "the thing you're editing" (کل سند = whole document) |
| فایل | file | Only when it's about disk (save, open, show in folder) |
| سند تازه | New document | Not "New file" |
| بدون عنوان | Untitled | |
| تب | tab | |
| گروه | group | Tab groups: افزودن به گروه تازه = Add to new group |
| پنجره‌ی همیشه‌رو | Always-on-top window | |
| تیتر | Heading | تیتر ۱ = Heading 1 |
| پاراگراف | paragraph | |
| بلوک کد | code block | |
| جدول | table | |

## 2. Features

| Persian | English | Note |
|---|---|---|
| حالت امن | Safe mode | Read-only protection, not focus mode |
| تاریخچه‌ی نسخه‌ها | Version history | ثبت نسخه = Save version, نسخه‌ی دستی = Manual version |
| دو سند کنار هم | Side by side | |
| نوار کناری | Sidebar | |
| سرفصل‌ها | Outline | |
| کد منبع | Source code | The raw Markdown view |
| غلط‌یابی املایی | Spell check (English only) | |
| خروجی | Export | ساخت خروجی = Export |
| ذخیره با نام | Save as | |
| ذخیره‌ی خودکار | Autosave | |
| باز کردن سریع | Quick open | |
| فایل‌های اخیر | Recent files | |
| بازکردن تب بسته‌شده | Reopen closed tab | |
| نمایش در پوشه | Show in folder | Windows wording; Mac branch may use "Show in Finder" |
| کپی متن ساده | Copy as plain text | |
| کپی فایل | Copy file | |
| ویرایش تصویر | Edit image | Image editor tools: رسم = Draw, قلم = Pen, برش = Crop, محو = Blur |
| تم | Theme | تم‌های بیشتر = More themes |
| افزونه | Extension | |
| به‌روزرسانی | Update | دانلود و نصب = Download and install |
| بزرگ‌نمایی / کوچک‌نمایی | Zoom in / Zoom out | |
| دنیای موازی | Parallel World | Name of the fun-logo group; proper noun |

## 3. Direction

| Persian | English |
|---|---|
| جهت سند | Document direction |
| راست‌چین اجباری | Force right-to-left |
| خودکار | Auto |
| چپ‌چین اجباری | Force left-to-right |

## 4. AI (Fedora)

| Persian | English | Note |
|---|---|---|
| فدورا | Fedora | Default assistant name; user can rename it. Never hardcode "Fedora" in strings, use `{name}` |
| کاراکتر دستیار | Assistant character | کاراکتر خودم = My own character |
| هوش مصنوعی | AI | Settings section name |
| کارهای آماده | Quick actions | |
| پرامپت | Prompt | A saved, reusable item. پرامپت‌های من = My prompts |
| دستور | Instruction | The text inside a prompt, or a one-off instruction typed in the Fedora box |
| اسکیل | Skill | |
| کلید | API key | دریافت کلید رایگان = Get a free key |
| مدل اصلی | Main model | |
| تمیز کردن متن | Clean up text | |
| تغییر لحن | Change tone | |
| خلاصه | Summary | |
| توضیح | Explain | سطح توضیح = Explanation level |
| سند برای دولوپر | Developer doc | |
| متن انتخاب‌شده / کل سند | Selection / Whole document | Scope switch |
| متن نهایی / تغییرات | Result / Changes | Tabs on the review card |
| «{نام} داره … می‌کنه» | "{name} is …ing" | Casual, e.g. "{name} is rewriting…". Keep this pattern for all in-progress messages |

## 5. Common buttons

| Persian | English |
|---|---|
| انصراف | Cancel |
| بستن | Close |
| ذخیره | Save |
| ذخیره نکن | Don't save |
| بستن بدون ذخیره | Close without saving |
| ذخیره‌ی همه | Save all |
| حذف | Delete |
| دوباره امتحان کن | Try again |
| توقف | Stop |
| برگرداندن | Restore |
| تأیید / رد | Accept / Reject |
| کپی شد | Copied |
| انجام شد | Done |

## 6. Decisions (approved Nov 24 2026)

1. **پرامپت vs دستور**: not a conflict. پرامپت = the saved item (**Prompt**), دستور = its text or a one-off instruction (**Instruction**). Persian unchanged.
2. **آیکن vs لوگو**: Persian unchanged (the fun-logo picker keeps «لوگو», those labels were already approved). English uses **icon** everywhere: App icon, Use this icon, Keep current icon.
3. **تیتر / سرفصل / عنوان**: keep all three, each with one meaning only: Heading / Outline / Title.
4. **زوم vs بزرگ‌نمایی**: Persian unchanged. English: **Zoom** for the control, Zoom in / Zoom out for the buttons.
5. **دستیار vs {name}**: settings labels and tooltips say **Assistant**; messages and in-progress text use `{name}`. Persian already follows this.
6. **سند vs فایل**: safe mode is about the document, not the file on disk. Four Persian strings changed from «فایل» to «سند» (lands in the next build).

## 7. Rules for English strings

- Sentence case for labels and buttons ("Save as", not "Save As").
- Labels must fit on one line at the same width as the Persian label. If it doesn't fit, shorten it; don't let it wrap.
- No em dash in Persian strings. Prefer to avoid it in English too.
- Shortcuts are never inside strings (they're rendered as key chips and differ on Mac).
- Number formatting follows the UI language; search still finds both Persian and English digits.
