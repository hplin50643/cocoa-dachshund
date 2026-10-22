import './style.css';
import { ACHIEVEMENTS, advancePet, applyAction, createPet, renamePet, type CareAction, type PetSaveV1 } from './core';
import { loadSave, parseImport, savePet, serializePet, STORAGE_KEY } from './persistence';
import { PetScene } from './scene';
import { dogPortrait, icon } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const initial = loadSave();
let pet: PetSaveV1 = initial.pet ?? createPet('可可');
let adopted = Boolean(initial.pet);
let storageError = initial.error;
let recoveryNeeded = Boolean(initial.error && initial.raw !== null);
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
let milestoneSignature = '';

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
        <div class="room-heading"><span class="room-label">${icon('leaf')}<span id="room-title">可可的小客廳</span></span><div class="room-tools"><button class="glass-button" id="reset-camera" aria-label="鏡頭回正" title="鏡頭回正">${icon('reset')}</button></div></div>
        <div id="scene" aria-label="3D 棕色臘腸狗與奶油色客廳"><div class="scene-loading" id="scene-loading"><span class="loading-paw">${icon('paw')}</span><p>正在把小窩準備好…</p></div></div>
        <div class="room-caption" id="room-caption">今天也想和你一起玩！<span>♡</span></div>
        <div class="room-footer"><span class="live-state"><span></span><span id="activity-text">自在放空中</span></span><span class="camera-hint">拖曳轉個角度 · 滾動拉近看看</span></div>
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
    <section class="memories" aria-labelledby="memories-title"><div class="section-heading"><div><span class="eyebrow">LITTLE MOMENTS, BIG LOVE</span><h2 id="memories-title">我們的小小里程碑<span>每一份陪伴，都值得紀念。</span></h2></div><button class="text-button" id="all-achievements">全部成就 <span id="achievement-count">0 / 9</span>${icon('arrow')}</button></div><div class="milestone-grid" id="milestone-grid"></div></section>
    <footer class="site-footer"><span>${icon('paw')}不用很厲害，也能成為牠的全世界。</span><span>${icon('lock')}本機保存，安心陪伴 <span class="footer-dot">·</span> 臘腸日和 v1.0</span></footer>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
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
  if (!adopted || !writer || recoveryNeeded) return false;
  const result = savePet(pet);
  storageError = result.error;
  lastSave = performance.now();
  renderNotice();
  return result.ok;
}

function renderNotice() {
  const notice = $('#notice');
  const message = !writer ? '這份日常正在另一個分頁開啟。請關閉另一個分頁，再重新整理這裡繼續陪伴。' : recoveryNeeded ? '原本的存檔需要修復，尚未覆蓋任何資料。請先匯出備份或匯入有效存檔。' : storageError ? `目前無法自動保存：${storageError}。你仍可在設定匯出目前紀錄。` : '';
  notice.classList.toggle('hidden', !message);
  notice.textContent = message;
  $('#save-indicator').innerHTML = `${icon(storageError || !writer || recoveryNeeded ? 'shield' : 'check')}${storageError ? '暫未保存，請匯出備份' : !writer ? '另一個分頁正在照顧中' : '每個小日常，都會好好記住'}`;
}

function render() {
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
  });
  const unlocked = Object.keys(pet.achievements).length;
  $('#achievement-count').textContent = `${unlocked} / ${ACHIEVEMENTS.length}`;
  const previewIds = ['feed-first', 'pet-10', 'adopt-7d'];
  const nextMilestoneSignature = previewIds.map(id => `${id}:${Boolean(pet.achievements[id])}:${Math.floor(ACHIEVEMENTS.find(item => item.id === id)!.progress(pet, Date.now()))}`).join('|');
  if (nextMilestoneSignature !== milestoneSignature) $('#milestone-grid').innerHTML = previewIds.map(id => {
    const achievement = ACHIEVEMENTS.find(item => item.id === id)!;
    const done = Boolean(pet.achievements[id]);
    const progress = Math.min(achievement.target, achievement.progress(pet, Date.now()));
    return `<button class="milestone ${done ? 'unlocked' : ''}" data-achievement="${id}"><span class="medal">${icon(id === 'feed-first' ? 'bowl' : id === 'pet-10' ? 'heart' : 'calendar')}</span><span class="milestone-copy"><strong>${escapeHtml(achievement.title)}</strong><small>${escapeHtml(achievement.description)}</small></span><span class="milestone-progress">${done ? icon('check') : `${Math.floor(progress)}<span> / ${achievement.target}</span>`}</span></button>`;
  }).join('');
  milestoneSignature = nextMilestoneSignature;
  renderNotice();
}

function commit(next: PetSaveV1) {
  const newlyUnlocked = ACHIEVEMENTS.filter(item => next.achievements[item.id] && !pet.achievements[item.id]);
  pet = next;
  saveNow();
  render();
  if (newlyUnlocked.length) window.setTimeout(() => showToast(`小小里程碑：${newlyUnlocked.map(item => item.title).join('、')}！`), 500);
}

async function performAction(action: CareAction) {
  if (busy || !adopted || !writer || recoveryNeeded || !sceneReady || !scene) return;
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
  const captions: Record<CareAction, string> = { feed: '聞到香香的飯飯了！', pet: '對，就是這裡…再摸一下嘛。', play: '球球！我來啦！', water: '咕嚕咕嚕，喝水也要乖乖的。', sleep: '晚安，陪我做個好夢吧。' };
  setCaption(captions[action], true);
  try {
    await scene.interact(action);
    if (!writer || recoveryNeeded) return;
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
    if (!writer) { $('#adoption-error').textContent = '請先關閉另一個遊戲分頁，再重新整理。'; return; }
    try {
      pet = createPet($<HTMLInputElement>('#adopt-name').value, Date.now());
      pet.settings.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene?.setReducedMotion(pet.settings.reducedMotion);
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
    if (recoveryNeeded && initial.raw !== null) {
      downloadText(initial.raw, '臘腸日和-待修復的原始存檔.json');
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
  showDialog(`<span class="dialog-symbol sage">${icon('settings')}</span><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="dialog-title">我們的小設定</h2><p class="dialog-description">把小日子，調整成喜歡的樣子。</p><section class="settings-block"><h3>小夥伴的名字</h3><form id="rename-form" class="inline-form"><label class="sr-only" for="rename-input">寵物名字</label><input id="rename-input" value="${escapeHtml(pet.name)}" maxlength="64" required ${!writer || !adopted ? 'disabled' : ''}/><button class="secondary-button" type="submit" ${!writer || !adopted ? 'disabled' : ''}>儲存</button></form><p class="field-error" id="rename-error" role="alert"></p></section><section class="settings-block"><label class="toggle-row" for="reduced-motion"><span><strong>減少動態效果</strong><small>暫停閒逛與裝飾動畫，保留照顧互動。</small></span><input type="checkbox" class="switch" id="reduced-motion" ${pet.settings.reducedMotion ? 'checked' : ''} ${!writer || !adopted ? 'disabled' : ''}/></label></section><section class="settings-block"><h3>好好收藏我們的故事</h3><p>領養於 ${date}<br>畜養 ${totalDays} 天・實際陪伴 ${Math.floor(pet.activeMs / 60000)} 分鐘</p><div class="record-grid">${actions.map(item => `<div><span>${item.title}</span><strong>${pet.counts[item.id]} 次</strong></div>`).join('')}</div><div class="backup-actions"><button class="secondary-button" id="export-save">${icon('download')}匯出紀錄</button><button class="secondary-button" id="import-save" ${!writer || busy ? 'disabled' : ''}>${icon('upload')}匯入紀錄</button></div><p class="storage-explanation">紀錄只保存在目前的瀏覽器。清除網站資料會移除存檔；換裝置或搬到新網址前，記得先匯出 JSON 備份，再到新地方匯入。</p></section><div class="settings-footer">${icon('heart')}臘腸日和 · v1.0 <span>願每天，都有小小的好事。</span></div>`);
  $('#rename-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!writer || !adopted) return;
    try { commit(renamePet(pet, $<HTMLInputElement>('#rename-input').value, Date.now())); $('#rename-error').textContent = ''; showToast(`以後就叫我${pet.name}囉！`); }
    catch (error) { $('#rename-error').textContent = (error as Error).message; }
  });
  $('#reduced-motion').addEventListener('change', event => {
    if (!writer || !adopted) return;
    const reducedMotion = (event.target as HTMLInputElement).checked;
    commit({ ...pet, settings: { reducedMotion }, revision: pet.revision + 1, savedAt: Math.max(pet.savedAt, pet.adoptedAt, Date.now()) });
    scene?.setReducedMotion(reducedMotion);
  });
  $('#export-save').addEventListener('click', exportSave);
  $('#import-save').addEventListener('click', () => $<HTMLInputElement>('#import-file').click());
}

function showAchievements() {
  showDialog(`<span class="dialog-symbol peach">${icon('trophy')}</span><span class="eyebrow">OUR LITTLE MILESTONES</span><h2 id="dialog-title">每一份陪伴，都有意義。</h2><p class="dialog-description">已收藏 ${Object.keys(pet.achievements).length} / ${ACHIEVEMENTS.length} 個小小里程碑。</p><div class="achievement-list">${ACHIEVEMENTS.map(item => {
    const unlockedAt = pet.achievements[item.id];
    const progress = Math.min(item.target, item.progress(pet, Date.now()));
    return `<div class="achievement-row ${unlockedAt ? 'complete' : ''}"><span class="medal">${icon(unlockedAt ? 'trophy' : 'paw')}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p><div class="achievement-meter"><span style="width:${Math.min(100, progress / item.target * 100)}%"></span></div><small>${unlockedAt ? `收藏於 ${new Date(unlockedAt).toLocaleDateString('zh-TW')}` : `${Math.floor(progress)} / ${item.target}`}</small></div>${unlockedAt ? icon('check') : icon('lock')}</div>`;
  }).join('')}</div>`);
}

function showRecovery() {
  showDialog(`<span class="dialog-symbol peach">${icon('shield')}</span><h2 id="dialog-title">先把回憶好好留住</h2><p class="dialog-description">原本的存檔暫時無法讀取：${escapeHtml(initial.error ?? '')}。目前沒有覆蓋任何資料，可以先下載原始紀錄，或匯入之前的備份。</p><div class="stacked-buttons"><button class="primary-button" id="recover-download">${icon('download')}下載原始存檔</button><button class="secondary-button" id="recover-import">${icon('upload')}匯入備份</button><button class="text-button" id="recover-new">重新開始一段日常</button></div>`, false);
  $('#recover-download').addEventListener('click', () => downloadText(initial.raw ?? '', '臘腸日和-待修復的原始存檔.json'));
  $('#recover-import').addEventListener('click', () => $<HTMLInputElement>('#import-file').click());
  $('#recover-new').addEventListener('click', () => {
    showDialog(`<h2 id="dialog-title">開始新的故事？</h2><p class="dialog-description">建立新寵物會取代原存檔。若還沒下載原始紀錄，請先返回備份。</p><div class="backup-actions"><button class="secondary-button" id="recover-back">返回備份</button><button class="primary-button" id="recover-confirm">開始新的故事</button></div>`, false);
    $('#recover-back').addEventListener('click', showRecovery);
    $('#recover-confirm').addEventListener('click', () => { if (!writer) return; recoveryNeeded = false; showWelcome(); });
  });
}

$<HTMLInputElement>('#import-file').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !writer || busy) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('備份檔案太大，請選擇 1 MB 以內的 JSON 檔。');
    const imported = parseImport(await file.text());
    showDialog(`<span class="dialog-symbol sage">${icon('upload')}</span><h2 id="dialog-title">接${escapeHtml(imported.name)}回家？</h2><p class="dialog-description">這份紀錄包含 ${imported.counts.feed} 次餵食、${Math.floor(imported.activeMs / 60000)} 分鐘陪伴和 ${Object.keys(imported.achievements).length} 個成就。<br><br>確認後會取代目前紀錄，建議先匯出現在的存檔。</p><div class="stacked-buttons"><button class="primary-button" id="confirm-import">確認匯入</button><button class="secondary-button" id="export-before-import">先匯出目前紀錄</button><button class="text-button" id="cancel-import">取消，保留現在的日常</button></div>`, false);
    $('#export-before-import').addEventListener('click', exportSave);
    $('#cancel-import').addEventListener('click', () => { dialog.close(); if (recoveryNeeded) showRecovery(); else if (!adopted) showWelcome(); });
    $('#confirm-import').addEventListener('click', () => {
      if (!writer) return;
      scene?.wake();
      sleeping = false;
      recoveryNeeded = false;
      adopted = true;
      pet = { ...imported, revision: Math.max(imported.revision, pet.revision) + 1, savedAt: Math.max(imported.savedAt, imported.adoptedAt, Date.now()) };
      pet = advancePet(pet, 0, Date.now());
      scene?.setReducedMotion(pet.settings.reducedMotion);
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
$('#all-achievements').addEventListener('click', showAchievements);
$('#milestone-grid').addEventListener('click', showAchievements);

async function acquireWriter() {
  if (navigator.locks) {
    void navigator.locks.request(STORAGE_KEY, { ifAvailable: true }, async lock => {
      writer = Boolean(lock);
      render();
      if (writer) await new Promise<void>(resolve => { lockRelease = resolve; });
    }).catch(() => { writer = true; render(); });
  } else {
    writer = true;
    render();
  }
}

window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const remote = loadSave().pet;
    if (!remote) return;
    if (!writer) { pet = remote; adopted = true; render(); }
    else if (remote.savedAt >= pet.savedAt && (remote.revision !== pet.revision || remote.id !== pet.id)) {
      writer = false;
      lockRelease?.();
      pet = remote;
      render();
      showToast('另一個分頁更新了紀錄。這裡已暫停照顧，請重新整理後繼續。', 'error');
    }
  } catch { /* Keep the current in-memory save if another tab writes malformed data. */ }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
  lastTick = performance.now();
  if (!document.hidden && adopted && writer) { pet = advancePet(pet, 0, Date.now()); render(); }
});
window.addEventListener('pagehide', () => { saveNow(); lockRelease?.(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });

window.setInterval(() => {
  const now = performance.now();
  const delta = Math.max(0, Math.min(2000, now - lastTick));
  lastTick = now;
  if (!adopted || !writer || document.hidden || recoveryNeeded) return;
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
  scene = new PetScene($('#scene'), { reducedMotion: pet.settings.reducedMotion, onPetClick: () => void performAction('pet') });
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

if (import.meta.hot) import.meta.hot.dispose(() => { scene?.dispose(); lockRelease?.(); });
