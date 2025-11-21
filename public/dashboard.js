async function j(url){ const r = await fetch(url); return r.json(); }
function fmtDate(s){ const d = new Date(s); return d.toLocaleString(); }

let statusChart, socBucketsChart, socPieChart, avgSocChart, energyChart, robotTelemetryChart, sohHistoryChart;;
let baseUrl = '/battman-api/';
async function loadKPIs(){
  const d = await j(baseUrl + '/api/fleet/summary');
  document.getElementById('kpi-total').textContent = d.totalRobots;
  document.getElementById('kpi-active').textContent = d.active;
  document.getElementById('kpi-charging').textContent = d.charging;
  document.getElementById('kpi-uptime').textContent = d.uptimePct.toFixed(1) + '%';
}

async function loadStatus(){
  const d = await j(baseUrl + '/api/fleet/status-breakdown');
  const ctx = document.getElementById('statusChart');
  const labels = d.buckets.map(b=>b.state);
  const data = d.buckets.map(b=>b.count);
  statusChart?.destroy();
  statusChart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Robots', data }] }, options:{ plugins:{legend:{display:false}} } });
}
async function loadSohHistory(id) {
  const d = await j(`/api/robots/${id}/soh-history`);
  const ctx = document.getElementById('sohHistoryChart');

  sohHistoryChart?.destroy();

  sohHistoryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.current.map(p => p.cycle),
      datasets: [
        {
          label: 'Historical SOH (past)',
          data: d.past.map(p => p.soh),
          borderColor: 'red',
          tension: 0.3
        },
        {
          label: 'Observed SOH (current)',
          data: d.current.map(p => p.soh),
          borderColor: 'black',
          tension: 0.3
        },
        {
          label: 'AI optimized SOH (forecast)',
          data: d.forecast.map(p => p.soh),
          borderColor: 'green',
          tension: 0.3
        }
      ]
    },
    options: {
      scales: {
        y: {
          title: { display: true, text: 'SOH (%)' },
          min: 50, max: 100
        },
        x: {
          title: { display: true, text: 'Equivalent Cycles' }
        }
      }
    }
  });
}

async function loadSoc(){
  const b = await j(baseUrl + '/api/fleet/soc-distribution');
  const ctx1 = document.getElementById('socBucketsChart');
  socBucketsChart?.destroy();
  socBucketsChart = new Chart(ctx1, { type:'bar', data:{ labels: b.buckets.map(x=>x.range), datasets:[{ label:'Count', data: b.buckets.map(x=>x.count) }] }, options:{ plugins:{legend:{display:false}} } });

  const p = await j(baseUrl + '/api/fleet/soc-pie');
  const ctx2 = document.getElementById('socPieChart');
  socPieChart?.destroy();
  socPieChart = new Chart(ctx2, { type:'doughnut', data:{ labels:['High (>=80%)','Mid (20-79%)','Low (<20%)'], datasets:[{ data:[p.high,p.mid,p.low] }] } });
}

async function loadTrends(){
  const s = await j(baseUrl + '/api/fleet/avg-soc?range=today');
  const ctx = document.getElementById('avgSocChart');
  avgSocChart?.destroy();
  avgSocChart = new Chart(ctx, { type:'line', data:{ labels: s.points.map(p=>new Date(p.ts).toLocaleTimeString()), datasets:[{ label:'Avg SoC %', data: s.points.map(p=>p.avgSoc), tension:0.3 }] } });

  const e = await j(baseUrl + '/api/energy/daily?days=14');
  const ctx2 = document.getElementById('energyChart');
  energyChart?.destroy();
  energyChart = new Chart(ctx2, { type:'line', data:{ labels: e.days.map(d=>d.date), datasets:[{ label:'Charging kWh', data: e.days.map(d=>d.kWh), tension:0.3 }] } });
}

async function loadChargers(){
  const d = await j(baseUrl + '/api/chargers');
  const body = document.querySelector('#chargersTable tbody');
  body.innerHTML='';
  d.stations.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.id}</td><td>${s.status}</td><td>${s.robotId??''}</td>`;
    body.appendChild(tr);
  });
  const q = await j(baseUrl + '/api/queue');
  const qbody = document.querySelector('#queueTable tbody');
  qbody.innerHTML='';
  q.waiting.forEach(w=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${w.robotId}</td><td>${w.soc}</td><td>${w.etaMin}</td>`;
    qbody.appendChild(tr);
  });
}

async function loadSchedule(){
  const d = await j(baseUrl + '/api/schedule/next?hours=8');
  const body = document.querySelector('#scheduleTable tbody');
  body.innerHTML='';
  d.items.sort((a,b)=> a.start.localeCompare(b.start));
  d.items.forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.robotId}</td><td>${it.stationId}</td><td>${fmtDate(it.start)}</td><td>${fmtDate(it.end)}</td>`;
    body.appendChild(tr);
  });
}

async function loadRobots(){
  const d = await j(baseUrl + '/api/robots');
  const body = document.querySelector('#robotsTable tbody');
  body.innerHTML='';
  d.robots.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><a href="#" data-id="${r.id}">${r.id}</a></td><td>${r.state}</td><td>${r.soc}</td><td>${r.soh}</td><td>${r.cycles}</td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll('a').forEach(a=> a.addEventListener('click', ev=>{ ev.preventDefault(); loadRobotTelemetry(ev.target.dataset.id); loadSohHistory(id);}));
}

async function loadRobotTelemetry(id){
  const d = await j(`/api/robots/${id}/telemetry?hours=6`);
  const ctx = document.getElementById('robotTelemetryChart');
  robotTelemetryChart?.destroy();
  robotTelemetryChart = new Chart(ctx, { type:'line', data:{ labels: d.points.map(p=>new Date(p.ts).toLocaleTimeString()), datasets:[
    { label:'SoC %', data: d.points.map(p=>p.soc), yAxisID:'y1', tension:0.2 },
    { label:'Temp °C', data: d.points.map(p=>p.tempC), yAxisID:'y2', tension:0.2 }
  ] }, options:{ scales:{ y1:{ type:'linear', position:'left' }, y2:{ type:'linear', position:'right' } } } });
}

async function loadAlertsAndPower(){
  const a = await j(baseUrl + '/api/alerts');
  const wrap = document.getElementById('alerts');
  wrap.innerHTML = '';
  a.alerts.forEach(x=>{
    const div = document.createElement('div');
    div.className = 'pill ' + (x.severity==='critical'?'critical':x.severity==='warning'?'warning':'info');
    div.textContent = `[${x.severity.toUpperCase()}] ${new Date(x.ts).toLocaleTimeString()} — ${x.message}`;
    wrap.appendChild(div);
  });

  const p = await j(baseUrl + '/api/power/now');
  document.getElementById('powerNow').textContent = `Total charging power: ${p.nowkW} kW (today peak ${p.todaysPeakkW} kW)`;
}

async function init(){
  await loadKPIs();
  await Promise.all([
    loadStatus(), loadSoc(), loadTrends(), loadChargers(), loadSchedule(), loadRobots(), loadAlertsAndPower()
  ]);
}

init();
setInterval(()=>{ loadKPIs(); loadAlertsAndPower(); }, 15000);
