import './style.css';
import './growth.css';
import { ACHIEVEMENTS, COSMETICS, advancePet, applyAction, createPet, equipCosmetic, exploreCorner, renamePet, xpForNextLevel, type CareAction, type ExploreCorner, type PetSaveV2 } from './core';
import { loadSave, parseImport, savePet, serializePet, STORAGE_KEY } from './persistence';
import { WriterLease, WRITER_LEASE_KEY } from './writerLease';
import { PetScene } from './scene';
import { dogPortrait, icon } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const initial = loadSave();
let pet: PetSaveV2 = initial.pet ?? createPet('可可');
let adopted = Boolean(initial.pet);
let storageError = initial.error;
let recoveryNeeded = Boolean(initial.error && initial.raw !== null);
let recoveryRaw = initial.raw;
let recoveryError = initial.error;
let writer = false;
let busy = false;
let sleeping = false;
let scene: PetScene | null = null;
let sceneReady = false;
let lastTick = performance.now();
let lastSave = performance.now();
let toastTimer = 0;
let captionTimer = 0;
let lockRelease: (() => void) | undefined;
let fallbackLease: WriterLease | null = null;
let stopLeaseHeartbeat: (() => void) | undefined;
let volatileMode = false;
let milestoneSignature = '';
let growthSignature = '';
let missionTab: 'daily' | 'weekly' = 'daily';
let audioContext: AudioContext | null = null;

const actions: { id: CareAction; title: string; sub: string; icon: string; color: string }[] = [
  { id: 'feed', title: '開飯囉', sub: '一口一口，都是愛', icon: 'bowl', color: 'peach' },
  { id: 'pet', title: '摸摸頭', sub: '最喜歡你的溫柔', icon: 'hand', color: 'rose' },
  { id: 'play', title: '玩球球', sub: '快樂就這麼簡單', icon: 'ball', color: 'sage' },
  { id: 'water', title: '喝點水', sub: '咕嚕咕嚕補充水分', icon: 'drop', color: 'blue' },
  { id: 'sleep', title: '睡個好覺', sub: '做一個軟綿綿的夢', icon: 'moon', color: 'lavender' },
];

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="臘腸日和首頁"><span class="brand-mark">${icon('paw')}</span><span><strong>臘腸日和<span class="brand-dot">.</span></strong><small>A LITTLE DOG, A LITTLE HOME</small></span></a>
    <div class="header-right"><span class="local-note">${icon('shield')}只屬於你們的小天地</span><span class="header-divider"></span><button class="icon-button settings-trigger" aria-label="開啟設定" title="設定">${icon('settings')}</button></div>
  </header>
  <main class="page-shell">
    <section class="intro" aria-labelledby="page-title"><div><span class="eyebrow"><span class="tiny-sun">✳</span> 把日子，過成喜歡的樣子</span><h1 id="page-title">有你在，就是<span>好日子。</span></h1><p>一隻小狗，一個家。一起收藏平凡裡的小小幸福。</p></div><div class="today-note">${icon('sun')}<span>今天，也要一起慢慢過。<small id="today-date"></small></span></div></section>
    <div class="notice hidden" id="notice" role="status"></div>
    <section class="game-layout" aria-label="寵物與日常狀態">
      <div class="room-panel">
        <div class="room-heading"><span class="room-label">${icon('leaf')}<span id="room-title">可可的小客廳</span></span><div class="room-tools"><button class="glass-button" id="explore-room" aria-label="探索小窩" title="探索小窩">${icon('sparkle')}</button><button class="glass-button" id="reset-camera" aria-label="鏡頭回正" title="鏡頭回正">${icon('reset')}</button></div></div>
        <div id="scene" aria-label="3D 棕色臘腸狗與奶油色客廳"><div class="scene-loading" id="scene-loading"><span class="loading-paw">${icon('paw')}</span><p>正在把小窩準備好…</p></div></div>
        <div class="room-caption" id="room-caption">今天也想和你一起玩！<span>♡</span></div>
        <div class="room-footer"><span class="live-state"><span></span><span id="activity-text">自在放空中</span></span><span class="camera-hint">拖曳轉個角度 · 點點小窩探索</span></div>
      </div>
      <aside class="pet-panel" aria-label="寵物資訊">
        <div class="pet-profile"><div class="pet-avatar">${dogPortrait()}</div><div class="profile-info"><span class="mini-label">MY LITTLE FRIEND</span><div class="pet-name-line"><h2 id="pet-name">可可</h2><button class="mini-button settings-trigger" aria-label="修改寵物名字">${icon('edit')}</button></div><p>短毛臘腸狗<span> · </span>小小的療癒擔當</p></div></div>
        <div class="together-chip">${icon('heart')}<span id="together-text">我們的故事，即將開始</span></div>
        <div class="needs-header"><h3>今天的我</h3><span id="wellbeing">心情很好呢</span></div>
        <div class="needs-list">${[
          ['satiety', '飽飽的肚子', 'bowl', 'peach'], ['mood', '開心的心情', 'heart', 'rose'], ['hydration', '水分補給', 'drop', 'blue'], ['energy', '滿滿的精神', 'sparkle', 'sage'],
        ].map(([key, label, symbol, color]) => `<div class="need-row ${color}"><span class="need-icon">${icon(symbol)}</span><div class="need-detail"><div><span>${label}</span><span id="value-${key}"></span></div><div class="meter" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" id="meter-${key}"><span id="bar-${key}"></span></div></div></div>`).join('')}</div>
        <div class="little-stats"><h3>${icon('leaf')}一起慢慢長大</h3><div class="stat-grid"><div><strong id="stat-days">1<span>天</span></strong><small>來到家的日子</small></div><div><strong id="stat-feed">0<span>次</span></strong><small>好好吃飯</small></div><div><strong id="stat-time">0<span>分</span></strong><small>專屬陪伴</small></div></div></div>
        <div class="save-indicator" id="save-indicator">${icon('check')}每個小日常，都會好好記住</div>
      </aside>
    </section>
    <section class="care-section" aria-label="照顧狗狗"><div class="care-heading"><span>陪牠一下</span><small>A LITTLE LOVE</small></div><div class="care-actions">${actions.map(action => `<button class="care-button ${action.color}" data-action="${action.id}"><span class="care-icon">${icon(action.icon)}</span><span class="care-copy"><strong>${action.title}</strong><small>${action.sub}</small></span></button>`).join('')}</div></section>
    <section class="growth-section" aria-labelledby="growth-title">
      <div class="section-heading growth-header"><div><span class="eyebrow">LITTLE STEPS, LOTS OF LOVE</span><h2 id="growth-title">一起長大的小日子<span>慢慢來，每一天都有一點點收穫。</span></h2></div><button class="text-button" id="open-wardrobe">${icon('sparkle')} 佈置我們的小窩 ${icon('arrow')}</button></div>
      <div class="growth-grid">
        <article class="growth-card mission-card"><div class="growth-card-heading"><div><span class="eyebrow">A LITTLE THING TO DO</span><h3>陪伴的小約定 <span>♡</span></h3></div><div class="growth-tabs" aria-label="任務時間"><button type="button" class="growth-tab active" data-mission-tab="daily" aria-pressed="true">每日</button><button type="button" class="growth-tab" data-mission-tab="weekly" aria-pressed="false">每週</button></div></div><div id="mission-summary" class="mission-summary"></div><div class="mission-list" id="mission-list"></div><p class="growth-hint">不急著完成，能見面就很開心。<span>沒有錯過的懲罰 ♡</span></p></article>
        <article class="growth-card bond-card"><div class="growth-card-heading"><div><span class="eyebrow">GROWING TOGETHER</span><h3>我們的親密時光</h3></div><span class="bond-decoration">${icon('heart')}</span></div><div id="growth-progress"></div><div class="growth-card-divider"></div><div class="unlock-teaser" id="unlock-teaser"></div><button class="wardrobe-open-button" id="open-wardrobe-card">${icon('gift')} 打開收藏小屋 ${icon('arrow')}</button></article>
      </div>
    </section>
    <section class="memories" aria-labelledby="memories-title"><div class="section-heading"><div><span class="eyebrow">LITTLE MOMENTS, BIG LOVE</span><h2 id="memories-title">我們的小小里程碑<span>每一份陪伴，都值得紀念。</span></h2></div><button class="text-button" id="all-achievements">全部成就 <span id="achievement-count">0</span>${icon('arrow')}</button></div><div class="milestone-grid" id="milestone-grid"></div></section>
    <section class="journal-section" aria-labelledby="journal-title"><div class="section-heading"><div><span class="eyebrow">OUR LITTLE DIARY</span><h2 id="journal-title">寫給我們的日記<span>把平凡的瞬間，收藏成回憶。</span></h2></div></div><div class="journal-list" id="journal-list"></div></section>
    <footer class="site-footer"><span>${icon('paw')}不用很厲害，也能成為牠的全世界。</span><span>${icon('lock')}本機保存，安心陪伴 <span class="footer-dot">·</span> 臘腸日和 v2.0</span></footer>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <div class="confetti" id="confetti" aria-hidden="true"></div>
  <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
  <input type="file" id="import-file" accept="application/json,.json" hidden />
`;

const dialog = $<HTMLDialogElement>('#dialog');
$('#today-date').textContent = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

function showToast(message: string, type: 'success' | 'error' = 'success') {
  clearTimeout(toastTimer);
  $('#toast').innerHTML = `${icon(type === 'success' ? 'heart' : 'shield')}<span>${escapeHtml(message)}</span>`;
  $('#toast').classList.add('visible');
  $('#toast').classList.toggle('error', type === 'error');
  toastTimer = window.setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}

function prepareSound() {
  if (!pet.settings.soundEnabled) return;
  try {
    const AudioConstructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioConstructor) return;
    audioContext ??= new AudioConstructor();
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch { /* Sound is optional; care and saving always remain available. */ }
}

function celebrate() {
  if (!pet.settings.reducedMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const confetti = $('#confetti');
    confetti.innerHTML = Array.from({ length: 18 }, (_, index) => `<span class="confetti-piece" style="--x:${8 + (index * 43 % 84)}%;--delay:${index % 5 * 0.07}s;--turn:${index % 2 ? 190 : -190}deg;--color:${['#d9af97', '#a7bb9c', '#eed08e', '#c3b6d2'][index % 4]}"></span>`).join('');
    window.setTimeout(() => { confetti.innerHTML = ''; }, 3000);
  }
  if (pet.settings.soundEnabled && audioContext?.state === 'running') {
    try {
      const context = audioContext;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const start = context.currentTime + index * 0.095;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.035, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.25);
      });
    } catch { /* Audio must never prevent the interaction from completing. */ }
  }
}

function setCaption(message: string, persist = false) {
  clearTimeout(captionTimer);
  $('#room-caption').innerHTML = `${escapeHtml(message)}<span>♡</span>`;
  if (!persist) captionTimer = window.setTimeout(() => setCaption(sleeping ? '呼嚕…夢裡也有你。' : '有你陪著，真好。', true), 6500);
}

function showDialog(content: string, closable = true) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = `${closable ? `<button class="dialog-close icon-button" aria-label="關閉視窗">${icon('close')}</button>` : ''}${content}`;
  dialog.dataset.closable = String(closable);
  dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
  dialog.showModal();
}

dialog.addEventListener('cancel', event => { if (dialog.dataset.closable === 'false') event.preventDefault(); });
dialog.addEventListener('click', event => {
  if (event.target === dialog && dialog.dataset.closable !== 'false') {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }
});

function saveNow() {
  if (!adopted || !ensureWriter() || recoveryNeeded) return false;
  if (volatileMode) { renderNotice(); return false; }
  const result = savePet(pet);
  storageError = result.error;
  lastSave = performance.now();
  renderNotice();
  return result.ok;
}

function loseWriter() {
  if (!writer) return;
  writer = false;
  stopLeaseHeartbeat?.();
  stopLeaseHeartbeat = undefined;
  lockRelease?.();
  render();
}

function ensureWriter(): boolean {
  if (!writer) return false;
  if (fallbackLease && !fallbackLease.owns()) { loseWriter(); return false; }
  return true;
}

function renderNotice() {
  const notice = $('#notice');
  const message = !writer ? '這份日常正在另一個分頁開啟。請關閉另一個分頁，再重新整理這裡繼續陪伴。' : recoveryNeeded ? '原本的存檔需要修復，尚未覆蓋任何資料。請先匯出備份或匯入有效存檔。' : storageError ? `目前無法自動保存：${storageError}。你仍可在設定匯出目前紀錄。` : '';
  notice.classList.toggle('hidden', !message);
  notice.textContent = message;
  $('#save-indicator').innerHTML = `${icon(storageError || !writer || recoveryNeeded ? 'shield' : 'check')}${storageError ? '暫未保存，請匯出備份' : !writer ? '另一個分頁正在照顧中' : '每個小日常，都會好好記住'}`;
}

function renderGrowth() {
  const signature = JSON.stringify({ tab: missionTab, missions: pet.missions[missionTab], progress: pet.progress, streak: pet.streak, unlocked: pet.unlocks.unlocked, journal: pet.journal.slice(-4), adopted });
  if (signature === growthSignature) return;
  growthSignature = signature;
  const missions = pet.missions[missionTab];
  const complete = missions.filter(mission => mission.completedAt !== null).length;
  $('#mission-summary').innerHTML = `<span>${missionTab === 'daily' ? '今天的溫柔練習' : '這週慢慢完成'}</span><strong>${complete} <small>/ ${missions.length}</small></strong>`;
  $('#mission-list').innerHTML = missions.map(mission => {
    const action = actions.find(item => item.id === mission.action)!;
    const done = mission.completedAt !== null;
    return `<div class="mission-row ${done ? 'is-complete' : ''}"><span class="mission-icon ${action.color}">${icon(done ? 'check' : action.icon)}</span><div class="mission-detail"><strong>${escapeHtml(mission.title)}</strong><small>${escapeHtml(mission.description)}</small><div class="mission-meter" role="progressbar" aria-label="${escapeHtml(mission.title)}進度" aria-valuemin="0" aria-valuemax="${mission.target}" aria-valuenow="${Math.min(mission.count, mission.target)}"><span style="width:${Math.min(100, mission.count / mission.target * 100)}%"></span></div></div><span class="mission-status">${done ? '已完成 ♡' : `${Math.min(mission.count, mission.target)} / ${mission.target}`}<small>+${mission.rewardXP} XP</small></span></div>`;
  }).join('');
  const { level, xp, bond, bondLevel, bondMemories } = pet.progress;
  const xpTarget = xpForNextLevel(level);
  const xpPercent = level >= 30 ? 100 : Math.min(100, xp / xpTarget * 100);
  const bondPercent = bondLevel >= 10 ? 100 : Math.min(100, bond % 100);
  $('#growth-progress').innerHTML = `<div class="level-line"><span class="level-chip">${icon('star')} <strong>Lv.${level}</strong></span><span class="streak-badge">${icon('fire')} 連續照顧 ${pet.streak.current} 天 <small>（最佳 ${pet.streak.best} 天）</small></span></div><div class="growth-progress-label"><strong>一起長大</strong><span>${level >= 30 ? '已達最高等級' : `${xp} / ${xpTarget} XP`}</span></div><div class="progress-track" role="progressbar" aria-label="成長經驗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(xpPercent)}"><span style="width:${xpPercent}%"></span></div><div class="growth-progress-label bond-label"><strong>親密度 · Lv.${bondLevel}</strong><span>${bondLevel >= 10 ? `滿滿的回憶 ${bondMemories}` : `${bond % 100} / 100`}</span></div><div class="progress-track bond-track" role="progressbar" aria-label="親密度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(bondPercent)}"><span style="width:${bondPercent}%"></span></div>`;
  const next = COSMETICS.filter(item => !pet.unlocks.unlocked.includes(item.id)).sort((a, b) => a.level - b.level)[0];
  $('#unlock-teaser').innerHTML = next ? `${icon('gift')}<span><small>下一個小驚喜</small><strong>Lv.${next.level} 解鎖 ${escapeHtml(next.name)}</strong></span>` : `${icon('sparkle')}<span><small>收藏完成</small><strong>所有小禮物都到家了！</strong></span>`;
  const journal = pet.journal.slice(-4).reverse();
  $('#journal-list').innerHTML = journal.length ? journal.map(entry => `<div class="journal-row"><span class="journal-icon">${icon(actions.find(item => item.id === entry.action)?.icon ?? 'heart')}</span><div><strong>${escapeHtml(entry.text)}</strong><small>${new Date(entry.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><span class="journal-heart">♡</span></div>`).join('') : `<div class="journal-empty">${icon('book')}<span>故事才剛開始，和牠互動後，這裡就會慢慢收藏你們的小日常。</span></div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-mission-tab]').forEach(button => {
    const selected = button.dataset.missionTab === missionTab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function renderMilestones() {
  const now = Date.now();
  const completed = ACHIEVEMENTS.filter(item => Object.hasOwn(pet.achievements, item.id)).sort((a, b) => pet.achievements[b.id] - pet.achievements[a.id]);
  const upcoming = ACHIEVEMENTS.filter(item => !Object.hasOwn(pet.achievements, item.id)).sort((a, b) => (Math.min(1, b.progress(pet, now) / b.target) - Math.min(1, a.progress(pet, now) / a.target)))[0];
  const missions = pet.missions.daily;
  const dailyComplete = missions.filter(item => item.completedAt !== null).length;
  const recent = completed[0];
  const signature = `${missionTab}|${dailyComplete}|${recent?.id ?? ''}|${upcoming?.id ?? ''}|${upcoming ? Math.floor(upcoming.progress(pet, now)) : ''}|${completed.length}`;
  if (signature === milestoneSignature) return;
  milestoneSignature = signature;
  $('#achievement-count').textContent = `${completed.length} / ${ACHIEVEMENTS.length}`;
  $('#milestone-grid').innerHTML = `
    <button class="milestone milestone-preview" data-preview="missions"><span class="medal">${icon('calendar')}</span><span class="milestone-copy"><strong>今天的小約定</strong><small>每一次陪伴都算數</small></span><span class="milestone-progress">${dailyComplete}<span> / ${missions.length}</span></span></button>
    <button class="milestone milestone-preview ${recent ? 'unlocked' : ''}" data-preview="achievements"><span class="medal">${icon('medal')}</span><span class="milestone-copy"><strong>${recent ? escapeHtml(recent.title) : '第一個小小成就'}</strong><small>${recent ? '最近收藏的回憶' : '照顧牠就能慢慢解鎖'}</small></span><span class="milestone-progress">${recent ? icon('check') : icon('heart')}</span></button>
    <button class="milestone milestone-preview" data-preview="achievements"><span class="medal">${icon('sparkle')}</span><span class="milestone-copy"><strong>${upcoming ? escapeHtml(upcoming.title) : '所有里程碑都完成了！'}</strong><small>${upcoming ? `下一個目標：${escapeHtml(upcoming.description)}` : '謝謝你這麼用心陪伴'}</small></span><span class="milestone-progress">${upcoming ? `${Math.min(upcoming.target, Math.floor(upcoming.progress(pet, now)))}<span> / ${upcoming.target}</span>` : icon('check')}</span></button>`;
}

function render() {
  document.documentElement.dataset.reducedMotion = String(pet.settings.reducedMotion);
  $('#pet-name').textContent = pet.name;
  $('#room-title').textContent = `${pet.name}的小客廳`;
  const elapsed = Math.max(0, Date.now() - pet.adoptedAt);
  const days = Math.floor(elapsed / 86400000);
  const hours = Math.floor(elapsed / 3600000);
  $('#together-text').textContent = adopted ? `在一起的第 ${days + 1} 天，請多多指教 ♡` : '我們的故事，即將開始';
  $('#stat-days').innerHTML = `${adopted ? days + 1 : 0}<span>天</span>`;
  $('#stat-days').title = `畜養總時間：${days} 天 ${hours % 24} 小時 ${Math.floor(elapsed / 60000) % 60} 分鐘`;
  $('#stat-feed').innerHTML = `${pet.counts.feed}<span>次</span>`;
  const minutes = Math.floor(pet.activeMs / 60000);
  $('#stat-time').innerHTML = minutes >= 60 ? `${(minutes / 60).toFixed(1)}<span>時</span>` : `${minutes}<span>分</span>`;
  for (const [key, value] of Object.entries(pet.needs)) {
    $(`#value-${key}`).textContent = `${Math.round(value)}%`;
    $(`#bar-${key}`).style.width = `${value}%`;
    $(`#meter-${key}`).setAttribute('aria-valuenow', String(Math.round(value)));
  }
  $('#wellbeing').textContent = sleeping ? '在做一個好夢' : Math.min(...Object.values(pet.needs)) < 30 ? '想要你陪陪我' : '心情很好呢';
  $('#activity-text').textContent = busy ? '享受我們的小日常' : sleeping ? '軟綿綿的夢鄉' : '自在放空中';
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
    const action = button.dataset.action;
    button.disabled = busy || !adopted || !writer || recoveryNeeded || !sceneReady || (sleeping && action !== 'sleep');
    button.classList.toggle('is-sleeping', sleeping && action === 'sleep');
    if (action === 'sleep') {
      button.querySelector('strong')!.textContent = sleeping ? '輕輕叫醒' : '睡個好覺';
      button.querySelector('.care-icon')!.innerHTML = icon(sleeping ? 'sun' : 'moon');
    }
    if (action === 'play') button.querySelector('strong')!.textContent = pet.unlocks.equipped.toy === 'toy-ball' ? '玩球球' : '玩玩具';
  });
  renderGrowth();
  renderMilestones();
  renderNotice();
}

function commit(next: PetSaveV2) {
  const newlyUnlocked = ACHIEVEMENTS.filter(item => next.achievements[item.id] && !pet.achievements[item.id]);
  const newCosmetics = COSMETICS.filter(item => next.unlocks.unlocked.includes(item.id) && !pet.unlocks.unlocked.includes(item.id));
  const leveledUp = next.progress.level > pet.progress.level;
  const completedMission = next.progress.dailyCompleted > pet.progress.dailyCompleted || next.progress.weeklyCompleted > pet.progress.weeklyCompleted;
  const cosmeticsChanged = JSON.stringify(next.unlocks.equipped) !== JSON.stringify(pet.unlocks.equipped);
  pet = next;
  if (cosmeticsChanged) scene?.setCosmetics(pet.unlocks.equipped);
  saveNow();
  render();
  if (newlyUnlocked.length || newCosmetics.length || leveledUp || completedMission) {
    celebrate();
    const message = newlyUnlocked.length ? `小小里程碑：${newlyUnlocked.map(item => item.title).join('、')}！` : newCosmetics.length ? `新禮物到家了：${newCosmetics.map(item => item.name).join('、')}！` : leveledUp ? `升到 Lv.${next.progress.level} 了，一起繼續長大！` : '小約定完成了，謝謝你今天的陪伴！';
    window.setTimeout(() => showToast(message), 500);
  }
}

async function performAction(action: CareAction) {
  if (busy || !adopted || !ensureWriter() || recoveryNeeded || !sceneReady || !scene) return;
  prepareSound();
  if (sleeping) {
    if (action !== 'sleep') return;
    sleeping = false;
    scene.wake();
    setCaption('伸個懶腰，又可以一起玩了！');
    render();
    return;
  }
  busy = true;
  render();
  const toyName = COSMETICS.find(item => item.id === pet.unlocks.equipped.toy)?.name ?? '玩具';
  const captions: Record<CareAction, string> = { feed: '聞到香香的飯飯了！', pet: '對，就是這裡…再摸一下嘛。', play: `${toyName}！我來啦！`, water: '咕嚕咕嚕，喝水也要乖乖的。', sleep: '晚安，陪我做個好夢吧。' };
  setCaption(captions[action], true);
  try {
    await scene.interact(action);
    if (!ensureWriter() || recoveryNeeded) return;
    sleeping = action === 'sleep';
    commit(applyAction(pet, action, Date.now()));
    const messages: Record<CareAction, string> = { feed: '吃飽飽了，謝謝你 ♡', pet: '摸摸收到！心裡暖暖的。', play: '又收藏了一個快樂的時刻。', water: '水分補充完成，繼續元氣滿滿！', sleep: '噓，小傢伙睡著了。精神會慢慢恢復。' };
    showToast(messages[action]);
    setCaption(sleeping ? '呼嚕…夢裡也有你。' : '今天最喜歡的，還是你！', sleeping);
  } catch {
    showToast('這個動作沒有完成，再試一次就好。', 'error');
  } finally {
    busy = false;
    render();
  }
}

function showWelcome() {
  showDialog(`<div class="welcome-art">${dogPortrait()}<span>${icon('heart')}</span></div><span class="eyebrow centered">HELLO, MY HUMAN</span><h2 id="dialog-title" class="welcome-title">把小小的牠，<br>放進你的日常。</h2><p class="dialog-description centered">不需要完美的照顧，只要有你的陪伴。<br>先為這位新朋友取個名字吧。</p><form id="adoption-form"><label class="field-label" for="adopt-name">牠的名字</label><input id="adopt-name" name="name" value="可可" autocomplete="off" maxlength="64" required aria-describedby="adoption-error"/><p class="field-error" id="adoption-error" role="alert"></p><button class="primary-button full" type="submit">開始我們的日常 ${icon('arrow')}</button></form><p class="privacy-note">${icon('lock')}紀錄只保存在這個瀏覽器，隨時可以匯出。</p>`, false);
  $('#adoption-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!ensureWriter()) { $('#adoption-error').textContent = '請先關閉另一個遊戲分頁，再重新整理。'; return; }
    try {
      pet = createPet($<HTMLInputElement>('#adopt-name').value, Date.now());
      pet.settings.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene?.setReducedMotion(pet.settings.reducedMotion);
      scene?.setCosmetics(pet.unlocks.equipped);
      adopted = true;
      saveNow();
      dialog.close();
      lastTick = performance.now();
      render();
      setCaption(`${pet.name}到家囉！以後請多多指教。`);
      showToast(`歡迎回家，${pet.name}！`);
    } catch (error) { $('#adoption-error').textContent = error instanceof Error ? error.message : '請輸入 1–16 個字的名字。'; }
  });
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSave() {
  try {
    if (recoveryNeeded && recoveryRaw !== null) {
      downloadText(recoveryRaw, '臘腸日和-待修復的原始存檔.json');
      showToast('原始紀錄已經備份，尚未更動內容。');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadText(serializePet(pet), `臘腸日和-${pet.name.replace(/[\\/:*?"<>|]/g, '_')}-${date}.json`);
    showToast('你們的小日常，已經打包好囉。');
  } catch (error) { showToast(`匯出未完成：${(error as Error).message}`, 'error'); }
}

function showSettings() {
  const totalDays = Math.floor(Math.max(0, Date.now() - pet.adoptedAt) / 86400000);
  const date = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(pet.adoptedAt);
  showDialog(`<span class="dialog-symbol sage">${icon('settings')}</span><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="dialog-title">我們的小設定</h2><p class="dialog-description">把小日子，調整成喜歡的樣子。</p><section class="settings-block"><h3>小夥伴的名字</h3><form id="rename-form" class="inline-form"><label class="sr-only" for="rename-input">寵物名字</label><input id="rename-input" value="${escapeHtml(pet.name)}" maxlength="64" required ${!writer || !adopted ? 'disabled' : ''}/><button class="secondary-button" type="submit" ${!writer || !adopted ? 'disabled' : ''}>儲存</button></form><p class="field-error" id="rename-error" role="alert"></p></section><section class="settings-block"><label class="toggle-row" for="reduced-motion"><span><strong>減少動態效果</strong><small>暫停閒逛與裝飾動畫，保留照顧互動。</small></span><input type="checkbox" class="switch" id="reduced-motion" ${pet.settings.reducedMotion ? 'checked' : ''} ${!writer || !adopted ? 'disabled' : ''}/></label></section><section class="settings-block"><h3>好好收藏我們的故事</h3><p>領養於 ${date}<br>畜養 ${totalDays} 天・實際陪伴 ${Math.floor(pet.activeMs / 60000)} 分鐘</p><div class="record-grid">${actions.map(item => `<div><span>${item.title}</span><strong>${pet.counts[item.id]} 次</strong></div>`).join('')}</div><div class="backup-actions"><button class="secondary-button" id="export-save">${icon('download')}匯出紀錄</button><button class="secondary-button" id="import-save" ${!writer || busy ? 'disabled' : ''}>${icon('upload')}匯入紀錄</button></div><p class="storage-explanation">紀錄只保存在目前的瀏覽器。清除網站資料會移除存檔；換裝置或搬到新網址前，記得先匯出 JSON 備份，再到新地方匯入。</p></section><div class="settings-footer">${icon('heart')}臘腸日和 · v2.0 <span>願每天，都有小小的好事。</span></div>`);
  dialog.querySelectorAll('.settings-block')[1].insertAdjacentHTML('afterend', `<section class="settings-block"><label class="toggle-row" for="sound-enabled"><span><strong>小小慶祝音效</strong><small>解鎖時播放輕柔音符，預設關閉。</small></span><input type="checkbox" class="switch" id="sound-enabled" ${pet.settings.soundEnabled ? 'checked' : ''} ${!writer || !adopted ? 'disabled' : ''}/></label></section>`);
  $('#sound-enabled').addEventListener('change', event => {
    if (!ensureWriter() || !adopted) return;
    const soundEnabled = (event.target as HTMLInputElement).checked;
    commit({ ...pet, settings: { ...pet.settings, soundEnabled }, revision: pet.revision + 1, savedAt: Math.max(pet.savedAt, pet.adoptedAt, Date.now()) });
    if (soundEnabled) prepareSound();
  });
  $('#rename-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!ensureWriter() || !adopted) return;
    try { commit(renamePet(pet, $<HTMLInputElement>('#rename-input').value, Date.now())); $('#rename-error').textContent = ''; showToast(`以後就叫我${pet.name}囉！`); }
    catch (error) { $('#rename-error').textContent = (error as Error).message; }
  });
  $('#reduced-motion').addEventListener('change', event => {
    if (!ensureWriter() || !adopted) return;
    const reducedMotion = (event.target as HTMLInputElement).checked;
    commit({ ...pet, settings: { ...pet.settings, reducedMotion }, revision: pet.revision + 1, savedAt: Math.max(pet.savedAt, pet.adoptedAt, Date.now()) });
    scene?.setReducedMotion(reducedMotion);
  });
  $('#export-save').addEventListener('click', exportSave);
  $('#import-save').addEventListener('click', () => $<HTMLInputElement>('#import-file').click());
}

function showAchievements() {
  const filters = [ ['all', '全部'], ['unlocked', '已解鎖'], ['care', '照顧'], ['bond', '陪伴'], ['time', '時間'], ['explore', '探索'], ['collection', '收藏'] ] as const;
  const rarityLabels = { common: '溫柔日常', rare: '珍貴回憶', special: '閃亮紀念' };
  showDialog(`<span class="dialog-symbol peach">${icon('trophy')}</span><span class="eyebrow">OUR LITTLE MILESTONES</span><h2 id="dialog-title">每一份陪伴，都有意義。</h2><p class="dialog-description">已收藏 ${Object.keys(pet.achievements).length} / ${ACHIEVEMENTS.length} 個小小里程碑。每一個，都有你們自己的故事。</p><div class="achievement-filters" aria-label="篩選成就">${filters.map(([key, label]) => `<button type="button" data-achievement-filter="${key}" aria-pressed="${key === 'all'}">${label}</button>`).join('')}</div><div class="achievement-list" id="achievement-list"></div>`);
  function draw(filter: string) {
    const list = ACHIEVEMENTS.filter(item => filter === 'all' || (filter === 'unlocked' ? Object.hasOwn(pet.achievements, item.id) : item.category === filter));
    $('#achievement-list').innerHTML = list.length ? list.map(item => {
      const unlockedAt = pet.achievements[item.id];
      const done = unlockedAt !== undefined;
      const progress = Math.max(0, Math.min(item.target, item.progress(pet, Date.now())));
      const percent = Math.min(100, progress / item.target * 100);
      return `<div class="achievement-row ${done ? 'complete' : ''}"><span class="medal">${icon(done ? 'trophy' : 'paw')}</span><div><strong>${escapeHtml(item.title)}</strong> <span class="reward-badge">${rarityLabels[item.rarity]}</span><p>${escapeHtml(item.description)}</p><div class="achievement-meter" role="progressbar" aria-label="${escapeHtml(item.title)}進度" aria-valuemin="0" aria-valuemax="${item.target}" aria-valuenow="${Math.floor(progress)}"><span style="width:${percent}%"></span></div><small>${done ? `收藏於 ${new Date(unlockedAt).toLocaleDateString('zh-TW')}` : `${Math.floor(progress)} / ${item.target}`}</small></div>${done ? icon('check') : icon('lock')}</div>`;
    }).join('') : '<p class="journal-empty">還沒有解鎖成就，一起慢慢收集吧。</p>';
    dialog.querySelectorAll<HTMLButtonElement>('[data-achievement-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.achievementFilter === filter)));
  }
  dialog.querySelectorAll<HTMLButtonElement>('[data-achievement-filter]').forEach(button => button.addEventListener('click', () => draw(button.dataset.achievementFilter!)));
  draw('all');
}

const cosmeticCategories = [
  ['theme', '房間', 'home'], ['rug', '地毯', 'palette'], ['collar', '項圈', 'ribbon'], ['tag', '吊牌', 'tag'],
  ['toy', '玩具', 'ball'], ['art', '掛畫', 'brush'], ['pot', '花盆', 'leaf'], ['bed', '狗窩', 'moon'],
] as const;

const corners: { id: ExploreCorner; name: string; icon: string; message: string }[] = [
  { id: 'window', name: '暖暖的窗邊', icon: 'sun', message: '陽光落在窗邊，好想和你一起曬太陽。' },
  { id: 'plant', name: '綠綠的盆栽', icon: 'leaf', message: '盆栽也在慢慢長大，和我們一樣呢。' },
  { id: 'bed', name: '軟軟的狗窩', icon: 'moon', message: '這裡有一個軟綿綿的好夢，留給你和我。' },
];

function visitCorner(corner: ExploreCorner) {
  if (!adopted || !ensureWriter() || recoveryNeeded || busy) return;
  const item = corners.find(entry => entry.id === corner);
  if (!item) return;
  const firstVisit = !pet.progress.exploredCorners.includes(corner);
  try {
    if (firstVisit) commit(exploreCorner(pet, corner, Date.now()));
    setCaption(item.message);
    if (!firstVisit) showToast(item.message);
  } catch (error) { showToast((error as Error).message || '這個角落暫時無法探索。', 'error'); }
}

function showExplore(selected?: ExploreCorner) {
  const story = corners.find(item => item.id === selected);
  showDialog(`<span class="dialog-symbol sage">${icon('sparkle')}</span><span class="eyebrow">A LITTLE PLACE TO EXPLORE</span><h2 id="dialog-title">小窩裡的可愛角落</h2><p class="dialog-description">點選客廳裡的窗戶、盆栽或狗窩，也可以從這裡慢慢探索。每個角落都藏著一點小故事。</p><div class="wardrobe-grid">${corners.map(item => `<button type="button" class="wardrobe-item ${pet.progress.exploredCorners.includes(item.id) ? 'is-equipped' : ''}" data-corner="${item.id}" ${!adopted || !writer || busy ? 'disabled' : ''}>${icon(item.icon)}<strong>${item.name}</strong><small>${pet.progress.exploredCorners.includes(item.id) ? '已經探索過 ♡' : '發現小故事'}</small></button>`).join('')}</div><p class="explore-story" role="status">${story ? `${icon(story.icon)} ${escapeHtml(story.message)}` : '選一個角落，看看藏著什麼小故事。'}</p>`);
  dialog.querySelectorAll<HTMLButtonElement>('[data-corner]').forEach(button => button.addEventListener('click', () => {
    const corner = button.dataset.corner as ExploreCorner;
    visitCorner(corner);
    showExplore(corner);
    dialog.querySelector<HTMLButtonElement>(`[data-corner="${corner}"]`)?.focus({ preventScroll: true });
  }));
}

function showWardrobe(category: string = 'theme') {
  const selectedCategory = cosmeticCategories.find(item => item[0] === category) ?? cosmeticCategories[0];
  const items = COSMETICS.filter(item => item.category === selectedCategory[0]);
  showDialog(`<span class="dialog-symbol sage">${icon('gift')}</span><span class="eyebrow">OUR LITTLE COLLECTION</span><h2 id="dialog-title">把小窩佈置成喜歡的樣子。</h2><p class="dialog-description">照顧與陪伴能解鎖小禮物。選一件喜歡的，狗狗和客廳會立刻換上新模樣。</p><div class="growth-tabs" aria-label="收藏分類">${cosmeticCategories.map(([key, label, symbol]) => `<button class="growth-tab" type="button" data-wardrobe-tab="${key}" aria-pressed="${key === selectedCategory[0]}">${icon(symbol)} ${label}</button>`).join('')}</div><div class="wardrobe-grid">${items.map(item => {
    const unlocked = pet.unlocks.unlocked.includes(item.id);
    const equipped = pet.unlocks.equipped[selectedCategory[0]] === item.id;
    return `<button class="wardrobe-item ${unlocked ? '' : 'is-locked'} ${equipped ? 'is-equipped' : ''}" type="button" data-cosmetic="${escapeHtml(item.id)}" aria-pressed="${equipped}" title="${escapeHtml(item.description)}" ${!unlocked || !writer || !adopted ? 'disabled' : ''}>${icon(unlocked ? selectedCategory[2] : 'lock')}<strong>${escapeHtml(item.name)}</strong><small>${equipped ? '正在使用' : unlocked ? '選擇這款' : `Lv.${item.level} 解鎖`}</small></button>`;
  }).join('')}</div><p class="storage-explanation wardrobe-note">你的收藏會自動保存在這個瀏覽器，也會包含在 JSON 備份中。</p>`);
  dialog.querySelectorAll<HTMLButtonElement>('[data-wardrobe-tab]').forEach(button => button.addEventListener('click', () => {
    const nextTab = button.dataset.wardrobeTab!;
    showWardrobe(nextTab);
    dialog.querySelector<HTMLButtonElement>(`[data-wardrobe-tab="${nextTab}"]`)?.focus({ preventScroll: true });
  }));
  dialog.querySelectorAll<HTMLButtonElement>('[data-cosmetic]').forEach(button => button.addEventListener('click', () => {
    if (!ensureWriter() || !adopted) return;
    try {
      const id = button.dataset.cosmetic!;
      commit(equipCosmetic(pet, id, Date.now()));
      showWardrobe(selectedCategory[0]);
      dialog.querySelector<HTMLButtonElement>(`[data-cosmetic="${id}"]`)?.focus({ preventScroll: true });
      showToast(`已換上${COSMETICS.find(item => item.id === id)?.name ?? '新的小禮物'}！`);
    } catch (error) { showToast((error as Error).message || '目前無法切換裝飾。', 'error'); }
  }));
}

function showRecovery() {
  showDialog(`<span class="dialog-symbol peach">${icon('shield')}</span><h2 id="dialog-title">先把回憶好好留住</h2><p class="dialog-description">原本的存檔暫時無法讀取：${escapeHtml(recoveryError ?? '')}。目前沒有覆蓋任何資料，可以先下載原始紀錄，或匯入之前的備份。</p><div class="stacked-buttons"><button class="primary-button" id="recover-download">${icon('download')}下載原始存檔</button><button class="secondary-button" id="recover-import">${icon('upload')}匯入備份</button><button class="text-button" id="recover-new">重新開始一段日常</button></div>`, false);
  $('#recover-download').addEventListener('click', () => downloadText(recoveryRaw ?? '', '臘腸日和-待修復的原始存檔.json'));
  $('#recover-import').addEventListener('click', () => $<HTMLInputElement>('#import-file').click());
  $('#recover-new').addEventListener('click', () => {
    showDialog(`<h2 id="dialog-title">開始新的故事？</h2><p class="dialog-description">建立新寵物會取代原存檔。若還沒下載原始紀錄，請先返回備份。</p><div class="backup-actions"><button class="secondary-button" id="recover-back">返回備份</button><button class="primary-button" id="recover-confirm">開始新的故事</button></div>`, false);
    $('#recover-back').addEventListener('click', showRecovery);
    $('#recover-confirm').addEventListener('click', () => { if (!ensureWriter()) return; recoveryNeeded = false; showWelcome(); });
  });
}

$<HTMLInputElement>('#import-file').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !ensureWriter() || busy) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('備份檔案太大，請選擇 1 MB 以內的 JSON 檔。');
    const imported = parseImport(await file.text());
    showDialog(`<span class="dialog-symbol sage">${icon('upload')}</span><h2 id="dialog-title">接${escapeHtml(imported.name)}回家？</h2><p class="dialog-description">這份紀錄包含 ${imported.counts.feed} 次餵食、${Math.floor(imported.activeMs / 60000)} 分鐘陪伴和 ${Object.keys(imported.achievements).length} 個成就。<br><br>確認後會取代目前紀錄，建議先匯出現在的存檔。</p><div class="stacked-buttons"><button class="primary-button" id="confirm-import">確認匯入</button><button class="secondary-button" id="export-before-import">先匯出目前紀錄</button><button class="text-button" id="cancel-import">取消，保留現在的日常</button></div>`, false);
    $('#export-before-import').addEventListener('click', exportSave);
    $('#cancel-import').addEventListener('click', () => { dialog.close(); if (recoveryNeeded) showRecovery(); else if (!adopted) showWelcome(); });
    $('#confirm-import').addEventListener('click', () => {
      if (!ensureWriter()) return;
      scene?.wake();
      sleeping = false;
      recoveryNeeded = false;
      adopted = true;
      pet = { ...imported, revision: Math.max(imported.revision, pet.revision) + 1, savedAt: Math.max(imported.savedAt, imported.adoptedAt, Date.now()) };
      pet = advancePet(pet, 0, Date.now());
      scene?.setReducedMotion(pet.settings.reducedMotion);
      scene?.setCosmetics(pet.unlocks.equipped);
      const persisted = saveNow();
      render();
      dialog.close();
      showToast(persisted ? `歡迎回家，${pet.name}。回憶都在這裡！` : '備份已載入，但瀏覽器尚未成功保存。請保留原備份檔。', persisted ? 'success' : 'error');
      setCaption('原來你一直都記得我。');
    });
  } catch (error) { showToast((error as Error).message || '這份備份無法讀取，原存檔保持不變。', 'error'); }
});

document.querySelectorAll('.settings-trigger').forEach(button => button.addEventListener('click', showSettings));
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => void performAction(button.dataset.action as CareAction)));
$('#reset-camera').addEventListener('click', () => scene?.resetCamera());
$('#explore-room').addEventListener('click', () => showExplore());
$('#all-achievements').addEventListener('click', showAchievements);
$('#milestone-grid').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-preview]');
  if (!button) return;
  if (button.dataset.preview === 'missions') { missionTab = 'daily'; renderGrowth(); $('#growth-title').scrollIntoView({ behavior: pet.settings.reducedMotion ? 'instant' : 'smooth', block: 'start' }); }
  else showAchievements();
});
document.querySelectorAll<HTMLButtonElement>('[data-mission-tab]').forEach(button => button.addEventListener('click', () => {
  missionTab = button.dataset.missionTab === 'weekly' ? 'weekly' : 'daily';
  renderGrowth();
}));
$('#open-wardrobe').addEventListener('click', () => showWardrobe());
$('#open-wardrobe-card').addEventListener('click', () => showWardrobe());

function syncAfterAcquire() {
  // The stored save may have changed between initial page load and acquiring the lock.
  const latest = loadSave();
  if (latest.pet) {
    pet = latest.pet;
    adopted = true;
    recoveryNeeded = false;
    storageError = latest.error;
    scene?.setCosmetics(pet.unlocks.equipped);
    scene?.setReducedMotion(pet.settings.reducedMotion);
    if (dialog.open && dialog.querySelector('#adoption-form')) dialog.close();
  } else if (latest.error && latest.raw !== null) {
    storageError = latest.error;
    recoveryRaw = latest.raw;
    recoveryError = latest.error;
    recoveryNeeded = true;
    if (!dialog.open || dialog.querySelector('#adoption-form')) showRecovery();
  }
}

async function acquireFallbackWriter() {
  const lease = new WriterLease();
  const result = await lease.acquire();
  if (result === 'acquired') {
    fallbackLease = lease;
    writer = true;
    syncAfterAcquire();
    stopLeaseHeartbeat = lease.startHeartbeat(() => { loseWriter(); });
  } else if (result === 'unavailable') {
    // If the lease cannot be stored, never write the shared pet key. Keep the
    // game usable in memory and let the player export a JSON backup instead.
    writer = true;
    volatileMode = true;
    storageError = storageError ?? '瀏覽器未開放本機儲存，紀錄暫時只能匯出備份';
  } else writer = false;
  render();
}

async function acquireWriter() {
  if (navigator.locks) {
    void navigator.locks.request(STORAGE_KEY, { ifAvailable: true }, async lock => {
      writer = Boolean(lock);
      if (writer) syncAfterAcquire();
      render();
      if (writer) await new Promise<void>(resolve => { lockRelease = resolve; });
    }).catch(() => { void acquireFallbackWriter(); });
  } else {
    await acquireFallbackWriter();
  }
}

window.addEventListener('storage', event => {
  if (event.key === WRITER_LEASE_KEY && fallbackLease) { ensureWriter(); return; }
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const remote = loadSave().pet;
    if (!remote) return;
    if (!writer) { pet = remote; adopted = true; scene?.setCosmetics(pet.unlocks.equipped); scene?.setReducedMotion(pet.settings.reducedMotion); render(); }
    else {
      // A different tab wrote the save. Stop even if this tab's clock or
      // unsaved timestamp is newer; never let it overwrite that other write.
      loseWriter();
      pet = remote;
      scene?.setCosmetics(pet.unlocks.equipped);
      scene?.setReducedMotion(pet.settings.reducedMotion);
      render();
      showToast('另一個分頁更新了紀錄。這裡已暫停照顧，請重新整理後繼續。', 'error');
    }
  } catch { /* Keep the current in-memory save if another tab writes malformed data. */ }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
  lastTick = performance.now();
  if (!document.hidden && adopted && ensureWriter()) { pet = advancePet(pet, 0, Date.now()); render(); }
});
window.addEventListener('pagehide', () => { saveNow(); stopLeaseHeartbeat?.(); fallbackLease?.release(); lockRelease?.(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });

window.setInterval(() => {
  const now = performance.now();
  const delta = Math.max(0, Math.min(2000, now - lastTick));
  lastTick = now;
  if (!adopted || !ensureWriter() || document.hidden || recoveryNeeded) return;
  const next = advancePet(pet, delta, Date.now(), sleeping);
  const newAchievements = Object.keys(next.achievements).length > Object.keys(pet.achievements).length;
  if (newAchievements) commit(next);
  else pet = next;
  if (now - lastSave > 10000) saveNow();
  render();
}, 1000);

render();
void acquireWriter();
$('#scene').addEventListener('pet-scene-error', event => {
  sceneReady = false;
  busy = false;
  sleeping = false;
  const message = String((event as CustomEvent<string>).detail ?? '3D 場景暫時無法使用，請重新整理。');
  let fallback = document.querySelector<HTMLElement>('#scene-loading');
  if (!fallback) { fallback = document.createElement('div'); fallback.id = 'scene-loading'; $('#scene').append(fallback); }
  fallback.className = 'scene-loading scene-error';
  fallback.innerHTML = `${dogPortrait()}<h3>小窩需要稍微休息一下</h3><p>${escapeHtml(message)}<br>你仍可在設定查看與匯出紀錄。</p>`;
  render();
});
try {
  scene = new PetScene($('#scene'), { reducedMotion: pet.settings.reducedMotion, onPetClick: () => void performAction('pet'), onExplore: visitCorner });
  scene.setCosmetics(pet.unlocks.equipped);
  sceneReady = true;
  $('#scene-loading').remove();
  render();
} catch (error) {
  console.error('3D scene could not start:', error);
  $('#scene-loading').innerHTML = `${dogPortrait()}<h3>小窩需要支援 WebGL 2 的瀏覽器</h3><p>請開啟瀏覽器的硬體加速，或使用較新的瀏覽器。<br>你的紀錄仍可在設定查看與匯出。</p>`;
  $('#scene-loading').classList.add('scene-error');
}
if (recoveryNeeded) showRecovery();
else if (!adopted) showWelcome();
else { pet = advancePet(pet, 0, Date.now()); render(); }

if (import.meta.hot) import.meta.hot.dispose(() => { scene?.dispose(); stopLeaseHeartbeat?.(); fallbackLease?.release(); lockRelease?.(); });
