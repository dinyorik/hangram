import net from "node:net";
net.setDefaultAutoSelectFamily(false);

import express from "express";
import { Telegraf } from "telegraf";
import "dotenv/config";

import {
    levelKeyboard,
    practiceKeyboard,
    mainMenuKeyboard,
    readingResultKeyboard,
    listeningResultKeyboard,
    speakingResultKeyboard,
} from "./keyboards.js";

import { getSession, resetSession } from "./sessions.js";

import {
    generateReadingExercise,
    evaluateReadingAnswers,
    ttsFromKoreanText,
    generateSpeakingExercise,
    evaluateSpeakingResponse,
    transcribeAudioFromUrl,
    generateFreeChatReply
} from "./ai.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Placement bot is running ✅");
});

app.listen(PORT, () => {
    console.log(`HTTP server is listening on port ${PORT}`);
});

const bot = new Telegraf(process.env.BOT_TOKEN);

const CHANGE_LEVEL_TEXT = "Change difficulty";
const CHANGE_MODE_TEXT = "Change mode";
const SHOW_PROGRESS_TEXT = "See progress";

// --- Logging ---
function log(...args) {
    console.log("[LOG]", ...args);
}
function errorLog(...args) {
    console.error("[ERROR]", ...args);
}

// ------Score & ramyun handling --------

function addScoreToStats(session, score) {
    if (!session.stats) {
        session.stats = { totalScore: 0 };
    }
    const value = Number(score);
    if (!Number.isFinite(value)) return;

    const current = session.stats.totalScore || 0;
    const updated = current + value;

    session.stats.totalScore = Math.max(0, updated);
}

function buildProgressBar(score) {
    // progress maximum of 500
    const s = Math.max(0, Math.min(500, score));
    const totalBlocks = 10;
    const filled = Math.round((s / 500) * totalBlocks);
    const empty = totalBlocks - filled;
    return "⬛".repeat(filled) + "⬜".repeat(empty);
}

function getRamyunLevelMeta(score) {
    // Ramyun level is calculated up to 500
    const s = Math.max(0, Math.min(500, score));

    // 5 levels:
    // 0–99   -> Mild
    // 100–199 -> Original
    // 200–299 -> Spicy
    // 300–399 -> Very Spicy
    // 400–500+ -> Nuclear
    if (s < 100) {
        return {
            name: "Ramyun Mild",
            description: "Very mild level 🌱 You're just getting started; the spicy stuff is still ahead!",
            imageUrl: "https://i.ibb.co/LKNMnbC/ramyunmild.png"
        };
    } else if (s < 200) {
        return {
            name: "Ramyun Original",
            description: "Classic flavor 🍜 You feel more comfortable now, but there's still a way to go before the real heat.",
            imageUrl: "https://i.ibb.co/V0TxghVh/neoguriramyun.jpg"
        };
    } else if (s < 300) {
        return {
            name: "Ramyun Spicy",
            description: "Spicy ramyun 🌶 You're confident in Korean and not afraid of challenges.",
            imageUrl: "https://i.ibb.co/bRHrxBPk/jinramyon.jpg"
        };
    } else if (s < 400) {
        return {
            name: "Ramyun Very Spicy",
            description: "Very spicy ramyun 🔥 You're advanced now; your grammar and vocabulary are in good shape.",
            imageUrl: "https://i.ibb.co/QSDtykx/shinramyon.jpg"
        };
    } else {
        // 400–500+ → maximum level
        return {
            name: "Ramyun Nuclear",
            description: "NUCLEAR RAMYUN ☢️ You're almost Korean — you can eat and speak like a local.",
            imageUrl: "https://i.ibb.co/3mpfbWn0/buldakramyon.jpg"
        };
    }
}

// --- /start ---
bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id;
        resetSession(userId);

        const firstName = ctx.from.first_name || "friend";

        await ctx.reply(
            `Hello, ${firstName}! 👋\nThis bot will help you practice Korean 🇰🇷.`,
            mainMenuKeyboard()
        );

        await ctx.reply(
            "First, choose your Korean level or check it:",
            levelKeyboard()
        );

        log("User started bot:", userId);
    } catch (err) {
        errorLog("Error in /start:", err);
    }
});

// --- Level selection ---
const levels = ["1", "2", "3", "4", "5", "6"];

levels.forEach((lvl) => {
    bot.action(`LEVEL_${lvl}`, async (ctx) => {
        try {
            const userId = ctx.from.id;
            const session = getSession(userId);

            session.level = lvl;

            await ctx.answerCbQuery();
            await ctx.reply(`Great! I've saved your level as ${lvl}급.`);

            await ctx.reply("What would you like to practice?", practiceKeyboard());

            log(`User ${userId} set level to ${lvl}급`);
        } catch (err) {
            errorLog("Error on level select:", err);
        }
    });
});

// --- Bottom keyboard ---
bot.hears(CHANGE_LEVEL_TEXT, async (ctx) => {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);

        session.level = null;

        await ctx.reply(
            "Okay, choose your new Korean level:",
            levelKeyboard()
        );

        log(`User ${userId} wants to change level`);
    } catch (err) {
        errorLog("Error in CHANGE_LEVEL_TEXT:", err);
    }
});

bot.hears(CHANGE_MODE_TEXT, async (ctx) => {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);

        if (!session.level) {
            await ctx.reply(
                "First choose your level, then the practice mode 🙂",
                levelKeyboard()
            );
            return;
        }

        await ctx.reply(
            "What would you like to practice?",
            practiceKeyboard()
        );

        log(`User ${userId} wants to change practice type`);
    } catch (err) {
        errorLog("Error in CHANGE_MODE_TEXT:", err);
    }
});

bot.hears(SHOW_PROGRESS_TEXT, async (ctx) => {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);

        const total = session.stats?.totalScore || 0;

        if (total <= 0) {
            await ctx.reply(
                "You don't have any points yet.\n" +
                "Complete tasks in reading / listening / speaking modes and I'll start counting your ramyun points 🍜",
                mainMenuKeyboard()
            );
            return;
        }

        const displayScore = Math.max(0, Math.min(500, total));
        const bar = buildProgressBar(displayScore);
        const level = getRamyunLevelMeta(displayScore);

        const msg =
            `Your progress:\n` +
            `Score ${displayScore}/500\n` +
            `${bar}\n\n` +
            `You are: ${level.name}\n` +
            `${level.description}`;

        // клавиатура отдельно, чтобы можно было засунуть её в replyWithPhoto
        const keyboard = mainMenuKeyboard();

        if (level.imageUrl) {
            // img + caption
            await ctx.replyWithPhoto(level.imageUrl, {
                caption: msg,
                reply_markup: keyboard.reply_markup
            });
        } else {
            // if no image then just text
            await ctx.reply(msg, keyboard);
        }
    } catch (err) {
        errorLog("Error in SHOW_PROGRESS_TEXT:", err);
    }
});

// --- Practice mode selection ---
bot.action("PRACTICE_SPEAKING", async (ctx) => {
    await handlePracticeChoice(ctx, "speaking");
});

bot.action("PRACTICE_LISTENING", async (ctx) => {
    await handlePracticeChoice(ctx, "listening");
});

bot.action("PRACTICE_READING", async (ctx) => {
    await handlePracticeChoice(ctx, "reading");
});

bot.action("PRACTICE_FREE", async (ctx) => {
    await handlePracticeChoice(ctx, "free");
});

async function handlePracticeChoice(ctx, type) {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);

        session.practiceType = type;

        await ctx.answerCbQuery();

        if (type === "reading") {
            await ctx.reply("📖 I'm preparing a reading text for you...");
            await startReadingExercise(ctx, session);
        } else if (type === "speaking") {
            await ctx.reply("🗣 I'll prepare a speaking task for you...");
            await startSpeakingExercise(ctx, session);
        } else if (type === "listening") {
            await ctx.reply("👂 I'll prepare a listening audio for you...");
            await startListeningExercise(ctx, session);
        } else if (type === "free") {
            await ctx.answerCbQuery();
            await ctx.reply(
                "💬 Free mode: I will chat with you as a Korean university student. Let's talk!",
                mainMenuKeyboard()
            );
            await startFreeChat(ctx, session);
            return;
        }

        log(`User ${userId} chose practice type: ${type}`);
    } catch (err) {
        errorLog("Error in handlePracticeChoice:", err);
    }
}

// --- Reading ---
async function startReadingExercise(ctx, session) {
    const level = session.level || "1";

    try {
        const exercise = await generateReadingExercise(level);

        session.reading.state = "waiting_for_answers";
        session.reading.exercise = exercise;

        await ctx.reply(
            `Here is a reading text (level ${level}급):\n\n${exercise.text}`
        );

        const questionsText = exercise.questions
            .map((q, idx) => `${idx + 1}. ${q}`)
            .join("\n");

        await ctx.reply(
            "Questions about the text:\n\n" +
            questionsText +
            "\n\nAnswer all 5 questions in a single message.",
            mainMenuKeyboard()
        );
    } catch (err) {
        errorLog("Error while generating reading exercise:", err);
        await ctx.reply(
            "Failed to generate an exercise 😔 Please try again a bit later.",
            mainMenuKeyboard()
        );
    }
}

async function handleReadingAnswers(ctx, session, userAnswersText) {
    const level = session.level || "1";

    if (!session.reading.exercise) {
        await ctx.reply(
            "It looks like you don't have an active reading task yet. Tap \"Change mode\" → Reading to start.",
            mainMenuKeyboard()
        );
        return;
    }

    const { text, questions } = session.reading.exercise;

    try {
        await ctx.reply("I'll check your answers now...");

        const result = await evaluateReadingAnswers({
            level,
            text,
            questions,
            userAnswers: userAnswersText
        });

        if (typeof result.score === "number") {
            addScoreToStats(session, result.score);
        }

        session.reading.state = "idle";

        let msg = `Your score for this exercise: ${result.score}/10\n\n`;

        if (Array.isArray(result.per_question)) {
            msg += "Question-by-question breakdown:\n";
            for (const q of result.per_question) {
                const emoji = q.correct ? "✅" : "❌";
                msg += `${emoji} Question ${q.number}: ${q.comment}\n`;
            }
            msg += "\n";
        }

        if (result.overall_feedback) {
            msg += `Overall feedback:\n${result.overall_feedback}`;
        }

        await ctx.reply(msg, readingResultKeyboard());
    } catch (err) {
        errorLog("Error while evaluating reading answers:", err);
        await ctx.reply(
            "There was an error while checking your answers 😔 Please try again or generate a new exercise.",
            readingResultKeyboard()
        );
    }
}

// --- Listening ---
async function startListeningExercise(ctx, session) {
    const level = session.level || "1";

    try {
        const exercise = await generateReadingExercise(level);

        session.listening.state = "waiting_for_answers";
        session.listening.exercise = exercise;

        const audioBuffer = await ttsFromKoreanText(exercise.text);

        await ctx.replyWithAudio(
            { source: audioBuffer, filename: "listening.mp3" },
            {
                title: `Listening (level ${level}급)`,
                performer: "Korean Tutor"
            }
        );

        const questionsText = exercise.questions
            .map((q, idx) => `${idx + 1}. ${q}`)
            .join("\n");

        await ctx.reply(
            "Questions about the listening text:\n\n" +
            questionsText +
            "\n\nAnswer all 5 questions in a single message.",
            mainMenuKeyboard()
        );
    } catch (err) {
        errorLog("Error while generating listening exercise:", err);
        await ctx.reply(
            "Couldn't prepare a listening task 😔 Please try again a bit later.",
            mainMenuKeyboard()
        );
    }
}

async function startFreeChat(ctx, session) {
    const level = session.level || "1";

    try {
        // Bot starts messaging first
        const reply = await generateFreeChatReply({
            level,
            userMessage: ""
        });

        const keyboard = mainMenuKeyboard();

        let msg =
            `${reply.korean}\n\n` +
            `<tg-spoiler>${reply.english_translation}</tg-spoiler>`;

        if (Array.isArray(reply.corrections) && reply.corrections.length > 0) {
            msg += `\n\n<b>Corrections:</b>\n`;
            reply.corrections.slice(0, 3).forEach((c, idx) => {
                msg += `${idx + 1}) ${c.original} → ${c.corrected}\n${c.explanation_ru}\n`;
            });
        }

        await ctx.reply(msg, {
            reply_markup: keyboard.reply_markup,
            parse_mode: "HTML"
        });
    } catch (err) {
        errorLog("Error in startFreeChat:", err);
        await ctx.reply(
            "Failed to start a conversation in free mode 😔 Try again.",
            mainMenuKeyboard()
        );
    }
}

async function handleFreeChatMessage(ctx, session, userText, source) {
    const level = session.level || "1";
    const msgFrom = source === "voice" ? "voice" : "text";
    try {
        const reply = await generateFreeChatReply({
            level,
            userMessage: userText
        });

        const keyboard = mainMenuKeyboard();

        let msg =
            `${reply.korean}\n\n` +
            `<tg-spoiler>${reply.english_translation}</tg-spoiler>`;

        if (Array.isArray(reply.corrections) && reply.corrections.length > 0) {
            msg += `\n\n<b>Corrections:</b>\n`;
            reply.corrections.slice(0, 3).forEach((c, idx) => {
                msg += `${idx + 1}) ${c.original} → ${c.corrected}\n${c.explanation_ru}\n`;
            });
        }

        await ctx.reply(msg, {
            reply_markup: keyboard.reply_markup,
            parse_mode: "HTML"
        });

        log(`Free chat reply (${msgFrom}), user ${ctx.from.id}`);
    } catch (err) {
        errorLog("Error in handleFreeChatMessage:", err);
        await ctx.reply(
            "An error occurred in free mode 😔 Try writing again or changing the mode.",
            mainMenuKeyboard()
        );
    }
}

async function handleListeningAnswers(ctx, session, userAnswersText) {
    const level = session.level || "1";

    if (!session.listening.exercise) {
        await ctx.reply(
            "There is no active listening task right now. Tap \"Change mode\" → Listening to start.",
            mainMenuKeyboard()
        );
        return;
    }

    const { text, questions } = session.listening.exercise;

    try {
        await ctx.reply("I'll check your answers for the listening text now...");

        const result = await evaluateReadingAnswers({
            level,
            text,
            questions,
            userAnswers: userAnswersText
        });

        if (typeof result.score === "number") {
            addScoreToStats(session, result.score);
        }

        session.listening.state = "idle";

        let msg = `Your score for this exercise (listening): ${result.score}/10\n\n`;

        if (Array.isArray(result.per_question)) {
            msg += "Question-by-question breakdown:\n";
            for (const q of result.per_question) {
                const emoji = q.correct ? "✅" : "❌";
                msg += `${emoji} Question ${q.number}: ${q.comment}\n`;
            }
            msg += "\n";
        }

        if (result.overall_feedback) {
            msg += `Overall feedback:\n${result.overall_feedback}`;
        }

        await ctx.reply(msg, listeningResultKeyboard());
    } catch (err) {
        errorLog("Error while evaluating listening answers:", err);
        await ctx.reply(
            "There was an error while checking your answers 😔 Please try again or generate a new exercise.",
            listeningResultKeyboard()
        );
    }
}

// --- Speaking ---
async function startSpeakingExercise(ctx, session) {
    const level = session.level || "1";

    try {
        const exercise = await generateSpeakingExercise(level);

        session.speaking.state = "waiting_for_voice";
        session.speaking.exercise = exercise;
        session.speaking.lastTranscript = null;

        let msg =
            `🗣 Speaking task (level ${level}급)\n\n` +
            `TOPIC: ${exercise.topic}\n\n` +
            `Task in Korean:\n${exercise.prompt_ko}\n\n` +
            `In English:\n${exercise.prompt_ru}\n\n` +
            `Please record a voice message in KOREAN (about 30–60 seconds) and send it here.`;

        await ctx.reply(msg, mainMenuKeyboard());
    } catch (err) {
        errorLog("Error while generating speaking exercise:", err);
        await ctx.reply(
            "Couldn't prepare a speaking task 😔 Please try again a bit later.",
            mainMenuKeyboard()
        );
    }
}

// --- Buttons after results ---
bot.action("READING_NEXT", async (ctx) => {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);
        session.practiceType = "reading";

        await ctx.answerCbQuery();
        await ctx.reply("📖 Generating a new reading text...", await startReadingExercise(ctx, session));
    } catch (err) {
        errorLog("Error in READING_NEXT:", err);
    }
});

bot.action("LISTENING_NEXT", async (ctx) => {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);
        session.practiceType = "listening";

        await ctx.answerCbQuery();
        await ctx.reply("👂 Preparing a new listening task...", await startListeningExercise(ctx, session));
    } catch (err) {
        errorLog("Error in LISTENING_NEXT:", err);
    }
});

bot.action("SPEAKING_NEXT", async (ctx) => {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);
        session.practiceType = "speaking";

        await ctx.answerCbQuery();
        await ctx.reply("🗣 Preparing a new speaking task...", await startSpeakingExercise(ctx, session));
    } catch (err) {
        errorLog("Error in SPEAKING_NEXT:", err);
    }
});

bot.action("CHANGE_MODE_INLINE", async (ctx) => {
    try {
        const userId = ctx.from.id;
        const session = getSession(userId);
        session.practiceType = null;

        await ctx.answerCbQuery();
        await ctx.reply("Choose what you want to practice:", practiceKeyboard());
    } catch (err) {
        errorLog("Error in CHANGE_MODE_INLINE:", err);
    }
});

// --- General text handler ---
bot.on("text", async (ctx, next) => {
    const text = ctx.message.text;

    if (
        text === CHANGE_LEVEL_TEXT ||
        text === CHANGE_MODE_TEXT ||
        text === SHOW_PROGRESS_TEXT
    ) {
        return next();
    }

    const userId = ctx.from.id;
    const session = getSession(userId);

    if (session.practiceType === "free") {
        await handleFreeChatMessage(ctx, session, text, "text");
        return;
    }

    if (
        session.practiceType === "reading" &&
        session.reading &&
        session.reading.state === "waiting_for_answers"
    ) {
        await handleReadingAnswers(ctx, session, text);
        return;
    }

    if (
        session.practiceType === "listening" &&
        session.listening &&
        session.listening.state === "waiting_for_answers"
    ) {
        await handleListeningAnswers(ctx, session, text);
        return;
    }

    if (
        session.practiceType === "speaking" &&
        session.speaking &&
        session.speaking.state === "waiting_for_voice"
    ) {
        await ctx.reply(
            "You currently have a speaking task. Please send a voice message in Korean 🙂",
            mainMenuKeyboard()
        );
        return;
    }

    return next();
});

// --- Voice message handling for speaking ---
bot.on("voice", async (ctx, next) => {
    const userId = ctx.from.id;
    const session = getSession(userId);

    // free-mode
    if (session.practiceType === "free") {
        try {
            const voice = ctx.message.voice;
            const fileId = voice.file_id;

            const fileLink = await ctx.telegram.getFileLink(fileId);
            const fileUrl = fileLink.href || fileLink.toString();

            await ctx.reply("Сейчас расшифрую ваше голосовое и отвечу 🙂");

            const transcript = await transcribeAudioFromUrl(fileUrl);

            await handleFreeChatMessage(ctx, session, transcript, "voice");
        } catch (err) {
            errorLog("Error in free-mode voice handler:", err);
            await ctx.reply(
                "Unable to process voice in free mode 😔 Try again or write in text.",
                mainMenuKeyboard()
            );
        }
        return;
    }

    if (
        session.practiceType !== "speaking" ||
        !session.speaking ||
        session.speaking.state !== "waiting_for_voice"
    ) {
        return next();
    }

    try {
        const voice = ctx.message.voice;
        const fileId = voice.file_id;

        const fileLink = await ctx.telegram.getFileLink(fileId);
        const fileUrl = fileLink.href || fileLink.toString();

        await ctx.reply("Got your voice message, I'll transcribe it and evaluate your answer...");

        const transcript = await transcribeAudioFromUrl(fileUrl);

        session.speaking.lastTranscript = transcript;

        const level = session.level || "1";
        const exercise = session.speaking.exercise;

        const result = await evaluateSpeakingResponse({
            level,
            topic: exercise.topic,
            promptKo: exercise.prompt_ko,
            promptRu: exercise.prompt_ru,
            transcript
        });

        if (typeof result.score === "number") {
            addScoreToStats(session, result.score);
        }

        session.speaking.state = "idle";

        let msg =
            "Here is what I could recognize from your answer:\n\n" +
            `${transcript}\n\n` +
            `Speaking score: ${result.score}/10\n\n` +
            `Comment:\n${result.feedback}\n\n`;

        if (result.sample_answer_ko) {
            msg += `Example of a good answer in Korean:\n${result.sample_answer_ko}`;
        }

        await ctx.reply(msg, speakingResultKeyboard());
    } catch (err) {
        errorLog("Error in speaking voice handler:", err);
        await ctx.reply(
            "Couldn't process the voice message 😔 Please try again, maybe with a slightly shorter recording.",
            mainMenuKeyboard()
        );
    }
});

// --- Bot launch ---
bot.launch();
log("Bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));