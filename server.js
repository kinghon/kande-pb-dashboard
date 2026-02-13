const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data', 'data.json');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'kpb-ops-2026';

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Postgres Setup ---
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? false : { rejectUnauthorized: false }
}) : null;

async function initDatabase() {
  if (!pool) {
    console.log('No DATABASE_URL - using file-based storage');
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inbox_emails (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inbox_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    console.log('Database initialized');
    
    // Migrate from file backup if database is empty
    const result = await pool.query('SELECT COUNT(*) FROM inbox_emails');
    if (parseInt(result.rows[0].count) === 0) {
      await migrateFromBackup();
    }
  } catch (e) {
    console.error('Database init error:', e.message);
  }
}

async function migrateFromBackup() {
  const INBOX_BACKUP_PATH = path.join(__dirname, 'data', 'inbox-backup.json');
  try {
    if (fs.existsSync(INBOX_BACKUP_PATH)) {
      const backup = JSON.parse(fs.readFileSync(INBOX_BACKUP_PATH, 'utf8'));
      if (backup.emails && backup.emails.length > 0) {
        for (const email of backup.emails) {
          await pool.query(
            'INSERT INTO inbox_emails (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()',
            [email.id, JSON.stringify(email)]
          );
        }
        console.log(`Migrated ${backup.emails.length} emails from backup to database`);
      }
    }
  } catch (e) {
    console.error('Migration error:', e.message);
  }
}

// --- Inbox Database Functions ---
async function getInboxEmails() {
  if (!pool) return null;
  try {
    const result = await pool.query('SELECT data FROM inbox_emails ORDER BY created_at DESC');
    return result.rows.map(r => r.data);
  } catch (e) {
    console.error('getInboxEmails error:', e.message);
    return null;
  }
}

async function upsertInboxEmail(email) {
  if (!pool) return false;
  try {
    await pool.query(
      'INSERT INTO inbox_emails (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()',
      [email.id, JSON.stringify(email)]
    );
    return true;
  } catch (e) {
    console.error('upsertInboxEmail error:', e.message);
    return false;
  }
}

async function deleteInboxEmail(id) {
  if (!pool) return false;
  try {
    await pool.query('DELETE FROM inbox_emails WHERE id = $1', [id]);
    return true;
  } catch (e) {
    console.error('deleteInboxEmail error:', e.message);
    return false;
  }
}

async function replaceAllInboxEmails(emails) {
  if (!pool) return false;
  try {
    await pool.query('DELETE FROM inbox_emails');
    for (const email of emails) {
      await pool.query(
        'INSERT INTO inbox_emails (id, data) VALUES ($1, $2)',
        [email.id, JSON.stringify(email)]
      );
    }
    return true;
  } catch (e) {
    console.error('replaceAllInboxEmails error:', e.message);
    return false;
  }
}

// Initialize database on startup
initDatabase();

// Auth middleware for write endpoints
function requireToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// --- Data helpers (for non-inbox data) ---
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error('Error reading data:', e.message);
    return null;
  }
}

function writeData(data) {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function calcWeightedScore(scores) {
  return Math.round(
    scores.quality * 0.35 +
    scores.insight * 0.25 +
    scores.efficiency * 0.20 +
    scores.productivity * 0.20
  );
}

// --- API: Leaderboard ---
app.get('/api/leaderboard', (req, res) => {
  const data = readData();
  if (!data) return res.status(500).json({ error: 'Data unavailable' });

  const bots = Object.entries(data.leaderboard.bots).map(([name, bot]) => ({
    name,
    ...bot,
    weightedScore: calcWeightedScore(bot.scores)
  })).sort((a, b) => b.weightedScore - a.weightedScore);

  // Assign ranks
  bots.forEach((bot, i) => { bot.rank = i + 1; });

  // Division MVPs
  const divisionMVPs = {};
  bots.forEach(bot => {
    if (!divisionMVPs[bot.division] || bot.weightedScore > divisionMVPs[bot.division].weightedScore) {
      divisionMVPs[bot.division] = { name: bot.name, score: bot.weightedScore };
    }
  });

  const rivalries = [
    { pair: ['FLASH', 'BELLE'], label: 'Lead Gen vs Wedding Sales' },
    { pair: ['PIXEL', 'NOVA'], label: 'SEO vs Social' },
    { pair: ['SYNC', 'BOLT'], label: 'Coordination vs Fleet' },
    { pair: ['FORGE', 'WIRE'], label: 'Tools vs Automation' }
  ].map(r => {
    const a = bots.find(b => b.name === r.pair[0]);
    const b = bots.find(b2 => b2.name === r.pair[1]);
    return {
      ...r,
      scores: [a?.weightedScore || 0, b?.weightedScore || 0],
      leader: (a?.weightedScore || 0) >= (b?.weightedScore || 0) ? r.pair[0] : r.pair[1]
    };
  });

  res.json({ bots, divisionMVPs, rivalries, lastUpdated: data.leaderboard.lastUpdated });
});

app.post('/api/leaderboard/score', requireToken, (req, res) => {
  const { bot, scores } = req.body;
  if (!bot || !scores) return res.status(400).json({ error: 'Missing bot or scores' });

  const data = readData();
  if (!data || !data.leaderboard.bots[bot]) return res.status(404).json({ error: 'Bot not found' });

  data.leaderboard.bots[bot].scores = { ...data.leaderboard.bots[bot].scores, ...scores };
  data.leaderboard.lastUpdated = new Date().toISOString();
  writeData(data);
  res.json({ success: true, bot, scores: data.leaderboard.bots[bot].scores });
});

// --- API: Departments ---
app.get('/api/departments', (req, res) => {
  const data = readData();
  if (!data) return res.status(500).json({ error: 'Data unavailable' });

  const divisions = Object.entries(data.departments.divisions).map(([name, div]) => {
    const teams = div.teams.map(botName => {
      const bot = data.leaderboard.bots[botName];
      return {
        name: botName,
        ...bot,
        weightedScore: calcWeightedScore(bot.scores)
      };
    });
    const avgScore = Math.round(teams.reduce((s, t) => s + t.weightedScore, 0) / teams.length);
    const totalTasks = teams.reduce((s, t) => s + t.tasksCompleted, 0);
    const activeBots = teams.filter(t => t.status === 'active').length;

    return {
      name,
      emoji: div.emoji,
      motto: div.motto,
      teams,
      metrics: { avgScore, totalTasks, activeBots, totalBots: teams.length }
    };
  });

  res.json({ divisions });
});

app.post('/api/departments/:team/update', requireToken, (req, res) => {
  const { team } = req.params;
  const updates = req.body;
  const data = readData();
  if (!data || !data.leaderboard.bots[team]) return res.status(404).json({ error: 'Team not found' });

  const bot = data.leaderboard.bots[team];
  if (updates.status) bot.status = updates.status;
  if (updates.currentTask) bot.currentTask = updates.currentTask;
  if (updates.tasksCompleted !== undefined) bot.tasksCompleted = updates.tasksCompleted;
  if (updates.scores) bot.scores = { ...bot.scores, ...updates.scores };

  writeData(data);
  res.json({ success: true, team, bot });
});

// --- API: Inbox (Postgres with file fallback) ---
app.get('/api/inbox', async (req, res) => {
  try {
    // Try database first
    if (pool) {
      const emails = await getInboxEmails();
      if (emails !== null) {
        return res.json({
          emails,
          lastSync: new Date().toISOString(),
          syncAvailable: true,
          storage: 'postgres'
        });
      }
    }
    // Fallback to file
    const data = readData();
    if (!data) return res.status(500).json({ error: 'Data unavailable' });
    res.json({
      emails: data.inbox?.emails || [],
      lastSync: data.inbox?.lastSync,
      syncAvailable: false,
      storage: 'file'
    });
  } catch (e) {
    console.error('GET /api/inbox error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inbox/refresh', requireToken, async (req, res) => {
  const { emails, replace } = req.body;
  if (!emails || !Array.isArray(emails)) {
    return res.json({
      success: false,
      message: 'Push emails via POST body: { "emails": [...] }'
    });
  }

  try {
    // Try database first
    if (pool) {
      if (replace === true) {
        await replaceAllInboxEmails(emails);
      } else {
        // Merge mode: upsert each email
        for (const email of emails) {
          await upsertInboxEmail(email);
        }
      }
      const allEmails = await getInboxEmails();
      return res.json({ success: true, count: allEmails.length, mode: replace ? 'replace' : 'merge', storage: 'postgres' });
    }
    
    // Fallback to file
    const data = readData();
    if (replace === true) {
      data.inbox.emails = emails;
    } else {
      const existingById = {};
      (data.inbox.emails || []).forEach(e => { existingById[e.id] = e; });
      emails.forEach(e => { existingById[e.id] = { ...existingById[e.id], ...e }; });
      data.inbox.emails = Object.values(existingById);
    }
    data.inbox.lastSync = new Date().toISOString();
    writeData(data);
    res.json({ success: true, count: data.inbox.emails.length, mode: replace ? 'replace' : 'merge', storage: 'file' });
  } catch (e) {
    console.error('POST /api/inbox/refresh error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inbox/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { reply } = req.body;
  
  try {
    let email;
    
    // Try database first
    if (pool) {
      const result = await pool.query('SELECT data FROM inbox_emails WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found' });
      
      email = result.rows[0].data;
      email.approved = true;
      email.approvedReply = reply;
      email.approvedAt = new Date().toISOString();
      await upsertInboxEmail(email);
    } else {
      // Fallback to file
      const data = readData();
      email = data.inbox.emails.find(e => e.id === id);
      if (!email) return res.status(404).json({ error: 'Email not found' });
      
      email.approved = true;
      email.approvedReply = reply;
      email.approvedAt = new Date().toISOString();
      writeData(data);
    }
    
    // Webhook: Send Telegram message to trigger draft creation
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8561608042:AAEXmF9gRSnfqBTHuInQGn5u989Ar_LHF50';
    const chatId = process.env.TELEGRAM_CHAT_ID || '-5137874547';
    const message = `📧 CREATE_DRAFT_WEBHOOK\nID: ${id}\nTo: ${email.from}\nSubject: ${email.subject}`;
    
    const https = require('https');
    const postData = JSON.stringify({ chat_id: chatId, text: message });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    
    const webhookReq = https.request(options, (webhookRes) => {
      console.log(`Webhook sent, status: ${webhookRes.statusCode}`);
    });
    webhookReq.on('error', (e) => console.error('Webhook failed:', e.message));
    webhookReq.write(postData);
    webhookReq.end();
    
    res.json({ success: true, message: 'Reply approved. Gmail draft will be created shortly.', email });
  } catch (e) {
    console.error('POST /api/inbox/:id/approve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inbox/:id/draft-created', requireToken, async (req, res) => {
  const { id } = req.params;
  const { draftId } = req.body;
  
  try {
    let email;
    
    // Try database first
    if (pool) {
      const result = await pool.query('SELECT data FROM inbox_emails WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found' });
      
      email = result.rows[0].data;
      email.draftCreated = true;
      email.draftId = draftId;
      email.draftCreatedAt = new Date().toISOString();
      await upsertInboxEmail(email);
    } else {
      // Fallback to file
      const data = readData();
      email = data.inbox.emails.find(e => e.id === id);
      if (!email) return res.status(404).json({ error: 'Email not found' });
      
      email.draftCreated = true;
      email.draftId = draftId;
      email.draftCreatedAt = new Date().toISOString();
      writeData(data);
    }
    
    res.json({ success: true, message: 'Draft marked as created.', email });
  } catch (e) {
    console.error('POST /api/inbox/:id/draft-created error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- API: SEO ---
app.get('/api/seo', (req, res) => {
  const data = readData();
  if (!data) return res.status(500).json({ error: 'Data unavailable' });
  res.json(data.seo);
});

app.post('/api/seo/check', (req, res) => {
  const { keywords, competitors } = req.body;
  const data = readData();

  if (keywords) {
    if (keywords.sf) data.seo.keywords.sf = keywords.sf;
    if (keywords.lv) data.seo.keywords.lv = keywords.lv;
  }
  if (competitors) data.seo.competitors = competitors;
  data.seo.lastCheck = new Date().toISOString();

  writeData(data);
  res.json({ success: true, lastCheck: data.seo.lastCheck });
});

// --- API: Activity ---
app.get('/api/activity', (req, res) => {
  const data = readData();
  if (!data) return res.status(500).json({ error: 'Data unavailable' });
  res.json({ activity: data.activity.slice(0, 20) });
});

app.post('/api/activity', requireToken, (req, res) => {
  const { bot, action, type } = req.body;
  if (!bot || !action) return res.status(400).json({ error: 'Missing bot or action' });

  const data = readData();
  data.activity.unshift({ timestamp: new Date().toISOString(), bot, action, type: type || 'general' });
  if (data.activity.length > 100) data.activity = data.activity.slice(0, 100);
  writeData(data);
  res.json({ success: true });
});

// --- API: Stats ---
app.get('/api/stats', (req, res) => {
  const data = readData();
  if (!data) return res.status(500).json({ error: 'Data unavailable' });

  const bots = Object.values(data.leaderboard.bots);
  const totalBots = bots.length;
  const activeDivisions = Object.keys(data.departments.divisions).length;
  const totalTasks = bots.reduce((s, b) => s + b.tasksCompleted, 0);
  const avgScore = Math.round(bots.reduce((s, b) => s + calcWeightedScore(b.scores), 0) / totalBots);

  res.json({ totalBots, activeDivisions, totalTasks, avgScore });
});

// --- SPA routes ---
const pages = ['/', '/leaderboard', '/departments', '/inbox', '/seo', '/trends'];
pages.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// --- Health check ---
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- Google Trends Tracking ---
const googleTrends = require('google-trends-api');

const SEED_TERMS = [
  'photo booth rental', 'photo booth', '360 photo booth',
  'photo booth near me', 'photo booth for wedding',
  'AI photo booth', 'photo booth for party', 'selfie booth'
];

let trendsCache = { terms: [], seeds: [], lastRefreshed: null, refreshing: false };
const TRENDS_DATA_FILE = path.join(__dirname, 'data', 'trends.json');

function loadTrendsFromFile() {
  try {
    if (fs.existsSync(TRENDS_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRENDS_DATA_FILE, 'utf8'));
      if (data && data.terms) {
        trendsCache = { ...data, refreshing: false };
        console.log(`[TRENDS] Loaded ${data.terms.length} terms from cache`);
      }
    }
  } catch (e) { console.error('[TRENDS] Load error:', e.message); }
}

function saveTrendsToFile() {
  try {
    const dir = path.dirname(TRENDS_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { refreshing, ...data } = trendsCache;
    fs.writeFileSync(TRENDS_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('[TRENDS] Save error:', e.message); }
}

function tDelay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchRelatedQueries(seedTerm) {
  try {
    const result = await googleTrends.relatedQueries({ keyword: seedTerm, geo: 'US', hl: 'en-US' });
    const parsed = JSON.parse(result);
    const rising = parsed?.default?.rankedList?.[1]?.rankedKeyword || [];
    return rising.map(item => ({
      term: item.query,
      value: item.value,
      isBreakout: item.value >= 5000 || item.formattedValue === 'Breakout',
      category: seedTerm
    }));
  } catch (e) {
    console.error(`[TRENDS] Related queries error for "${seedTerm}":`, e.message);
    return [];
  }
}

async function fetchInterestOverTime(term, days) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    const result = await googleTrends.interestOverTime({ keyword: term, startTime: startDate, endTime: endDate, geo: 'US' });
    const parsed = JSON.parse(result);
    const timeline = parsed?.default?.timelineData || [];
    if (timeline.length < 2) return null;
    const values = timeline.map(t => t.value[0]);
    const midpoint = Math.floor(values.length / 2);
    const avgFirst = values.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
    const avgSecond = values.slice(midpoint).reduce((a, b) => a + b, 0) / (values.length - midpoint);
    if (avgFirst === 0) return avgSecond > 0 ? 5000 : 0;
    return Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
  } catch (e) { return null; }
}

async function refreshTrendsData() {
  if (trendsCache.refreshing) return;
  trendsCache.refreshing = true;
  console.log('[TRENDS] Starting refresh...');
  const allTerms = [];
  const seedInfo = [];
  try {
    for (const seed of SEED_TERMS) {
      console.log(`[TRENDS] Fetching "${seed}"...`);
      const related = await fetchRelatedQueries(seed);
      for (const r of related) {
        if (!allTerms.find(t => t.term.toLowerCase() === r.term.toLowerCase())) allTerms.push(r);
      }
      let currentInterest = 0;
      try {
        const iot = await googleTrends.interestOverTime({ keyword: seed, startTime: new Date(Date.now() - 30*24*60*60*1000), endTime: new Date(), geo: 'US' });
        const parsed = JSON.parse(iot);
        const tl = parsed?.default?.timelineData || [];
        if (tl.length > 0) currentInterest = tl[tl.length - 1].value[0];
      } catch (e) {}
      seedInfo.push({ term: seed, relatedCount: related.length, currentInterest, status: related.length > 0 ? 'fetched' : 'no data' });
      await tDelay(2000);
    }
    const topTerms = allTerms.sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 50);
    let fetchCount = 0;
    for (const term of topTerms) {
      if (term.isBreakout) { term.change30 = 5000; term.change60 = 5000; term.change90 = 5000; continue; }
      if (fetchCount < 20) {
        term.change30 = await fetchInterestOverTime(term.term, 30); await tDelay(1500);
        term.change60 = await fetchInterestOverTime(term.term, 60); await tDelay(1500);
        term.change90 = await fetchInterestOverTime(term.term, 90); await tDelay(1500);
        fetchCount++;
      } else {
        term.change30 = term.value || null; term.change60 = term.value || null; term.change90 = term.value || null;
      }
    }
    for (const term of allTerms.slice(50)) { term.change30 = term.value || null; term.change60 = term.value || null; term.change90 = term.value || null; }
    trendsCache.terms = allTerms; trendsCache.seeds = seedInfo;
    trendsCache.lastRefreshed = new Date().toISOString(); trendsCache.refreshing = false;
    saveTrendsToFile();
    console.log(`[TRENDS] Done. ${allTerms.length} terms cached.`);
  } catch (e) { console.error('[TRENDS] Refresh error:', e.message); trendsCache.refreshing = false; }
}

loadTrendsFromFile();
setTimeout(() => {
  if (!trendsCache.lastRefreshed || Date.now() - new Date(trendsCache.lastRefreshed).getTime() > 6*60*60*1000) refreshTrendsData();
}, 15000);
setInterval(() => { refreshTrendsData(); }, 6 * 60 * 60 * 1000);

app.get('/api/trends', (req, res) => {
  res.json({ terms: trendsCache.terms || [], seeds: trendsCache.seeds || [], lastRefreshed: trendsCache.lastRefreshed, refreshing: trendsCache.refreshing });
});

app.post('/api/trends/refresh', requireToken, (req, res) => {
  if (trendsCache.refreshing) return res.status(409).json({ error: 'Refresh already in progress' });
  refreshTrendsData();
  res.json({ success: true, message: 'Refresh started.' });
});

app.listen(PORT, () => {
  console.log(`🎯 Kande PB Dashboard running on port ${PORT}`);
});
