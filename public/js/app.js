// === KANDE PB DASHBOARD — Frontend ===

let currentPage = 'home';
let seoMarket = 'sf';
let seoChart = null;
let cachedData = {};

// --- Navigation ---
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  document.getElementById('navLinks').classList.remove('open');

  const urlMap = { home: '/', leaderboard: '/leaderboard', departments: '/departments', inbox: '/inbox', seo: '/seo', trends: '/trends' };
  history.pushState({ page }, '', urlMap[page]);
  loadPage(page);
  window.scrollTo(0, 0);
}

function toggleNav() {
  document.getElementById('navLinks').classList.toggle('open');
}

window.addEventListener('popstate', (e) => {
  if (e.state?.page) navigate(e.state.page);
});

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  const pageMap = { '/': 'home', '/leaderboard': 'leaderboard', '/departments': 'departments', '/inbox': 'inbox', '/seo': 'seo', '/trends': 'trends' };
  const page = pageMap[path] || 'home';
  navigate(page);
});

async function loadPage(page) {
  switch (page) {
    case 'home': await loadHome(); break;
    case 'leaderboard': await loadLeaderboard(); break;
    case 'departments': await loadDepartments(); break;
    case 'inbox': await loadInbox(); break;
    case 'seo': await loadSEO(); break;
    case 'trends': await loadTrends(); break;
  }
}

// --- API helpers ---
async function api(endpoint) {
  try {
    const res = await fetch(endpoint);
    return await res.json();
  } catch (e) {
    console.error('API error:', e);
    return null;
  }
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// === HOME ===
async function loadHome() {
  const [stats, activity] = await Promise.all([api('/api/stats'), api('/api/activity')]);

  if (stats) {
    document.getElementById('homeStats').innerHTML = `
      <div class="stat-card">
        <div class="icon">🤖</div>
        <div class="value">${stats.totalBots}</div>
        <div class="label">Total Bots</div>
      </div>
      <div class="stat-card">
        <div class="icon">🏛️</div>
        <div class="value">${stats.activeDivisions}</div>
        <div class="label">Active Divisions</div>
      </div>
      <div class="stat-card">
        <div class="icon">✅</div>
        <div class="value">${stats.totalTasks.toLocaleString()}</div>
        <div class="label">Tasks Completed</div>
      </div>
      <div class="stat-card">
        <div class="icon">⭐</div>
        <div class="value">${stats.avgScore}</div>
        <div class="label">Avg Score</div>
      </div>
    `;
  }

  if (activity?.activity) {
    const feed = document.getElementById('activityFeed');
    feed.innerHTML = `
      <div class="feed-header">⚡ Live Activity Feed</div>
      ${activity.activity.map(a => `
        <div class="activity-item">
          <span class="bot-badge">${a.bot}</span>
          <span class="activity-text">${a.action}</span>
          <span class="type-badge type-${a.type}">${a.type}</span>
          <span class="activity-time">${timeAgo(a.timestamp)}</span>
        </div>
      `).join('')}
    `;
  }
}

// === LEADERBOARD ===
async function loadLeaderboard() {
  const data = await api('/api/leaderboard');
  if (!data) return;

  // MVPs
  const mvpsGrid = document.getElementById('mvpsGrid');
  mvpsGrid.innerHTML = Object.entries(data.divisionMVPs).map(([div, mvp]) => `
    <div class="mvp-card">
      <div class="mvp-crown">👑</div>
      <div class="mvp-name">${mvp.name}</div>
      <div class="mvp-score">Score: ${mvp.score}</div>
      <div class="mvp-div">${div}</div>
    </div>
  `).join('');

  // Table
  const tbody = document.querySelector('#leaderboardTable tbody');
  tbody.innerHTML = data.bots.map(bot => `
    <tr>
      <td class="rank-num rank-${bot.rank <= 3 ? bot.rank : ''}">${bot.rank <= 3 ? ['🥇','🥈','🥉'][bot.rank-1] : bot.rank}</td>
      <td><strong>${bot.name}</strong></td>
      <td>${bot.division}</td>
      <td>${bot.team}</td>
      <td>${bot.scores.quality}<div class="score-bar"><div class="score-bar-fill" style="width:${bot.scores.quality}%"></div></div></td>
      <td>${bot.scores.insight}<div class="score-bar"><div class="score-bar-fill" style="width:${bot.scores.insight}%"></div></div></td>
      <td>${bot.scores.efficiency}<div class="score-bar"><div class="score-bar-fill" style="width:${bot.scores.efficiency}%"></div></div></td>
      <td>${bot.scores.productivity}<div class="score-bar"><div class="score-bar-fill" style="width:${bot.scores.productivity}%"></div></div></td>
      <td><strong>${bot.weightedScore}</strong></td>
      <td><span class="tier-badge tier-${bot.tier}">${getTierIcon(bot.tier)} ${bot.tier}</span></td>
    </tr>
  `).join('');

  // Rivalries
  const rivalriesGrid = document.getElementById('rivalriesGrid');
  rivalriesGrid.innerHTML = data.rivalries.map(r => `
    <div class="rivalry-card">
      <div class="rivalry-title">⚔️ ${r.label}</div>
      <div class="rivalry-vs">
        <div class="rivalry-bot ${r.leader === r.pair[0] ? 'winner' : 'loser'}">
          <div class="bot-name">${r.pair[0]}</div>
          <div class="bot-score">${r.scores[0]}</div>
        </div>
        <div class="vs-divider">VS</div>
        <div class="rivalry-bot ${r.leader === r.pair[1] ? 'winner' : 'loser'}">
          <div class="bot-name">${r.pair[1]}</div>
          <div class="bot-score">${r.scores[1]}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function getTierIcon(tier) {
  return { Diamond: '💎', Gold: '🥇', Silver: '🥈', Bronze: '🥉' }[tier] || '🏅';
}

// === DEPARTMENTS ===
async function loadDepartments() {
  const data = await api('/api/departments');
  if (!data) return;

  const grid = document.getElementById('divisionsGrid');
  grid.innerHTML = data.divisions.map((div, i) => `
    <div class="division-card" id="div-${i}">
      <div class="division-header" onclick="toggleDivision(${i})">
        <div class="division-info">
          <span class="division-emoji">${div.emoji}</span>
          <div>
            <div class="division-name">${div.name}</div>
            <div class="division-motto">"${div.motto}"</div>
          </div>
        </div>
        <div class="division-metrics">
          <div class="div-metric">
            <div class="dm-value">${div.metrics.avgScore}</div>
            <div class="dm-label">Avg Score</div>
          </div>
          <div class="div-metric">
            <div class="dm-value">${div.metrics.totalTasks}</div>
            <div class="dm-label">Tasks</div>
          </div>
          <div class="div-metric">
            <div class="dm-value">${div.metrics.activeBots}/${div.metrics.totalBots}</div>
            <div class="dm-label">Active</div>
          </div>
        </div>
        <span class="division-toggle">▼</span>
      </div>
      <div class="division-teams">
        ${div.teams.map(t => `
          <div class="team-row">
            <span class="bot-badge">${t.name}</span>
            <div>
              <div class="team-name">${t.team}</div>
              <div class="team-spec">${t.specialty}</div>
            </div>
            <div class="team-task">${t.currentTask}</div>
            <div class="team-status-col">
              <span class="team-status status-${t.status}">${t.status}</span>
            </div>
            <div><strong>${t.weightedScore}</strong></div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function toggleDivision(i) {
  document.getElementById(`div-${i}`).classList.toggle('expanded');
}

// === INBOX ===
async function loadInbox() {
  const data = await api('/api/inbox');
  if (!data) return;

  const content = document.getElementById('inboxContent');

  if (!data.syncAvailable || data.emails.length === 0) {
    content.innerHTML = `
      <div class="inbox-sync-notice">
        <h3>📡 Email Sync Status</h3>
        <p>${data.message || 'Email sync requires the local agent running on the host machine.'}</p>
        <p style="margin-top:12px;">Push emails via API: <code>POST /api/inbox/refresh</code></p>
        <p style="margin-top:8px;">Body: <code>{ "emails": [{ "id": "...", "from": "...", "subject": "...", "snippet": "...", "date": "...", "draft": "..." }] }</code></p>
      </div>
      ${data.emails.length > 0 ? renderEmails(data.emails) : `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>No emails yet</h3>
          <p>Emails will appear here when synced from the local agent.</p>
        </div>
      `}
    `;
  } else {
    content.innerHTML = renderEmails(data.emails);
  }
  
  // Auto-resize all draft textareas to show full content
  setTimeout(() => {
    document.querySelectorAll('.email-draft textarea').forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  }, 50);
}

function renderEmails(emails) {
  // Filter out emails with no draft (unless already approved)
  emails = emails.filter(e => e.approved || (e.draft && e.draft !== 'No draft generated yet.'));
  
  // Group by category
  const newLeads = emails.filter(e => e.category === 'new_lead' || !e.category);
  const responses = emails.filter(e => e.category === 'response');
  
  const renderCard = (e) => `
    <div class="email-card ${e.urgent ? 'urgent' : ''}" id="email-${e.id}">
      <div class="email-header">
        <div>
          <div class="email-from">${e.urgent ? '🚨 ' : ''}From: ${e.from}</div>
          <div class="email-subject">${e.subject}</div>
          ${e.eventDate ? `<div class="email-event-date">📅 Event: ${e.eventDate}</div>` : ''}
        </div>
        <div class="email-date">${e.date ? timeAgo(e.date) : ''}</div>
      </div>
      ${e.context ? `
        <div class="email-context">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;font-weight:600;">📋 Context:</div>
          <pre style="white-space:pre-wrap;font-size:13px;margin:0;font-family:inherit;color:var(--text-primary);background:var(--bg-secondary);padding:10px;border-radius:6px;">${e.context}</pre>
        </div>
      ` : ''}
      ${e.approved ? `
        <div style="padding:12px;background:rgba(74,222,128,0.1);border-radius:8px;color:var(--success);font-weight:600;">
          ✅ Reply approved ${e.approvedAt ? timeAgo(e.approvedAt) : ''}
        </div>
      ` : `
        <div class="email-draft">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">🤖 AI Draft Reply:</div>
          <textarea id="draft-${e.id}">${e.draft || 'No draft generated yet.'}</textarea>
          <div class="email-actions">
            <button class="btn btn-approve" onclick="approveEmail('${e.id}')">✅ Approve & Queue</button>
            <button class="btn btn-edit" onclick="document.getElementById('draft-${e.id}').focus()">✏️ Edit</button>
            <button class="btn btn-skip" onclick="document.getElementById('email-${e.id}').style.opacity='0.4'">⏭️ Skip</button>
          </div>
        </div>
      `}
    </div>
  `;
  
  let html = '<div class="email-list">';
  
  if (newLeads.length > 0) {
    html += `<h3 style="margin:0 0 16px 0;color:var(--primary);">📬 New Leads (${newLeads.length})</h3>`;
    html += newLeads.map(renderCard).join('');
  }
  
  if (responses.length > 0) {
    html += `<h3 style="margin:24px 0 16px 0;color:var(--secondary);">💬 Responses Needed (${responses.length})</h3>`;
    html += responses.map(renderCard).join('');
  }
  
  html += '</div>';
  return html;
}

async function approveEmail(id) {
  const draft = document.getElementById(`draft-${id}`)?.value;
  try {
    const res = await fetch(`/api/inbox/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: draft })
    });
    if (res.ok) {
      loadInbox();
    }
  } catch (e) {
    console.error('Approve error:', e);
  }
}

// === SEO ===
async function loadSEO() {
  const data = await api('/api/seo');
  if (!data) return;
  cachedData.seo = data;
  renderSEO(data);
}

function switchSeoMarket(market) {
  seoMarket = market;
  document.querySelectorAll('.seo-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.seo-tab')[market === 'sf' ? 0 : 1].classList.add('active');
  if (cachedData.seo) renderSEO(cachedData.seo);
}

function renderSEO(data) {
  const keywords = data.keywords[seoMarket] || [];
  const marketLabel = seoMarket === 'sf' ? 'San Francisco' : 'Las Vegas';

  // Keywords table
  const tbody = document.querySelector('#keywordsTable tbody');
  tbody.innerHTML = keywords.map(k => {
    const changeClass = k.change > 0 ? 'up' : k.change < 0 ? 'down' : 'flat';
    const changeIcon = k.change > 0 ? '▲' : k.change < 0 ? '▼' : '—';
    return `
      <tr>
        <td>${k.keyword}</td>
        <td><strong>#${k.position}</strong></td>
        <td class="pos-change ${changeClass}">${changeIcon} ${Math.abs(k.change)}</td>
        <td>${k.volume.toLocaleString()}/mo</td>
        <td>
          <span style="font-size:12px;color:var(--text-secondary);">
            ${k.history.map((p, i) => `#${p}`).join(' → ')}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // Competitors
  document.getElementById('competitorsGrid').innerHTML = data.competitors.map(c => `
    <div class="competitor-card">
      <div class="comp-name">${c.name}</div>
      <div class="comp-stat">Avg Position: <span>#${c.avgPosition}</span></div>
      <div class="comp-stat">Keyword Overlap: <span>${c.overlap} keywords</span></div>
    </div>
  `).join('');

  // Chart
  renderSeoChart(keywords, marketLabel);
}

function renderSeoChart(keywords, marketLabel) {
  const ctx = document.getElementById('seoTrendChart');
  if (seoChart) seoChart.destroy();

  const colors = ['#667eea', '#764ba2', '#4ade80', '#fbbf24', '#f87171'];
  const labels = ['4 weeks ago', '3 weeks ago', '2 weeks ago', 'Last week', 'Current'];

  seoChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: keywords.slice(0, 5).map((k, i) => ({
        label: k.keyword,
        data: k.history,
        borderColor: colors[i],
        backgroundColor: colors[i] + '20',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: colors[i],
        fill: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#9898b0', font: { size: 12 } }
        },
        title: {
          display: true,
          text: `${marketLabel} — Keyword Position Trends (lower is better)`,
          color: '#e8e8f0',
          font: { size: 14 }
        }
      },
      scales: {
        y: {
          reverse: true,
          min: 1,
          ticks: { color: '#9898b0', stepSize: 2 },
          grid: { color: 'rgba(102,126,234,0.08)' },
          title: { display: true, text: 'Position', color: '#9898b0' }
        },
        x: {
          ticks: { color: '#9898b0' },
          grid: { color: 'rgba(102,126,234,0.08)' }
        }
      }
    }
  });
}

// === TRENDS ===
let trendsData = null;
let trendsPeriod = 'best';
let trendsCategory = '';
let trendsSearch = '';
let trendsSortCol = 'change';
let trendsSortDir = 'desc';

async function loadTrends() {
  try {
    const data = await api('/api/trends');
    if (!data) return;
    trendsData = data;
    renderTrendsAll();
  } catch (err) {
    document.getElementById('trendsContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load trends</h3>
        <p>${err.message || 'Try again later.'}</p>
      </div>`;
  }
}

function renderTrendsAll() {
  if (!trendsData) return;

  if (trendsData.lastRefreshed) {
    const d = new Date(trendsData.lastRefreshed);
    document.getElementById('trendsLastUpdated').textContent = `Updated: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  }

  const cats = [...new Set((trendsData.terms || []).map(t => t.category))].sort();
  const catSelect = document.getElementById('trendsCategoryFilter');
  catSelect.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');

  renderTrendsStats();
  renderTrendsTable();
  renderTrendsSeedCards();
}

function renderTrendsStats() {
  const terms = trendsData.terms || [];
  const breakouts = terms.filter(t => t.isBreakout).length;
  const rising = terms.filter(t => {
    const c = getTrendsBestChange(t);
    return c > 0 && !t.isBreakout;
  }).length;

  document.getElementById('trendsStats').innerHTML = `
    <div class="stat-card">
      <div class="icon">🔎</div>
      <div class="value">${terms.length}</div>
      <div class="label">Trending Terms</div>
    </div>
    <div class="stat-card">
      <div class="icon">🔥</div>
      <div class="value">${breakouts}</div>
      <div class="label">Breakout Terms</div>
    </div>
    <div class="stat-card">
      <div class="icon">📈</div>
      <div class="value">${rising}</div>
      <div class="label">Rising Terms</div>
    </div>
    <div class="stat-card">
      <div class="icon">🌱</div>
      <div class="value">${(trendsData.seeds || []).length}</div>
      <div class="label">Seed Keywords</div>
    </div>
  `;
}

function getTrendsBestChange(term) {
  const changes = [term.change30, term.change60, term.change90].filter(c => c !== null && c !== undefined);
  return changes.length === 0 ? null : Math.max(...changes);
}

function getTrendsChangeForPeriod(term, period) {
  if (period === 'best') return getTrendsBestChange(term);
  if (period === '30') return term.change30;
  if (period === '60') return term.change60;
  if (period === '90') return term.change90;
  return getTrendsBestChange(term);
}

function renderTrendsTable() {
  let terms = [...(trendsData.terms || [])];

  if (trendsCategory) terms = terms.filter(t => t.category === trendsCategory);
  if (trendsSearch) {
    const q = trendsSearch.toLowerCase();
    terms = terms.filter(t => t.term.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }

  terms.sort((a, b) => {
    let valA, valB;
    if (trendsSortCol === 'term') {
      valA = a.term.toLowerCase(); valB = b.term.toLowerCase();
      return trendsSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else if (trendsSortCol === 'category') {
      valA = a.category.toLowerCase(); valB = b.category.toLowerCase();
      return trendsSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else if (trendsSortCol === 'change') {
      valA = getTrendsChangeForPeriod(a, trendsPeriod) ?? -Infinity;
      valB = getTrendsChangeForPeriod(b, trendsPeriod) ?? -Infinity;
      if (a.isBreakout && !b.isBreakout) return -1;
      if (!a.isBreakout && b.isBreakout) return 1;
      return trendsSortDir === 'desc' ? valB - valA : valA - valB;
    } else {
      const key = 'change' + trendsSortCol;
      valA = a[key] ?? -Infinity; valB = b[key] ?? -Infinity;
      return trendsSortDir === 'desc' ? valB - valA : valA - valB;
    }
    return 0;
  });

  if (terms.length === 0) {
    document.getElementById('trendsContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📈</div>
        <h3>No trending terms found</h3>
        <p>Data may still be loading. Try refreshing in a few minutes.</p>
      </div>`;
    return;
  }

  const showAll = trendsPeriod === 'best';
  const thSorted = (col) => trendsSortCol === col ? 'sorted' : '';
  const thArrow = (col) => trendsSortCol === col ? (trendsSortDir === 'asc' ? '▲' : '▼') : '▽';

  let html = `<div style="overflow-x:auto;"><table class="trends-table">
    <thead><tr>
      <th onclick="toggleTrendsSort('term')" class="${thSorted('term')}"># Term <span class="sort-arrow">${thArrow('term')}</span></th>
      <th onclick="toggleTrendsSort('category')" class="${thSorted('category')}">Category <span class="sort-arrow">${thArrow('category')}</span></th>`;

  if (showAll) {
    html += `<th onclick="toggleTrendsSort('30')" class="${thSorted('30')}">30d <span class="sort-arrow">${thArrow('30')}</span></th>
             <th onclick="toggleTrendsSort('60')" class="${thSorted('60')}">60d <span class="sort-arrow">${thArrow('60')}</span></th>
             <th onclick="toggleTrendsSort('90')" class="${thSorted('90')}">90d <span class="sort-arrow">${thArrow('90')}</span></th>`;
  } else {
    html += `<th onclick="toggleTrendsSort('change')" class="${thSorted('change')}">${trendsPeriod}d Change <span class="sort-arrow">${thArrow('change')}</span></th>`;
  }

  html += `<th>Link</th></tr></thead><tbody>`;

  terms.forEach((t, i) => {
    const rowClass = t.isBreakout ? 'trends-breakout-row' : '';
    html += `<tr class="${rowClass}">
      <td><span class="trends-term-name">${i + 1}. ${escH(t.term)}</span>${t.isBreakout ? '<span class="trends-breakout-badge">🔥 BREAKOUT</span>' : ''}</td>
      <td><span class="trends-category-badge">${escH(t.category)}</span></td>`;

    if (showAll) {
      html += `<td>${fmtTrendsChange(t.change30)}</td><td>${fmtTrendsChange(t.change60)}</td><td>${fmtTrendsChange(t.change90)}</td>`;
    } else {
      html += `<td>${fmtTrendsChange(getTrendsChangeForPeriod(t, trendsPeriod))}</td>`;
    }

    const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(t.term)}&geo=US`;
    html += `<td><a href="${url}" target="_blank" class="trends-google-link">View →</a></td></tr>`;
  });

  html += '</tbody></table></div>';
  document.getElementById('trendsContent').innerHTML = html;
}

function renderTrendsSeedCards() {
  const seeds = trendsData.seeds || [];
  if (seeds.length === 0) return;

  document.getElementById('trendsSeedsHeader').hidden = false;
  document.getElementById('trendsSeedGrid').innerHTML = seeds.map(s => {
    const relCount = (trendsData.terms || []).filter(t => t.category === s.term).length;
    const interest = s.currentInterest ?? 0;
    return `<div class="trends-seed-card">
      <h4>🔎 ${escH(s.term)}</h4>
      <div style="font-size:13px;color:var(--text-secondary);">${relCount} related rising term${relCount !== 1 ? 's' : ''}</div>
      <div class="seed-meta"><span>Interest: ${interest}/100</span><span>${s.status || 'fetched'}</span></div>
      <div class="trends-seed-bar"><div class="trends-seed-bar-fill" style="width:${interest}%"></div></div>
      <a href="https://trends.google.com/trends/explore?q=${encodeURIComponent(s.term)}&geo=US" target="_blank" class="trends-google-link" style="margin-top:8px;">Open in Google Trends →</a>
    </div>`;
  }).join('');
}

function fmtTrendsChange(val) {
  if (val === null || val === undefined) return '<span class="trends-change-neutral">—</span>';
  if (val >= 5000) return '<span class="trends-change-positive">+5000%+ 🚀</span>';
  if (val > 0) return `<span class="trends-change-positive">+${val}%</span>`;
  if (val === 0) return '<span class="trends-change-neutral">0%</span>';
  return `<span class="trends-change-negative">${val}%</span>`;
}

function escH(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function setTrendsPeriod(period) {
  trendsPeriod = period;
  document.querySelectorAll('.trends-period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === period);
  });
  if (period !== 'best') trendsSortCol = 'change';
  renderTrendsTable();
}

function applyTrendsCategory() {
  trendsCategory = document.getElementById('trendsCategoryFilter').value;
  renderTrendsTable();
}

function applyTrendsSearch() {
  trendsSearch = document.getElementById('trendsSearchInput').value;
  renderTrendsTable();
}

function toggleTrendsSort(col) {
  if (trendsSortCol === col) {
    trendsSortDir = trendsSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    trendsSortCol = col;
    trendsSortDir = (col === 'term' || col === 'category') ? 'asc' : 'desc';
  }
  renderTrendsTable();
}

async function trendsManualRefresh() {
  const btn = document.getElementById('trendsRefreshBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Refreshing...';
  try {
    const token = localStorage.getItem('adminToken') || '';
    const res = await fetch('/api/trends/refresh', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    btn.textContent = '✅ Started!';
    setTimeout(() => { btn.textContent = '🔄 Refresh'; btn.disabled = false; }, 3000);
    // Reload data after a delay
    setTimeout(loadTrends, 5000);
  } catch (err) {
    btn.textContent = '❌ Failed';
    btn.disabled = false;
    setTimeout(() => { btn.textContent = '🔄 Refresh'; }, 3000);
  }
}
