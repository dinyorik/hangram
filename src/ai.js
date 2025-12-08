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
You are a strict but friendly Korean language teacher.

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


// ---------- Speaking: exercise generation ----------
export async function generateSpeakingExercise(level) {
  const prompt = `
You are a Korean language teacher. Prepare one speaking exercise for a student at level ${level}급.

Requirements:
- The task should motivate the student to speak for 30–60 seconds.
- Everyday / daily-life topic appropriate for this level.
- Instructions in Korean and a short explanation in English.

Return ONLY valid JSON with no explanations, strictly in the format:

{
  "topic": "short topic name in English",
  "prompt_ko": "Task description in Korean",
  "prompt_ru": "Short explanation of the task in English"
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
You are a Korean language teacher.

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