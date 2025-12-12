import { Markup } from "telegraf";

const PLACEMENT_BOT_LINK = "https://t.me/hangeulplacementbot";

export function levelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("1급", "LEVEL_1"),
      Markup.button.callback("2급", "LEVEL_2")
    ],
    [
      Markup.button.callback("3급", "LEVEL_3"),
      Markup.button.callback("4급", "LEVEL_4")
    ],
    [
      Markup.button.callback("5급", "LEVEL_5"),
      Markup.button.callback("6급", "LEVEL_6")
    ],
    [Markup.button.url("🔎 Check your level", PLACEMENT_BOT_LINK)]
  ]);
}

export function practiceKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🗣 Speaking", "PRACTICE_SPEAKING")],
    [Markup.button.callback("👂 Listening", "PRACTICE_LISTENING")],
    [Markup.button.callback("📖 Reading", "PRACTICE_READING")],
    [Markup.button.callback("💬 Free mode", "PRACTICE_FREE")]
  ]);
}

export function mainMenuKeyboard() {
  return Markup.keyboard([
    ["Change difficulty", "Change mode"],
    ["See progress"]
  ]).resize();
}

export function readingResultKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➡️ More text (reading)", "READING_NEXT")],
    [Markup.button.callback("🔁 Change mode", "CHANGE_MODE_INLINE")]
  ]);
}

export function listeningResultKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Another task (listening)", "LISTENING_NEXT")],
    [Markup.button.callback("🔁 Change mode", "CHANGE_MODE_INLINE")]
  ]);
}

export function speakingResultKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎙 Another task (speaking)", "SPEAKING_NEXT")],
    [Markup.button.callback("🔁 Change mode", "CHANGE_MODE_INLINE")]
  ]);
}