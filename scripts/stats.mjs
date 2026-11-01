// Anonymous-stats report from the Supabase `stats` views: retention, sources, funnel, sector win
// rates, run quits, exits, playtime, feature use, frame rate, ads, errors.
//
//   npm run stats                # last 14 days of the daily tables
//   npm run stats -- --days 30
//
// Needs DATABASE_URL (Supabase dashboard → Connect → Session pooler URI), from the environment or
// a gitignored .env.local. The session is read-only: this script can't change anything.
import { existsSync } from 'node:fs';
import pg from 'pg';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (Supabase → Connect → Session pooler URI), in the environment or in .env.local');
  process.exit(1);
}
const di = process.argv.indexOf('--days');
const days = di > 0 ? Math.max(1, Number(process.argv[di + 1]) || 14) : 14;

// Cohorts too young to have reached day N show "…" instead of a misleading 0%.
const SECTIONS = [
  ['Daily', `select day, players, sessions, runs, ads_watched, errors from stats.daily where day > current_date - $1::int order by day desc`, true],
  [
    'Retention by cohort (targets: D1 ≥ 35%, D7 ≥ 15%)',
    `select cohort, new_players,
       case when cohort + 1 <= current_date then d1_pct end as d1_pct,
       case when cohort + 7 <= current_date then d7_pct end as d7_pct,
       case when cohort + 30 <= current_date then d30_pct end as d30_pct
     from stats.retention where cohort > current_date - $1::int order by cohort desc`,
    true,
  ],
  ['Sources (first visit)', `select * from stats.sources`],
  ['Funnel: highest sector reached', `select * from stats.funnel`],
  ['Campaign sectors', `select * from stats.sectors`],
  [
    'Runs started vs finished (unfinished = tab closed mid-run)',
    `select sector, starts, ends, retreats, round(100.0 * greatest(starts - ends, 0) / nullif(starts, 0)) as unfinished_pct from stats.run_quits`,
  ],
  ['Where players left from', `select * from stats.exits`],
  ['Playtime', `select * from stats.playtime where day > current_date - $1::int`, true],
  ['Feature use (share of all players)', `select * from stats.features`],
  ['Frame rate by renderer', `select * from stats.perf`],
  [
    'Ads by placement',
    `select data->>'placement' as placement,
       count(*) filter (where data->>'stage' = 'offer') as offered,
       count(*) filter (where data->>'stage' = 'result') as started,
       count(*) filter (where data->>'stage' = 'result' and (data->>'ok')::boolean) as completed
     from public.events where kind = 'ad' group by 1 order by 2 desc`,
  ],
  [
    'Errors',
    `select left(data->>'msg', 90) as message, data->>'where' as at, count(*) as times, count(distinct player) as players, max(day) as last_seen
     from public.events where kind = 'error' and day > current_date - $1::int group by 1, 2 order by 3 desc limit 15`,
    true,
  ],
];

const fmt = (v) => (v === null || v === undefined ? '…' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

function table(title, rows) {
  console.log(`\n${title}`);
  if (!rows.length) return console.log('  (no data yet)');
  const cols = Object.keys(rows[0]);
  const cells = rows.map((r) => cols.map((c) => fmt(r[c])));
  const w = cols.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i].length)));
  const num = cols.map((_, i) => cells.every((r) => /^-?[\d.]+$|^…$/.test(r[i])));
  const line = (r) => '  ' + r.map((v, i) => (num[i] ? v.padStart(w[i]) : v.padEnd(w[i]))).join('  ');
  console.log(line(cols));
  console.log('  ' + w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of cells) console.log(line(r));
}

/** Players-weighted D1/D7 over the cohorts old enough to have them. */
function retentionSummary(rows) {
  const out = [];
  for (const k of ['d1_pct', 'd7_pct']) {
    const m = rows.filter((r) => r[k] !== null);
    const n = m.reduce((s, r) => s + Number(r.new_players), 0);
    if (n) out.push(`${k.slice(0, 2).toUpperCase()} ${((m.reduce((s, r) => s + Number(r.new_players) * Number(r[k]), 0)) / n).toFixed(1)}% (${n} players)`);
  }
  if (out.length) console.log(`  overall: ${out.join(' · ')}`);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on' });
await client.connect();
try {
  // dates come back as plain YYYY-MM-DD, not shifted into the local time zone
  pg.types.setTypeParser(1082, (v) => v);
  console.log(`Dead Signal stats · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · daily tables: last ${days} days`);
  for (const [title, sql, windowed] of SECTIONS) {
    const { rows } = await client.query(sql, windowed ? [days] : []);
    table(title, rows);
    if (title.startsWith('Retention')) retentionSummary(rows);
  }
} finally {
  await client.end();
}
