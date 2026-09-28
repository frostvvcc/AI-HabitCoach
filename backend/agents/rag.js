const mongoose = require('mongoose');
const OpenAI = require('openai');
require('dotenv').config();

// 用 Qwen 的 text-embedding 模型生成向量
const client = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIM = 1024;

// 知识片段存储
const embeddingSchema = new mongoose.Schema({
  user: { type: String, index: true },
  content: String,
  source: { type: String, enum: ['conversation', 'goal_summary', 'checkin_pattern'] },
  embedding: { type: [Number], index: false },
  metadata: Object,
  created_at: { type: Date, default: Date.now }
});

embeddingSchema.index({ user: 1, source: 1 });

const Embedding = mongoose.model('Embedding', embeddingSchema);

// 生成 embedding 向量
async function getEmbedding(text) {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIM,
  });
  return response.data[0].embedding;
}

// 余弦相似度
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 索引：将文本存为向量
async function indexDocument(userId, content, source, metadata = {}) {
  const embedding = await getEmbedding(content);
  await Embedding.create({ user: userId, content, source, embedding, metadata });
}

// 检索：找最相关的 top-k 片段
async function retrieve(userId, query, topK = 3) {
  const queryEmbedding = await getEmbedding(query);

  const docs = await Embedding.find({ user: userId }).lean();
  if (docs.length === 0) return [];

  const scored = docs.map(doc => ({
    content: doc.content,
    source: doc.source,
    metadata: doc.metadata,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter(d => d.score > 0.3);
}

// 每轮对话索引（去重：同一 session 的同内容不重复索引）
async function indexConversation(userId, sessionId, messages) {
  if (!messages || messages.length === 0) return;
  const text = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  if (text.length < 10) return;

  const existing = await Embedding.findOne({
    user: String(userId), source: 'conversation', content: text
  });
  if (existing) return;

  await indexDocument(String(userId), text, 'conversation', { session_id: sessionId });
}

// 索引目标的打卡摘要（用于 RAG 检索历史表现）
async function indexGoalSummary(userId, goalName, summary) {
  // 更新已有的同目标摘要，避免堆积过期数据
  await Embedding.deleteMany({
    user: String(userId), source: 'goal_summary', 'metadata.goal_name': goalName
  });
  await indexDocument(String(userId), `目标「${goalName}」: ${summary}`, 'goal_summary', { goal_name: goalName });
}

// 批量索引用户所有目标的打卡摘要
async function indexAllGoalSummaries(userId) {
  const { Goal, Checkin } = require('../db');
  const goals = await Goal.find({ user: userId, is_hidden: false });

  for (const goal of goals) {
    const checkinCount = await Checkin.countDocuments({ goal: goal._id });
    if (checkinCount === 0) continue;

    const recentCheckins = await Checkin.find({ goal: goal._id })
      .sort({ checkin_date: -1 }).limit(7);

    const dates = recentCheckins.map(c => {
      const d = new Date(c.checkin_date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }).join('、');

    const summary = `累计打卡${checkinCount}次，最近打卡日期：${dates}，周期：${goal.repeat_type}`;
    await indexGoalSummary(String(userId), goal.name, summary);
  }
}

// RAG 增强：给 Agent 的 prompt 注入检索到的上下文
function buildRAGContext(retrievedDocs) {
  if (retrievedDocs.length === 0) return '';
  const context = retrievedDocs.map((d, i) =>
    `[相关记录 ${i + 1}] (${d.source}, 相关度:${(d.score * 100).toFixed(0)}%)\n${d.content}`
  ).join('\n\n');
  return `以下是从用户历史中检索到的相关信息，可作为回答参考：\n\n${context}`;
}

module.exports = {
  Embedding,
  getEmbedding,
  indexDocument,
  retrieve,
  indexConversation,
  indexGoalSummary,
  indexAllGoalSummaries,
  buildRAGContext,
};
