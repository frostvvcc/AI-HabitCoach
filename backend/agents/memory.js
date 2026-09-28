const mongoose = require('mongoose');
const llm = require('./llm');

const conversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  session_id: { type: String, required: true, index: true },
  title: { type: String, default: '新对话' },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  summary: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

conversationSchema.index({ user: 1, session_id: 1 }, { unique: true });

const Conversation = mongoose.model('Conversation', conversationSchema);

const MAX_MESSAGES = 20;
const COMPRESS_THRESHOLD = 30;

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function createSession(userId) {
  const sessionId = generateSessionId();
  const conv = await Conversation.create({
    user: userId,
    session_id: sessionId,
    title: '新对话',
    messages: []
  });
  return { session_id: conv.session_id, title: conv.title, created_at: conv.created_at };
}

async function listSessions(userId) {
  const sessions = await Conversation.find({ user: userId })
    .sort({ updated_at: -1 })
    .select('session_id title updated_at messages')
    .lean();

  return sessions.map(s => ({
    session_id: s.session_id,
    title: s.title,
    updated_at: s.updated_at,
    message_count: s.messages.length,
    last_message: s.messages.length > 0 ? s.messages[s.messages.length - 1].content.substring(0, 50) : ''
  }));
}

async function deleteSession(userId, sessionId) {
  await Conversation.findOneAndDelete({ user: userId, session_id: sessionId });
}

async function loadMemory(userId, sessionId) {
  if (!sessionId) return { summary: '', messages: [] };
  const conv = await Conversation.findOne({ user: userId, session_id: sessionId });
  if (!conv) return { summary: '', messages: [] };
  return { summary: conv.summary, messages: conv.messages };
}

async function saveMemory(userId, sessionId, userMsg, assistantMsg) {
  if (!sessionId) return;

  let conv = await Conversation.findOne({ user: userId, session_id: sessionId });
  if (!conv) {
    conv = await Conversation.create({
      user: userId, session_id: sessionId, messages: []
    });
  }

  conv.messages.push(
    { role: 'user', content: userMsg },
    { role: 'assistant', content: assistantMsg }
  );

  if (conv.title === '新对话' && conv.messages.length >= 2) {
    conv.title = userMsg.substring(0, 20) + (userMsg.length > 20 ? '...' : '');
  }

  if (conv.messages.length > COMPRESS_THRESHOLD) {
    const oldMessages = conv.messages.slice(0, -MAX_MESSAGES);
    const keepMessages = conv.messages.slice(-MAX_MESSAGES);
    conv.summary = await compressMessages(conv.summary, oldMessages);
    conv.messages = keepMessages;
  }

  conv.updated_at = new Date();
  await conv.save();
}

async function compressMessages(existingSummary, oldMessages) {
  const response = await llm.chat([
    {
      role: 'system',
      content: '将以下对话历史压缩为简短摘要（100字以内），保留：用户关注哪些目标、遇到什么问题、给过什么建议。'
    },
    {
      role: 'user',
      content: `已有摘要：${existingSummary || '无'}\n\n新对话：\n${oldMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`
    }
  ]);
  return response.content;
}

module.exports = {
  Conversation, loadMemory, saveMemory,
  createSession, listSessions, deleteSession, generateSessionId
};
