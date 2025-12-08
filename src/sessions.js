const sessions = {};

function createEmptySession() {
  return {
    level: null,          // 1–6
    practiceType: null,   // "speaking" | "listening" | "reading" | null

    // overall progress
    stats: {
      totalScore: 0       // from 0 to 100
    },

    reading: {
      state: "idle",      // "idle" | "waiting_for_answers"
      exercise: null      // { text, questions }
    },

    listening: {
      state: "idle",      // "idle" | "waiting_for_answers"
      exercise: null      // { text, questions }
    },

    speaking: {
      state: "idle",      // "idle" | "waiting_for_voice"
      exercise: null,     // { topic, prompt_ko, prompt_ru }
      lastTranscript: null
    }
  };
}

export function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = createEmptySession();
  }
  return sessions[userId];
}

export function resetSession(userId) {
  sessions[userId] = createEmptySession();
}