// Shared Memory System
// Connects web chat to same context as Telegram

const MEMORY_API = '/api/memory';
const CHAT_API = '/api/chat';

// Memory structure matching Clawdbot's brain system
export const MemorySchema = {
  userId: '',
  
  // Immediate - current session
  session: {
    startedAt: null,
    channel: 'web', // 'web' | 'telegram'
    messages: []
  },
  
  // Near-term - recent context (updates every few messages)
  context: {
    currentFocus: '',
    recentTopics: [],
    activeTasks: [],
    lastInteraction: null,
    pendingFollowups: []
  },
  
  // Long-term - persistent knowledge (daily summaries)
  memory: {
    summary: '',
    preferences: {},
    keyDecisions: [],
    patterns: {},
    workspaces: {}
  }
};

// Fetch user memory from backend
export async function getUserMemory(userId) {
  try {
    const res = await fetch(`${MEMORY_API}/${userId}`);
    return res.ok ? await res.json() : null;
  } catch (e) {
    console.log('Memory fetch failed, using local');
    return getLocalMemory(userId);
  }
}

// Update memory (called after significant interactions)
export async function updateMemory(userId, updates) {
  try {
    await fetch(`${MEMORY_API}/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  } catch (e) {
    saveLocalMemory(userId, updates);
  }
}

// Send chat message through unified backend
export async function sendMessage(userId, message) {
  try {
    const res = await fetch(CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message, channel: 'web' })
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    console.log('Chat API unavailable');
    return null;
  }
}

// Local fallback storage
function getLocalMemory(userId) {
  const data = localStorage.getItem(`memory_${userId}`);
  return data ? JSON.parse(data) : null;
}

function saveLocalMemory(userId, data) {
  const existing = getLocalMemory(userId) || {};
  localStorage.setItem(`memory_${userId}`, JSON.stringify({ ...existing, ...data }));
}

// Extract context summary for AI prompts
export function buildContextPrompt(memory) {
  if (!memory) return '';
  
  const parts = [];
  
  if (memory.memory?.summary) {
    parts.push(`Background: ${memory.memory.summary}`);
  }
  
  if (memory.context?.currentFocus) {
    parts.push(`Currently working on: ${memory.context.currentFocus}`);
  }
  
  if (memory.context?.recentTopics?.length) {
    parts.push(`Recent topics: ${memory.context.recentTopics.slice(0, 5).join(', ')}`);
  }
  
  if (memory.context?.activeTasks?.length) {
    parts.push(`Active tasks: ${memory.context.activeTasks.slice(0, 3).map(t => t.title).join(', ')}`);
  }
  
  return parts.join('\n');
}
