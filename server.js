// ─────────────────────────────────────────────────────────────────────────────
// server.js — Ranim Daily Tracker Backend
// Stack: Node.js + Express + MongoDB (Mongoose)
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors()); // allows your frontend to talk to this server

// ── Connect to MongoDB ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ── Schema — one document per user per day ────────────────────────────────────
// Example doc:
// {
//   userId: "ranim",
//   date: "20260402",
//   tasks: [{ id: "health_123", pillarId: "health", name: "Drink 2L water" }],
//   checks: { "health_123": true }
// }

const DaySchema = new mongoose.Schema({
  userId:  { type: String, required: true },
  date:    { type: String, required: true }, // "YYYYMMDD"
  tasks:   { type: Array,  default: [] },
  checks:  { type: Object, default: {} },
}, { timestamps: true });

// Unique index — one doc per user per day
DaySchema.index({ userId: 1, date: 1 }, { unique: true });
const Day = mongoose.model('Day', DaySchema);

// ── Middleware — simple userId from header ────────────────────────────────────
// For now we use a hardcoded userId "ranim"
// Later you can add real auth (JWT etc.)
function getUserId(req) {
  return req.headers['x-user-id'] || 'ranim';
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /day/:date — load a day's tasks and checks
app.get('/day/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    const doc = await Day.findOne({ userId, date: req.params.date });
    if (!doc) return res.json({ tasks: [], checks: {} });
    res.json({ tasks: doc.tasks, checks: doc.checks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /day/:date — save full day (tasks + checks)
app.post('/day/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { tasks, checks } = req.body;
    await Day.findOneAndUpdate(
      { userId, date: req.params.date },
      { tasks, checks },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /month/:ym — load all days in a month (for calendar)
// :ym = "202604" (YYYYMM)
app.get('/month/:ym', async (req, res) => {
  try {
    const userId = getUserId(req);
    const ym = req.params.ym; // e.g. "202604"
    // Match all dates starting with this year-month
    const docs = await Day.find({
      userId,
      date: { $regex: '^' + ym }
    });
    // Build summary: { "1": { done, total, pct }, "4": {...} }
    const summary = {};
    docs.forEach(doc => {
      const day = parseInt(doc.date.slice(6), 10);
      const total = doc.tasks.length;
      const done  = doc.tasks.filter(t => doc.checks[t.id]).length;
      const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
      if (total > 0) summary[day] = { done, total, pct };
    });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /day/:date — clear a day
app.delete('/day/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    await Day.findOneAndDelete({ userId, date: req.params.date });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'Ranim Tracker API running ✅' }));

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Server running on port', PORT));
