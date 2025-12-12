import OpenAI from "openai";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// tell fluent-ffmpeg where the ffmpeg binary is located
ffmpeg.setFfmpegPath(ffmpegPath);

// ---------- Reading ----------
export async function generateReadingExercise(level) {
  const prompt = `
You are a Korean language teacher. Create a short reading exercise for a student at level ${level}급.

Requirements:
- A text in KOREAN, 3–6 sentences.
- Everyday / daily-life topic appropriate for this level.
- 5 questions IN ENGLISH about the content of the text.

Return ONLY valid JSON with no explanations, exactly in this format:

{
  "text": "short text in Korean",
  "questions": [
    "Question 1 in English",
    "Question 2 in English",
    "Question 3 in English",
    "Question 4 in English",
    "Question 5 in English"
  ]
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const jsonString = response.output_text;

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    console.error("Failed to parse JSON from generateReadingExercise:", jsonString);
    throw err;
  }

  return data;
}

export async function evaluateReadingAnswers({ level, text, questions, userAnswers }) {
  const questionsList = questions
    .map((q, idx) => `${idx + 1}. ${q}`)
    .join("\n");

  const prompt = `
You are a native Korean speaker and a friendly Korean friend who helps the student understand their mistakes.
Your task is to explain clearly and gently where they went wrong, without being harsh and without using overly academic language.
Write in English, using simple, clear phrases.

A student at level ${level}급 has read the text and answered the questions.

TEXT:
"""${text}"""

QUESTIONS:
${questionsList}

STUDENT'S ANSWERS (the format can be free, but in order 1–5):
"""${userAnswers}"""

Do the following:
1. Determine which answers are correct / partially correct / incorrect.
2. Give a score for the WHOLE exercise on a scale from 1 to 10 (integer).
3. For each question, give a short comment in English.
4. Give overall advice for the student in English.

Return ONLY valid JSON with no explanations, strictly in the format:

{
  "score": 8,
  "per_question": [
    { "number": 1, "correct": true, "comment": "Short comment" },
    { "number": 2, "correct": false, "comment": "What is wrong" },
    { "number": 3, "correct": true, "comment": "..." },
    { "number": 4, "correct": false, "comment": "..." },
    { "number": 5, "correct": true, "comment": "..." }
  ],
  "overall_feedback": "Short overall advice"
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const jsonString = response.output_text;

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    console.error("Failed to parse JSON from evaluateReadingAnswers:", jsonString);
    throw err;
  }

  return data;
}

// ---------- TTS for listening ----------
export async function ttsFromKoreanText(text) {
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: text
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

// ---------- STT for speaking ----------
export async function transcribeAudioFromUrl(fileUrl) {
  // 1) Download .oga from Telegram
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to download audio: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  // 2) Create temporary files
  const tmpDir = path.join(process.cwd(), "tmp");
  await fs.promises.mkdir(tmpDir, { recursive: true });

  const ts = Date.now();
  const oggPath = path.join(tmpDir, `input-${ts}.oga`);
  const mp3Path = path.join(tmpDir, `output-${ts}.mp3`);

  await fs.promises.writeFile(oggPath, inputBuffer);

  // 3) Convert .oga → .mp3 via ffmpeg
  await new Promise((resolve, reject) => {
    ffmpeg(oggPath)
      .toFormat("mp3")
      .on("end", resolve)
      .on("error", reject)
      .save(mp3Path);
  });

  // 4) Send mp3 to OpenAI for transcription
  const transcription = await client.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: fs.createReadStream(mp3Path),
    response_format: "json"
  });

  // 5) Delete temporary files
  fs.promises.unlink(oggPath).catch(() => {});
  fs.promises.unlink(mp3Path).catch(() => {});

  const text = transcription && transcription.text ? transcription.text : "";
  return text.trim();
}

export async function generateFreeChatReply({ level, userMessage }) {
  const safeUserMessage = userMessage || "";

  const prompt = `
You are a Korean university student named Hangram. You live in Korea and are chatting in a messenger with a foreigner who is learning Korean.
Their level: ${level}급.

Your task is to be a friendly conversation partner, NOT a strict teacher.

You are given the USER'S LAST MESSAGE (it may be in Korean, Russian, English, or mixed):
"""${safeUserMessage}"""

Do the following:
1. Reply in KOREAN with a natural, friendly tone. Imagine you are a student, not a teacher. Write 1–3 short sentences.
   You MUST ask a question to keep the conversation going.
   Adjust the difficulty of your Korean to the student’s level (${level}급).
2. Provide a translation of your reply in ENGLISH.
3. If the user's message contains noticeable MISTAKES in Korean, point out up to 3 mistakes:
   - the original phrase,
   - the corrected version,
   - a short explanation in English, in simple language.
   If there are no serious mistakes, return an empty corrections list.

If the user's message is empty (first step of the dialogue), start the conversation yourself:
- say hello,
- briefly introduce yourself as a university student in Korea,
- ask a simple question appropriate for the student’s level.

The response format must be strictly valid JSON with no extra text:

{
  "korean": "Your reply in Korean",
  "english_translation": "Your reply translated into English",
  "corrections": [
    {
      "original": "Incorrect Korean phrase from the user's message",
      "corrected": "Correct version in Korean",
      "explanation_ru": "Short explanation in English"
    }
  ]
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const jsonString = response.output_text;

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    console.error("Failed to parse JSON from generateFreeChatReply:", jsonString);
    throw err;
  }

  return data;
}

// ---------- Speaking: exercise generation ----------
export async function generateSpeakingExercise(level) {
  const prompt = `
You are a native Korean speaker and a friendly conversation partner named Hangram, not a strict teacher.
You are helping a student at level ${level}급 practice conversational Korean in a Telegram bot.

Your task is to create ONE speaking task.
Imagine you are chatting with a foreign friend and suggesting a topic for a voice message.

It is very important that the topics feel lively and varied, not like something from a boring textbook.

For levels 1–2급, use simple everyday topics and ALTERNATE between them, for example:
- a short self-introduction;
- family and friends;
- favorite food and drinks;
- hobbies and what you do in your free time;
- school / university / work (using very simple sentences);
- plans for the weekend or the next vacation;
- the place where you live (city, neighborhood, surroundings);
- weather and mood;
- cafés, shops, shopping;
- K-culture: favorite dramas, idols, songs, games.

VERY IMPORTANT:
- Do NOT always choose “daily routine” or “what you do during the day” as the topic.
- A daily routine topic can appear sometimes, but it must not appear too often and must not be the default.
- Write the task the way a Korean friend would, not like a textbook. No “Exercise 1”, etc.

The response format must be strictly valid JSON with no extra text:

{
  "topic": "short topic name in English",
  "prompt_ko": "The task in Korean in 2–3 natural sentences, as if from a Korean friend.",
  "prompt_ru": "A brief explanation of the task in English, 1–2 sentences."
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const jsonString = response.output_text;

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    console.error("Failed to parse JSON from generateSpeakingExercise:", jsonString);
    throw err;
  }

  return data;
}

// ---------- Speaking: response evaluation ----------
export async function evaluateSpeakingResponse({ level, topic, promptKo, promptRu, transcript }) {
  const prompt = `
You are a native Korean speaker and a friendly Korean friend who helps the student practice speaking.
Do not be too formal; explain things in English in a simple, friendly way, while still honestly pointing out mistakes.

A student at level ${level}급 has completed a speaking task.

TOPIC (in English):
${topic}

TASK IN KOREAN:
${promptKo}

TASK EXPLANATION IN ENGLISH:
${promptRu}

Below is the student's speech transcript (in Korean, obtained automatically from a voice message, it may contain small recognition errors):

"""${transcript}"""

Do the following:
1. Score the answer on a scale from 1 to 10 (integer), taking into account vocabulary, grammar, coherence, and relevance to the topic.
2. Give a short comment in English (what is good, what should be improved).
3. Provide an improved sample answer in KOREAN (2–4 sentences) on the same topic, appropriate for the student's level.

Return ONLY valid JSON with no explanations, exactly in the format:

{
  "score": 8,
  "feedback": "Comment in English",
  "sample_answer_ko": "Example of a good answer in Korean"
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const jsonString = response.output_text;

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    console.error("Failed to parse JSON from evaluateSpeakingResponse:", jsonString);
    throw err;
  }

  return data;
}