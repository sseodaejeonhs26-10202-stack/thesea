'use strict';
const $ = id => document.getElementById(id);
const KEY = 'sea-step-v1';
const WASTE_LABELS = { plastic: '플라스틱', can: '캔', glass: '유리', other: '기타' };
let records = [], profile = {}, photo = null, locationData = null, selectedAt = null;
let tab = 'school', watchId = null, route = [], runDistance = 0, locating = false;
let runState = 'idle', elapsedMs = 0, activeSince = null, timerId = null, gpsSession = 0, newSegment = true;
let liveMap = null, historyMap = null;
try { const data = JSON.parse(localStorage.getItem(KEY) || '{}'); records = Array.isArray(data.records) ? data.records : []; profile = data.profile || {}; } catch { $('formStatus').textContent = '기존 기록을 읽지 못했어요. 브라우저 저장소를 확인해 주세요.'; }
$('userName').value = profile.name || '';
$('school').value = profile.school || '';
function persist(nextRecords, nextProfile = profile) {
  localStorage.setItem(KEY, JSON.stringify({ records: nextRecords, profile: nextProfile }));
  records = nextRecords; profile = nextProfile;
}
function element(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
function sum(items, key) { return items.reduce((n, r) => n + Number(r[key] || 0), 0); }
function render() {
  $('totalBags').textContent = sum(records, 'bags'); $('totalPoints').textContent = sum(records, 'bags') * 100;
  $('totalDistance').textContent = sum(records, 'distance').toFixed(1);
  const school = $('school').value.trim() || profile.school;
  const schoolBags = sum(records.filter(r => r.school === school), 'bags');
  $('schoolProgress').textContent = `${schoolBags} / 30봉투`;
  $('progressBar').style.width = `${Math.min(100, schoolBags / 30 * 100)}%`;
  renderRanking(); renderHistory();
}
function renderRanking() {
  const examples = tab === 'school' ? [{ name: '해솔고등학교', bags: 24 }, { name: '바다중학교', bags: 18 }, { name: '푸른고등학교', bags: 12 }] : [{ name: '바다러너', bags: 9 }, { name: '줍깅메이트', bags: 7 }, { name: '초록발자국', bags: 5 }];
  const groups = new Map();
  for (const r of records) {
    const key = tab === 'school' ? r.school : JSON.stringify([r.name, r.school]);
    if (!groups.has(key)) groups.set(key, { name: tab === 'school' ? r.school : r.name, school: r.school, bags: 0, own: true });
    groups.get(key).bags += r.bags;
  }
  const list = [...examples, ...groups.values()].sort((a, b) => b.bags - a.bags);
  $('rankingNote').textContent = tab === 'friends' ? '친구 그룹 예시 · 실제 친구 초대·확인은 연결되지 않았어요.' : '봉투 수 기준 · 예시 참가자와 내 기록을 비교해요.';
  $('rankList').replaceChildren();
  list.forEach((r, i) => {
    const li = element('li', ''); li.append(element('span', i + 1, 'rank-number'), element('span', r.name.slice(0, 1), 'avatar'));
    const name = element('div', r.name, 'rank-name'); name.append(element('small', r.own ? `내 기록${tab === 'school' ? '' : ' · ' + r.school}` : '예시 참가자'));
    const amount = element('div', `${r.bags} `, 'rank-amount'); amount.append(element('small', '봉투')); li.append(name, amount); $('rankList').append(li);
  });
}
function renderHistory() {
  const container = $('historyList'); container.replaceChildren();
  if (!records.length) { container.append(element('p', '아직 기록이 없어요. 첫 번째 바다 발자국을 남겨 보세요.', 'empty')); return; }
  for (const r of records) {
    const item = element('article', '', 'history-item'); const thumb = element('button', '', 'thumb'); thumb.type = 'button'; thumb.setAttribute('aria-label', '인증 사진 크게 보기');
    const img = document.createElement('img'); img.src = r.photo; img.alt = `${r.name}의 쓰레기 ${r.bags}봉투 인증 사진`; thumb.append(img);
    thumb.onclick = () => { $('fullPhoto').src = r.photo; $('photoDialog').showModal(); };
    const content = element('div', '', 'history-text'); content.append(element('strong', `${r.bags}봉투 · ${r.bags * 100}P`));
    const time = new Date(r.selectedAt).toLocaleString('ko-KR');
    content.append(element('p', `${r.name} · ${r.school} · ${Number(r.distance).toFixed(2)}km\n사진 선택: ${time}`));
    content.append(element('p', r.location ? `위도 ${r.location.lat.toFixed(5)}, 경도 ${r.location.lng.toFixed(5)} · 오차 약 ${Math.round(r.location.accuracy)}m · ${new Date(r.location.at).toLocaleTimeString('ko-KR')} 수집` : '위치 미기록'));
    content.append(element('p', '인증 상태: 자기 기록 · 친구 확인 전'));
    const wasteTypes = Array.isArray(r.wasteTypes) ? r.wasteTypes.filter(type => Object.hasOwn(WASTE_LABELS, type)) : [];
    if (wasteTypes.length) {
      const tags = element('div', '', 'waste-tags');
      wasteTypes.forEach(type => tags.append(element('span', WASTE_LABELS[type], 'waste-tag')));
      content.append(tags);
    }
    if (typeof r.note === 'string' && r.note.trim()) content.append(element('p', r.note, 'saved-note'));
    if (Number.isFinite(r.durationSeconds)) content.append(element('p', `활동 시간: ${formatDuration(r.durationSeconds)}`));
    if (r.route?.length) {
      const view = element('button', '지도에서 경로 보기', 'secondary route-button'); view.type = 'button';
      view.onclick = () => showHistoryMap(r); content.append(view);
    }
    const del = element('button', '삭제', 'delete'); del.type = 'button'; del.onclick = () => { if (!confirm('이 활동 기록을 삭제할까요?')) return; try { persist(records.filter(item => item.id !== r.id)); render(); } catch { alert('삭제하지 못했어요. 저장소 설정을 확인해 주세요.'); } };
    item.append(thumb, content, del); container.append(item);
  }
}
async function resizePhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const ratio = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas.toDataURL('image/jpeg', .75);
}
let photoRequest = 0;
$('photo').onchange = async e => {
  const request = ++photoRequest; photo = null; selectedAt = null; $('photoPreview').hidden = true; $('uploadText').hidden = false;
  const file = e.target.files[0]; if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { $('formStatus').textContent = '10MB 이하의 이미지 파일을 선택해 주세요.'; e.target.value = ''; return; }
  const time = new Date().toISOString(); $('save').disabled = true;
  try { const data = await resizePhoto(file); if (request !== photoRequest) return; photo = data; selectedAt = time; $('photoPreview').src = photo; $('photoPreview').hidden = false; $('uploadText').hidden = true; $('formStatus').textContent = '사진이 준비됐어요.'; }
  catch { if (request === photoRequest) { $('formStatus').textContent = '사진을 읽지 못했어요. JPG 또는 PNG 사진을 선택해 주세요.'; e.target.value = ''; } }
  finally { if (request === photoRequest) $('save').disabled = false; }
};
function positionData(pos) { return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: new Date(pos.timestamp).toISOString() }; }
$('locate').onclick = () => {
  if (!navigator.geolocation) { $('locationText').textContent = '이 브라우저에서는 위치 기능을 사용할 수 없어요.'; return; }
  locating = true; $('locate').disabled = true; $('locationText').textContent = '현재 위치를 확인하고 있어요…';
  navigator.geolocation.getCurrentPosition(pos => { locationData = positionData(pos); $('locationText').textContent = `${locationData.lat.toFixed(5)}, ${locationData.lng.toFixed(5)} · 오차 약 ${Math.round(locationData.accuracy)}m`; locating = false; $('locate').disabled = false; }, () => { $('locationText').textContent = '위치 권한 또는 GPS를 확인하고 다시 시도해 주세요. 위치 없이도 저장할 수 있어요.'; locating = false; $('locate').disabled = false; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
};
function km(a, b) { const rad = Math.PI / 180; const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2; return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))); }
function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
function durationSeconds() { return Math.floor((elapsedMs + (activeSince === null ? 0 : performance.now() - activeSince)) / 1000); }
function updateRunMetrics() { $('runTime').textContent = formatDuration(durationSeconds()); $('runDistance').textContent = runDistance.toFixed(2); }
function freezeTimer() {
  if (activeSince !== null) elapsedMs += performance.now() - activeSince;
  activeSince = null; clearInterval(timerId); timerId = null; updateRunMetrics();
}
function clearGPS() {
  gpsSession++; if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; newSegment = true;
}
function updateRunControls() {
  $('run').disabled = runState === 'running' || runState === 'paused';
  $('run').textContent = runState === 'idle' ? '러닝 시작' : '새 러닝 시작';
  $('pauseRun').disabled = runState !== 'running' && runState !== 'paused';
  $('pauseRun').textContent = runState === 'paused' ? '러닝 재개' : '일시정지';
  $('endRun').disabled = runState !== 'running' && runState !== 'paused';
  $('distance').readOnly = runState !== 'idle';
}
function stopRun() { clearGPS(); freezeTimer(); if (runState !== 'idle') runState = 'ended'; updateRunControls(); }
function routeSegments(points) {
  const segments = [];
  for (const p of points) { if (!segments.length || p.segmentStart) segments.push([]); segments.at(-1).push([p.lat, p.lng]); }
  return segments;
}
function createRouteMap(id, statusId) {
  if (!window.L) { $(statusId).textContent = '지도를 불러오지 못했어요. 거리와 시간은 계속 기록할 수 있어요.'; return null; }
  const map = L.map(id, { scrollWheelZoom: false }).setView([36.3, 127.8], 7);
  const layers = L.layerGroup().addTo(map);
  if (window.location.protocol === 'file:') {
    $(statusId).textContent = '지도 배경을 보려면 로컬 서버 또는 HTTPS 웹사이트에서 열어 주세요. 경로·시간 기록은 사용할 수 있어요.';
  } else {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
      .on('tileerror', () => { $(statusId).textContent = '지도 배경을 불러오지 못했어요. 인터넷 연결을 확인해 주세요. 경로 기록은 계속돼요.'; }).addTo(map);
  }
  return { map, layers };
}
function drawRoute(view, points, fit = false) {
  if (!view) return;
  view.map.invalidateSize(); view.layers.clearLayers();
  if (!points.length) return;
  for (const segment of routeSegments(points)) L.polyline(segment, { color: '#087c73', weight: 5 }).addTo(view.layers);
  const first = points[0], last = points.at(-1);
  L.circleMarker([first.lat, first.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#087c73', fillOpacity: 1 }).bindTooltip('출발').addTo(view.layers);
  L.circleMarker([last.lat, last.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#df8c48', fillOpacity: 1 }).bindTooltip('마지막 위치').addTo(view.layers);
  if (fit && points.length > 1) view.map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [25, 25], maxZoom: 17 });
  else view.map.setView([last.lat, last.lng], 16);
}
function refreshLiveMap() {
  if (!$('runPanel').open) return;
  if (!liveMap) liveMap = createRouteMap('runMap', 'mapStatus');
  drawRoute(liveMap, route, true);
}
function showHistoryMap(record) {
  $('routeSummary').textContent = `${Number(record.distance).toFixed(2)}km · ${Number.isFinite(record.durationSeconds) ? formatDuration(record.durationSeconds) : '활동 시간 미기록'} · 초록: 출발 / 주황: 마지막 위치`;
  $('routeDialog').showModal();
  if (!historyMap) historyMap = createRouteMap('historyMap', 'historyMapStatus');
  drawRoute(historyMap, record.route, true);
}
function beginGPS() {
  const session = ++gpsSession, requestedAt = Date.now(); newSegment = true;
  const id = navigator.geolocation.watchPosition(pos => {
    if (session !== gpsSession || runState !== 'running' || pos.timestamp < requestedAt) return;
    const point = positionData(pos);
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !Number.isFinite(point.accuracy) || point.accuracy > 80) { $('runStatus').textContent = 'GPS 신호가 약해요. 열린 장소에서 시도해 주세요.'; return; }
    const prev = newSegment ? null : route.at(-1);
    if (prev) {
      const delta = km(prev, point), seconds = (Date.parse(point.at) - Date.parse(prev.at)) / 1000;
      if (seconds <= 0 || delta / seconds > .012 || delta < .005) return;
      // A long GPS interruption starts a separate segment instead of inventing a route.
      if (seconds > 30) point.segmentStart = true; else runDistance += delta;
    } else point.segmentStart = true;
    newSegment = false; route.push(point); locationData = point;
    $('locationText').textContent = `러닝 위치 ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    $('distance').value = runDistance.toFixed(2); updateRunMetrics(); refreshLiveMap();
    $('runStatus').textContent = '기록 중 · 잠깐 쉴 때 일시정지를 눌러 주세요.';
  }, error => {
    if (session !== gpsSession || runState !== 'running') return;
    if (error.code !== 1) { newSegment = true; $('runStatus').textContent = 'GPS 신호를 다시 찾고 있어요. 잠시 기다리거나 일시정지해 주세요.'; return; }
    clearGPS(); freezeTimer(); runState = 'paused'; updateRunControls();
    $('runStatus').textContent = '위치 권한이 필요해요. 권한을 허용한 뒤 러닝 재개를 눌러 주세요.';
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  if (session === gpsSession && runState === 'running') watchId = id; else navigator.geolocation.clearWatch(id);
}
$('run').onclick = () => {
  if (runState === 'running' || runState === 'paused') return;
  if (!navigator.geolocation) { $('runStatus').textContent = '이 브라우저는 위치 기능을 지원하지 않아요.'; return; }
  if (runState === 'ended' && !confirm('새 러닝을 시작하면 아직 저장하지 않은 경로와 활동 시간이 초기화돼요. 시작할까요?')) return;
  clearGPS(); freezeTimer(); route = []; runDistance = 0; elapsedMs = 0; locationData = null; $('distance').value = 0;
  $('locationText').textContent = '러닝 GPS 위치를 기다리고 있어요.';
  runState = 'running'; activeSince = performance.now(); timerId = setInterval(updateRunMetrics, 1000);
  $('runStatus').textContent = 'GPS 신호를 기다리는 중 · 활동 시간은 시작됐어요.';
  updateRunControls(); updateRunMetrics(); refreshLiveMap(); beginGPS();
};
$('pauseRun').onclick = () => {
  if (runState === 'running') {
    clearGPS(); freezeTimer(); runState = 'paused'; $('runStatus').textContent = '일시정지 · 시간과 이동 경로를 기록하지 않아요.';
  } else if (runState === 'paused') {
    runState = 'running'; activeSince = performance.now(); timerId = setInterval(updateRunMetrics, 1000);
    $('runStatus').textContent = '러닝 재개 · GPS 신호를 기다리는 중'; beginGPS();
  }
  updateRunControls();
};
$('endRun').onclick = () => { stopRun(); $('runStatus').textContent = '러닝 종료 · 사진과 함께 기록을 저장해 주세요.'; };
$('runPanel').addEventListener('toggle', refreshLiveMap);
$('closeRoute').onclick = () => $('routeDialog').close();
refreshLiveMap();
$('recordForm').onsubmit = e => {
  e.preventDefault();
  if (!photo) { $('formStatus').textContent = '인증 사진을 먼저 추가해 주세요.'; return; }
  if (locating) { $('formStatus').textContent = '위치 확인이 끝난 후 저장해 주세요.'; return; }
  const bags = Number($('bags').value), distance = Number($('distance').value || 0), name = $('userName').value.trim(), school = $('school').value.trim();
  if (!name || !school || !Number.isInteger(bags) || bags < 1 || bags > 100 || !Number.isFinite(distance) || distance < 0 || distance > 200) { $('formStatus').textContent = '이름, 학교, 봉투 수(1~100), 거리(0~200)를 확인해 주세요.'; return; }
  const wasteTypes = [...document.querySelectorAll('input[name="wasteTypes"]:checked')].map(input => input.value).filter(type => Object.hasOwn(WASTE_LABELS, type));
  const note = $('activityNote').value.trim().slice(0, 500);
  const next = { id: crypto.randomUUID(), name, school, bags, distance, wasteTypes, note, photo, selectedAt, savedAt: new Date().toISOString(), location: locationData, route: [...route], ...(runState !== 'idle' ? { durationSeconds: durationSeconds() } : {}) };
  try { persist([next, ...records], { name, school }); }
  catch { $('formStatus').textContent = '저장 공간이 부족하거나 저장이 차단됐어요. 기존 기록을 내보낸 후 정리해 주세요.'; return; }
  document.querySelectorAll('input[name="wasteTypes"]').forEach(input => { input.checked = false; });
  $('activityNote').value = ''; $('noteCount').textContent = '0 / 500자';
  stopRun(); photo = null; selectedAt = null; locationData = null; route = []; runDistance = 0;
  runState = 'idle'; elapsedMs = 0; updateRunMetrics(); updateRunControls(); refreshLiveMap();
  $('photo').value = ''; $('photoPreview').hidden = true; $('uploadText').hidden = false; $('bags').value = 1; $('distance').value = 0; $('pointsPreview').textContent = '100P'; $('locationText').textContent = '위치를 추가하면 기록에 함께 저장돼요.'; $('runStatus').textContent = '';
  $('formStatus').textContent = `${bags}봉투, ${bags * 100}P를 저장했어요!`; render();
};
$('bags').oninput = () => $('pointsPreview').textContent = `${Math.max(0, Number($('bags').value) || 0) * 100}P`;
$('activityNote').oninput = () => { $('noteCount').textContent = `${$('activityNote').value.length} / 500자`; };
$('school').oninput = () => render();
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { tab = button.dataset.tab; document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === button))); renderRanking(); });
$('closeDialog').onclick = () => $('photoDialog').close();
$('export').onclick = () => { if (!records.length) { alert('내보낼 기록이 아직 없어요.'); return; } const blob = new Blob([JSON.stringify({ profile, records }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = '씨스텝-활동기록.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
window.addEventListener('beforeunload', () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); });
render();
