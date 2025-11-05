const express = require('express');
const cors = require('cors');
const path = require('path');
const dayjs = require('dayjs');

const app = express();
app.use(cors());
app.use(express.json());

const BASE_PATH = '/battman-api';
app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));

let seed = 42;
function rnd() { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return ((seed >>> 0) % 10000) / 10000; }
function pick(arr){ return arr[Math.floor(rnd()*arr.length)]; }

function toCSV(rows){
  if(!rows || rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = keys.join(',');
  const body = rows.map(r => keys.map(k => escape(r[k])).join(',')).join('\n');
  return header + '\n' + body + '\n';
}
function sendCSV(res, filename, rows){
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCSV(rows));
}

const FLEET_SIZE = 42;
const ROBOT_IDS = Array.from({length: FLEET_SIZE}, (_,i)=>`R-${String(i+1).padStart(2,'0')}`);
const CHARGERS = ['CH-01','CH-02','CH-03','CH-04','CH-05','CH-06'];

const robotState = new Map();
ROBOT_IDS.forEach(id=>{
  robotState.set(id, {
    id,
    soc: Math.floor(40 + rnd()*60),
    soh: Math.floor(85 + rnd()*15),
    cycles: Math.floor(200 + rnd()*600),
    state: pick(['active','active','active','charging','idle']),
    tempC: Math.floor(26 + rnd()*12),
  });
});

const chargerState = CHARGERS.map((id)=>{
  const occupied = rnd() > 0.4;
  const robotId = occupied ? pick(ROBOT_IDS) : null;
  return { id, status: occupied ? 'occupied' : 'free', robotId };
});

const queue = ROBOT_IDS
  .filter(id=> robotState.get(id).soc < 20)
  .slice(0, Math.floor(rnd()*3))
  .map(id=>({ robotId: id, soc: robotState.get(id).soc, etaMin: Math.floor(5 + rnd()*15) }));

app.get(BASE_PATH + '/api/fleet/summary', (req,res)=>{
  const all = Array.from(robotState.values());
  const active = all.filter(r=>r.state==='active').length;
  const charging = all.filter(r=>r.state==='charging').length;
  const idle = all.filter(r=>r.state==='idle').length;
  const uptimePct = 95 + rnd()*4;
  res.json({ totalRobots: FLEET_SIZE, active, charging, idle, uptimePct: Number(uptimePct.toFixed(1)), queueLength: queue.length });
});

app.get(BASE_PATH + '/api/fleet/status-breakdown', (req,res)=>{
  const all = Array.from(robotState.values());
  const counts = ['active','charging','idle'].map(s=>({ state:s, count: all.filter(r=>r.state===s).length }));
  res.json({ buckets: counts });
});

app.get(BASE_PATH + '/api/fleet/soc-distribution', (req,res)=>{
  const buckets = Array.from({length:10}, (_,i)=>({ range: `${i*10}-${i*10+10}`, count: 0 }));
  robotState.forEach(r=>{
    const idx = Math.min(9, Math.floor(r.soc/10));
    buckets[idx].count++;
  });
  res.json({ buckets });
});

app.get(BASE_PATH + '/api/fleet/soc-pie', (req,res)=>{
  let high=0, mid=0, low=0;
  robotState.forEach(r=>{ if(r.soc>=80) high++; else if(r.soc<20) low++; else mid++; });
  res.json({ high, mid, low });
});

app.get(BASE_PATH + '/api/fleet/avg-soc', (req,res)=>{
  const range = req.query.range || 'today';
  const now = dayjs();
  const hours = range==='7d' ? 7*24 : 24;
  const points = [];
  for(let i=hours; i>=0; i--){
    const ts = now.subtract(i,'hour');
    const avg = Array.from(robotState.values()).reduce((a,b)=>a+b.soc,0)/FLEET_SIZE + (rnd()*6-3);
    points.push({ ts: ts.toISOString(), avgSoc: Math.max(10, Math.min(100, Math.round(avg))) });
  }
  res.json({ points });
});

app.get(BASE_PATH + '/api/energy/daily', (req,res)=>{
  const days = Number(req.query.days||14);
  const out = [];
  for(let i=days-1;i>=0;i--){
    const date = dayjs().subtract(i,'day').format('YYYY-MM-DD');
    out.push({ date, kWh: Number((40 + rnd()*25).toFixed(1)) });
  }
  res.json({ days: out });
});

app.get(BASE_PATH + '/api/power/now', (req,res)=>{
  const nowkW = 10 + rnd()*30;
  const todaysPeakkW = Math.max(nowkW, 20 + rnd()*25);
  res.json({ nowkW: Number(nowkW.toFixed(1)), todaysPeakkW: Number(todaysPeakkW.toFixed(1)) });
});

app.get(BASE_PATH + '/api/chargers', (req,res)=>{
  res.json({ stations: chargerState });
});

app.get(BASE_PATH + '/api/queue', (req,res)=>{
  res.json({ waiting: queue });
});

app.get(BASE_PATH + '/api/schedule/next', (req,res)=>{
  const hours = Number(req.query.hours||8);
  const start = dayjs();
  const end = start.add(hours,'hour');
  const items = [];
  ROBOT_IDS.slice(0,12).forEach(id=>{
    const s = start.add(Math.floor(rnd()*hours*60),'minute');
    const e = s.add(20 + Math.floor(rnd()*40),'minute');
    items.push({ robotId: id, start: s.toISOString(), end: e.toISOString(), stationId: pick(CHARGERS) });
  });
  res.json({ windowStart: start.toISOString(), windowEnd: end.toISOString(), items });
});

app.get(BASE_PATH + '/api/robots', (req,res)=>{
  const robots = Array.from(robotState.values()).map(r=>({ id: r.id, soc: r.soc, state: r.state, soh: r.soh, cycles: r.cycles }));
  res.json({ robots });
});

app.get(BASE_PATH + '/api/robots/:id/telemetry', (req,res)=>{
  const hours = Number(req.query.hours||6);
  const now = dayjs();
  const id = req.params.id;
  const pts = [];
  let soc = Math.max(15, Math.min(100, robotState.get(id)?.soc ?? 70));
  for(let i=hours*6;i>=0;i--){
    const ts = now.subtract(i*10,'minute');
    const charging = rnd()>0.85;
    soc = Math.max(5, Math.min(100, soc + (charging ? 1.2 : -0.7) + (rnd()*0.6-0.3)));
    const voltage = 48 + soc*0.05 + rnd()*0.8;
    const current = charging ? 12 + rnd()*4 : 2 + rnd()*5;
    const tempC = 28 + (charging?1.5:0) + rnd()*3;
    const powerW = voltage*current;
    pts.push({ ts: ts.toISOString(), soc: Math.round(soc), voltage: Number(voltage.toFixed(1)), current: Number(current.toFixed(1)), tempC: Number(tempC.toFixed(1)), powerW: Number(powerW.toFixed(0)) });
  }
  res.json({ robotId: id, points: pts });
});

app.get(BASE_PATH + '/api/health/soh', (req,res)=>{
  const items = Array.from(robotState.values()).map(r=>({ robotId: r.id, soh: r.soh, cycles: r.cycles }));
  res.json({ items });
});

app.get(BASE_PATH + '/api/alerts', (req,res)=>{
  const alerts = [
    { id: 'A-1001', ts: dayjs().subtract(48,'minute').toISOString(), severity: 'warning', message: 'R-12 battery temp high (46°C)' },
    { id: 'A-1002', ts: dayjs().subtract(20,'minute').toISOString(), severity: 'info', message: 'CH-03 back online' },
    { id: 'A-1003', ts: dayjs().subtract(5,'minute').toISOString(), severity: 'critical', message: 'R-05 SoC < 10% (needs charge)' }
  ];
  res.json({ alerts });
});

app.get(BASE_PATH + '/api/export/robots.csv', (req,res)=>{
  const rows = Array.from(robotState.values()).map(r=>({ robotId: r.id, state: r.state, soc: r.soc, soh: r.soh, cycles: r.cycles }));
  sendCSV(res, 'robots.csv', rows);
});

app.get(BASE_PATH + '/api/export/chargers.csv', (req,res)=>{
  const rows = CHARGERS.map(id=>{
    const s = chargerState.find(c=>c.id===id);
    return { stationId: id, status: s.status, robotId: s.robotId || '' };
  });
  sendCSV(res, 'chargers.csv', rows);
});

app.get(BASE_PATH + '/api/export/queue.csv', (req,res)=>{
  sendCSV(res, 'queue.csv', queue);
});

app.get(BASE_PATH + '/api/export/alerts.csv', (req,res)=>{
  const alerts = [
    { id: 'A-1001', ts: dayjs().subtract(48,'minute').toISOString(), severity: 'warning', message: 'R-12 battery temp high (46°C)' },
    { id: 'A-1002', ts: dayjs().subtract(20,'minute').toISOString(), severity: 'info', message: 'CH-03 back online' },
    { id: 'A-1003', ts: dayjs().subtract(5,'minute').toISOString(), severity: 'critical', message: 'R-05 SoC < 10% (needs charge)' }
  ];
  sendCSV(res, 'alerts.csv', alerts);
});

app.get(BASE_PATH + '/api/export/soc-distribution.csv', (req,res)=>{
  const buckets = Array.from({length:10}, (_,i)=>({ range: `${i*10}-${i*10+10}`, count: 0 }));
  robotState.forEach(r=>{
    const idx = Math.min(9, Math.floor(r.soc/10));
    buckets[idx].count++;
  });
  sendCSV(res, 'soc-distribution.csv', buckets);
});

app.get(BASE_PATH + '/api/export/avg-soc.csv', (req,res)=>{
  const range = req.query.range || 'today';
  const now = dayjs();
  const hours = range==='7d' ? 7*24 : 24;
  const rows = [];
  for(let i=hours; i>=0; i--){
    const ts = now.subtract(i,'hour');
    const avg = Array.from(robotState.values()).reduce((a,b)=>a+b.soc,0)/FLEET_SIZE + (rnd()*6-3);
    rows.push({ ts: ts.toISOString(), avgSoc: Math.max(10, Math.min(100, Math.round(avg))) });
  }
  sendCSV(res, 'avg-soc.csv', rows);
});

app.get(BASE_PATH + '/api/export/energy.csv', (req,res)=>{
  const days = Number(req.query.days||14);
  const rows = [];
  for(let i=days-1;i>=0;i--){
    const date = dayjs().subtract(i,'day').format('YYYY-MM-DD');
    rows.push({ date, kWh: Number((40 + rnd()*25).toFixed(1)) });
  }
  sendCSV(res, 'energy-daily.csv', rows);
});

app.get(BASE_PATH + '/api/export/schedule.csv', (req,res)=>{
  const hours = Number(req.query.hours||8);
  const start = dayjs();
  const items = [];
  ROBOT_IDS.slice(0,12).forEach(id=>{
    const s = start.add(Math.floor(rnd()*hours*60),'minute');
    const e = s.add(20 + Math.floor(rnd()*40),'minute');
    items.push({ robotId: id, stationId: pick(CHARGERS), start: s.toISOString(), end: e.toISOString() });
  });
  sendCSV(res, 'schedule.csv', items.sort((a,b)=>a.start.localeCompare(b.start)));
});

app.get(BASE_PATH + '/api/export/telemetry.csv', (req,res)=>{
  const id = req.query.robotId || ROBOT_IDS[0];
  const hours = Number(req.query.hours||6);
  const now = dayjs();
  const rows = [];
  let soc = Math.max(15, Math.min(100, robotState.get(id)?.soc ?? 70));
  for(let i=hours*6;i>=0;i--){
    const ts = now.subtract(i*10,'minute');
    const charging = rnd()>0.85;
    soc = Math.max(5, Math.min(100, soc + (charging ? 1.2 : -0.7) + (rnd()*0.6-0.3)));
    const voltage = 48 + soc*0.05 + rnd()*0.8;
    const current = charging ? 12 + rnd()*4 : 2 + rnd()*5;
    const tempC = 28 + (charging?1.5:0) + rnd()*3;
    const powerW = voltage*current;
    rows.push({ robotId: id, ts: ts.toISOString(), soc: Math.round(soc), voltage: Number(voltage.toFixed(1)), current: Number(current.toFixed(1)), tempC: Number(tempC.toFixed(1)), powerW: Number(powerW.toFixed(0)) });
  }
  sendCSV(res, `telemetry-${id}.csv`, rows);
});

app.get([BASE_PATH, BASE_PATH + '/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, ()=> console.log(`Battman API running on port ${PORT}`));
