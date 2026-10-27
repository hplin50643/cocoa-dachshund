export type CareAction = 'feed' | 'pet' | 'play' | 'water' | 'sleep';
export type CosmeticCategory = 'theme' | 'rug' | 'collar' | 'tag' | 'toy' | 'art' | 'pot' | 'bed';
export type CosmeticSelection = Record<CosmeticCategory, string>;
export type ExploreCorner = 'window' | 'plant' | 'bed';

/** Original published v1 backup; retained to migrate the existing local storage key. */
export interface PetSaveV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  adoptedAt: number;
  savedAt: number;
  revision: number;
  activeMs: number;
  needs: { satiety: number; mood: number; hydration: number; energy: number };
  counts: Record<CareAction, number>;
  achievements: Record<string, number>;
  settings: { reducedMotion: boolean };
}

export interface MissionState {
  id: string;
  title: string;
  description: string;
  action: CareAction;
  target: number;
  count: number;
  completedAt: number | null;
  rewardXP: number;
}
export interface MissionHistory { period: 'daily' | 'weekly'; key: string; completedIds: string[] }
export interface JournalEntry { id: string; at: number; action: CareAction; text: string }
export interface PetSaveV2 extends Omit<PetSaveV1, 'schemaVersion' | 'settings'> {
  schemaVersion: 2;
  settings: { reducedMotion: boolean; soundEnabled: boolean };
  progress: {
    xp: number;
    level: number;
    bond: number;
    bondLevel: number;
    bondMemories: number;
    dailyActionCounts: Record<CareAction, number>;
    dailyCompleted: number;
    weeklyCompleted: number;
    daysCared: number;
    cosmeticChanges: number;
    exploredCorners: ExploreCorner[];
  };
  streak: { current: number; best: number; lastActiveDay: string | null; graceUsed: boolean };
  missions: { dailyKey: string; weeklyKey: string; daily: MissionState[]; weekly: MissionState[]; history: MissionHistory[] };
  unlocks: { unlocked: string[]; equipped: CosmeticSelection };
  journal: JournalEntry[];
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const FUTURE_TOLERANCE_MS = 5 * MINUTE;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_ACTIVE_MS = 100 * 365.25 * DAY;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const ACTIONS: readonly CareAction[] = ['feed', 'pet', 'play', 'water', 'sleep'];
const NEED_KEYS = ['satiety', 'mood', 'hydration', 'energy'] as const;
const CATEGORIES: readonly CosmeticCategory[] = ['theme', 'rug', 'collar', 'tag', 'toy', 'art', 'pot', 'bed'];
const CORNERS: readonly ExploreCorner[] = ['window', 'plant', 'bed'];
const BLANK_COUNTS = (): Record<CareAction, number> => ({ feed: 0, pet: 0, play: 0, water: 0, sleep: 0 });

export interface Cosmetic { id: string; category: CosmeticCategory; name: string; description: string; level: number }
export const COSMETICS: readonly Cosmetic[] = [
  {id:'theme-cream', category:'theme', name:'奶油小屋', description:'暖暖的奶油色客廳', level:1},
  {id:'theme-sage', category:'theme', name:'森林微風', description:'清新的鼠尾草綠牆面', level:8},
  {id:'theme-peach', category:'theme', name:'蜜桃暖陽', description:'溫柔蜜桃色牆面', level:16},
  {id:'rug-sage', category:'rug', name:'草地軟毯', description:'柔和的淺綠地毯', level:1},
  {id:'rug-cream', category:'rug', name:'奶泡軟毯', description:'像牛奶泡泡一樣柔軟', level:2},
  {id:'rug-rose', category:'rug', name:'玫瑰軟毯', description:'帶一點點粉的地毯', level:9},
  {id:'collar-mint', category:'collar', name:'薄荷項圈', description:'清新綠色的日常項圈', level:1},
  {id:'collar-cream', category:'collar', name:'奶油項圈', description:'奶油色的溫柔陪伴', level:3},
  {id:'collar-coral', category:'collar', name:'珊瑚項圈', description:'暖暖的珊瑚粉', level:10},
  {id:'tag-gold', category:'tag', name:'金色吊牌', description:'圓圓的小吊牌', level:1},
  {id:'tag-heart', category:'tag', name:'愛心吊牌', description:'把喜歡掛在胸前', level:4},
  {id:'tag-star', category:'tag', name:'星星吊牌', description:'閃閃發亮的小星星', level:11},
  {id:'toy-ball', category:'toy', name:'經典小球', description:'永遠的好玩伴', level:1},
  {id:'toy-squeaky', category:'toy', name:'啾啾玩具', description:'圓滾滾的小玩具', level:5},
  {id:'toy-bone', category:'toy', name:'骨頭玩具', description:'適合追著跑的小骨頭', level:12},
  {id:'art-paw', category:'art', name:'小腳印畫', description:'最珍貴的小腳印', level:1},
  {id:'art-flower', category:'art', name:'小花畫', description:'把一朵小花帶回家', level:6},
  {id:'art-heart', category:'art', name:'愛心畫', description:'滿滿的喜歡', level:13},
  {id:'pot-cream', category:'pot', name:'奶油花盆', description:'柔和的奶油色花盆', level:1},
  {id:'pot-sage', category:'pot', name:'鼠尾草花盆', description:'像小森林一樣', level:7},
  {id:'pot-peach', category:'pot', name:'蜜桃花盆', description:'暖暖的粉色小花盆', level:14},
  {id:'bed-peach', category:'bed', name:'蜜桃狗窩', description:'軟綿綿的溫暖小窩', level:1},
  {id:'bed-cream', category:'bed', name:'奶油狗窩', description:'像雲朵一樣的狗窩', level:8},
  {id:'bed-sage', category:'bed', name:'森林狗窩', description:'在綠意裡做個好夢', level:15},
];
const DEFAULT_COSMETICS: CosmeticSelection = {theme:'theme-cream',rug:'rug-sage',collar:'collar-mint',tag:'tag-gold',toy:'toy-ball',art:'art-paw',pot:'pot-cream',bed:'bed-peach'};

interface MissionTemplate { id: string; title: string; description: string; action: CareAction; target: number; rewardXP: number }
export const DAILY_MISSIONS: readonly MissionTemplate[] = [
  {id:'daily-feed',title:'好好吃飯',description:'餵食 1 次',action:'feed',target:1,rewardXP:25},
  {id:'daily-pet',title:'溫柔摸摸',description:'摸摸 2 次',action:'pet',target:2,rewardXP:25},
  {id:'daily-play',title:'一起玩耍',description:'玩耍 1 次',action:'play',target:1,rewardXP:25},
  {id:'daily-water',title:'喝口水吧',description:'喝水 1 次',action:'water',target:1,rewardXP:25},
  {id:'daily-sleep',title:'好好休息',description:'睡覺 1 次',action:'sleep',target:1,rewardXP:25},
];
export const WEEKLY_MISSIONS: readonly MissionTemplate[] = [
  {id:'weekly-feed',title:'一週的好味道',description:'餵食 10 次',action:'feed',target:10,rewardXP:100},
  {id:'weekly-pet',title:'一週的溫柔',description:'摸摸 10 次',action:'pet',target:10,rewardXP:100},
  {id:'weekly-play',title:'開心的玩伴',description:'玩耍 5 次',action:'play',target:5,rewardXP:100},
  {id:'weekly-water',title:'好好喝水',description:'喝水 5 次',action:'water',target:5,rewardXP:100},
  {id:'weekly-sleep',title:'舒服的午睡',description:'睡覺 3 次',action:'sleep',target:3,rewardXP:100},
];

export interface Achievement {
  id: string;
  title: string;
  description: string;
  target: number;
  category: 'care' | 'bond' | 'time' | 'explore' | 'collection';
  rarity: 'common' | 'rare' | 'special';
  progress: (pet: PetSaveV2, now: number) => number;
}
const achievement = (id:string,title:string,description:string,target:number,category:Achievement['category'],progress:Achievement['progress'],rarity:Achievement['rarity']='common'):Achievement => ({id,title,description,target,category,progress,rarity});
const careNames: Record<CareAction, { verb:string; one:string; ten:string; fifty:string }> = {
  feed:{verb:'餵飯',one:'第一口幸福',ten:'專屬小廚師',fifty:'幸福滿滿'},
  pet:{verb:'摸摸',one:'第一個摸摸',ten:'摸摸好朋友',fifty:'溫柔的手心'},
  play:{verb:'玩耍',one:'第一次玩耍',ten:'最佳玩伴',fifty:'快樂收藏家'},
  water:{verb:'喝水',one:'第一口水',ten:'補水小幫手',fifty:'咕嚕咕嚕'},
  sleep:{verb:'睡覺',one:'第一個好夢',ten:'安心入睡',fifty:'夢鄉守護者'},
};
const careAchievements:Achievement[] = ACTIONS.flatMap(action => [1,10,50,100,250].map(target => {
  const name=careNames[action];
  const id=action + '-' + (target===1 ? 'first' : String(target));
  return achievement(id,target===1?name.one:target===10?name.ten:target===50?name.fifty:target===100?'百次的'+name.verb:'滿滿的'+name.verb,
    target===1?'完成第一次'+name.verb:'累積'+name.verb+' '+target+' 次',target,'care',pet=>pet.counts[action],target>=100?'special':target>=50?'rare':'common');
}));
export const ACHIEVEMENTS: readonly Achievement[] = [
  achievement('adopted-name','有名字的家','為小夥伴取好名字，開始一起生活',1,'explore',pet=>pet.name.length>0?1:0),
  ...careAchievements,
  ...[1,5,20,100].map(hours=>achievement('active-'+hours+'h',hours===1?'一小時的陪伴':hours+'小時的陪伴','累積在頁面中陪伴 '+(hours*60)+' 分鐘',hours*60,'bond',pet=>pet.activeMs/MINUTE,hours>=20?'special':hours>=5?'rare':'common')),
  ...[1,7,30,100,365].map(days=>achievement('adopt-'+days+'d',days===1?'一起的第一天':days===7?'一週的小日常':days===30?'滿月的約定':days+'天的約定','相伴滿 '+days+' 天',days,'time',(pet,now)=>Math.max(0,now-pet.adoptedAt)/DAY,days>=100?'special':days>=30?'rare':'common')),
  ...[3,7,30,100].map(days=>achievement('streak-'+days,days+'天的溫柔','連續照顧達到 '+days+' 天',days,'bond',pet=>pet.streak.best,days>=30?'special':days>=7?'rare':'common')),
  ...[1,10,50,100].map(n=>achievement('daily-'+n,'日常小小事 '+n,'累積完成 '+n+' 個每日任務',n,'explore',pet=>pet.progress.dailyCompleted,n>=50?'special':n>=10?'rare':'common')),
  ...[1,5,20,50].map(n=>achievement('weekly-'+n,'一週的約定 '+n,'累積完成 '+n+' 個每週任務',n,'explore',pet=>pet.progress.weeklyCompleted,n>=20?'special':n>=5?'rare':'common')),
  ...[2,5,10].map(n=>achievement('bond-'+n,'心心相印 '+n,'親密度達到 '+n+' 級',n,'bond',pet=>pet.progress.bondLevel,n>=10?'special':n>=5?'rare':'common')),
  ...[5,10,20,30].map(n=>achievement('level-'+n,'一起長大 '+n,'陪伴等級達到 '+n+' 級',n,'explore',pet=>pet.progress.level,n>=20?'special':'rare')),
  ...CATEGORIES.map(category=>achievement('collection-'+category,'收藏：'+({theme:'房間',rug:'地毯',collar:'項圈',tag:'吊牌',toy:'玩具',art:'小畫',pot:'花盆',bed:'狗窩'}[category]),'解鎖這一類的全部 3 種裝飾',3,'collection',pet=>pet.unlocks.unlocked.filter(id=>COSMETICS.some(item=>item.id===id&&item.category===category)).length,'rare')),
  achievement('first-dress','換個新心情','第一次更換裝飾',1,'collection',pet=>pet.progress.cosmeticChanges),
  ...CORNERS.map(corner=>achievement('corner-'+corner,({window:'窗邊的陽光',plant:'綠色小角落',bed:'軟綿綿的窩'}[corner]),'探索'+({window:'窗邊',plant:'植物角落',bed:'狗窩'}[corner]),1,'explore',pet=>pet.progress.exploredCorners.includes(corner)?1:0)),
  achievement('corner-all','家的每個角落','探索窗邊、植物與狗窩',3,'explore',pet=>pet.progress.exploredCorners.length,'rare'),
  achievement('all-actions','五種小日常','嘗試每一種照顧方式',5,'explore',pet=>ACTIONS.filter(action=>pet.counts[action]>0).length,'rare'),
];

export function xpForNextLevel(level:number):number { return 100 + 25 * (Math.max(1,Math.min(30,level))-1); }
const clampNeed = (value:number) => Math.min(100,Math.max(0,value));
function checkedTime(now:number):number {
  if (!Number.isFinite(now)||now<0||now>MAX_TIMESTAMP) throw new Error('時間資料無效，請確認裝置日期與時間。');
  return now;
}
function normalizedName(value:unknown):string {
  if(typeof value!=='string') throw new Error('請輸入狗狗的名字。');
  const name=value.trim().normalize('NFC');
  if(/[\u0000-\u001f\u007f]/u.test(name)) throw new Error('名字不能含有換行或控制字元。');
  const length=Array.from(new Intl.Segmenter('zh-Hant',{granularity:'grapheme'}).segment(name)).length;
  if(length<1||length>16) throw new Error('狗狗的名字需要 1～16 個字。');
  return name;
}
const two = (value:number) => String(value).padStart(2,'0');
/** Calendar arithmetic uses local civil dates and UTC day numbers, so DST days need not be 24 hours. */
export function localDayKey(now:number):string {
  const d=new Date(checkedTime(now));
  return String(d.getFullYear()).padStart(4,'0')+'-'+two(d.getMonth()+1)+'-'+two(d.getDate());
}
function keyDayNumber(key:string):number {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if(!match) throw new Error('任務日期格式不正確。');
  const y=Number(match[1]), m=Number(match[2]), d=Number(match[3]);
  const date=new Date(0); date.setUTCHours(0,0,0,0); date.setUTCFullYear(y,m-1,d);
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d) throw new Error('任務日期格式不正確。');
  return Math.trunc(date.getTime()/DAY);
}
function dayKeyFromNumber(day:number):string { const date=new Date(day*DAY); return String(date.getUTCFullYear()).padStart(4,'0')+'-'+two(date.getUTCMonth()+1)+'-'+two(date.getUTCDate()); }
export function weekKeyForDay(key:string):string { const day=keyDayNumber(key); const weekday=new Date(day*DAY).getUTCDay(); return dayKeyFromNumber(day-((weekday+6)%7)); }
function dailyForKey(key:string):MissionState[] {
  const rotation=((keyDayNumber(key)%3)+3)%3;
  return [DAILY_MISSIONS[0],DAILY_MISSIONS[1],DAILY_MISSIONS[2+rotation]].map(item=>({...item,count:0,completedAt:null}));
}
function weeklyMissions():MissionState[] { return WEEKLY_MISSIONS.map(item=>({...item,count:0,completedAt:null})); }
function copyPet(pet:PetSaveV2):PetSaveV2 {
  return {...pet, needs:{...pet.needs}, counts:{...pet.counts}, achievements:{...pet.achievements}, settings:{...pet.settings},
    progress:{...pet.progress,dailyActionCounts:{...pet.progress.dailyActionCounts},exploredCorners:[...pet.progress.exploredCorners]},streak:{...pet.streak},
    missions:{...pet.missions,daily:pet.missions.daily.map(m=>({...m})),weekly:pet.missions.weekly.map(m=>({...m})),history:pet.missions.history.map(h=>({...h,completedIds:[...h.completedIds]}))},
    unlocks:{unlocked:[...pet.unlocks.unlocked],equipped:{...pet.unlocks.equipped}},journal:pet.journal.map(entry=>({...entry}))};
}
function markChanged(pet:PetSaveV2,now:number):PetSaveV2 {
  if(pet.revision>=MAX_SAFE) throw new Error('存檔更新次數已超出可用範圍，請先匯出備份。');
  pet.revision+=1; pet.savedAt=Math.max(pet.savedAt,now); return pet;
}
function initialV2(base:PetSaveV1,now:number):PetSaveV2 {
  const {schemaVersion:_schemaVersion, settings, ...existing}=base;
  const dailyKey=localDayKey(now);
  return {...existing,schemaVersion:2,needs:{...base.needs},counts:{...base.counts},achievements:{...base.achievements},
    settings:{reducedMotion:settings.reducedMotion,soundEnabled:false},
    progress:{xp:0,level:1,bond:0,bondLevel:1,bondMemories:0,dailyActionCounts:BLANK_COUNTS(),dailyCompleted:0,weeklyCompleted:0,daysCared:0,cosmeticChanges:0,exploredCorners:[]},
    streak:{current:0,best:0,lastActiveDay:null,graceUsed:false},
    missions:{dailyKey,weeklyKey:weekKeyForDay(dailyKey),daily:dailyForKey(dailyKey),weekly:weeklyMissions(),history:[]},
    unlocks:{unlocked:Object.values(DEFAULT_COSMETICS),equipped:{...DEFAULT_COSMETICS}},journal:[]};
}
export function createPet(name:string,now=Date.now()):PetSaveV2 {
  checkedTime(now);
  const base:PetSaveV1={schemaVersion:1,id:globalThis.crypto?.randomUUID?.()??'pet-'+now.toString(36)+'-'+Math.random().toString(36).slice(2,12),
    name:normalizedName(name),adoptedAt:now,savedAt:now,revision:0,activeMs:0,needs:{satiety:85,mood:90,hydration:85,energy:85},
    counts:BLANK_COUNTS(),achievements:{},settings:{reducedMotion:false}};
  const pet=initialV2(base,now);
  pet.achievements['adopted-name']=now;
  return pet;
}

function archiveMissions(pet:PetSaveV2,period:'daily'|'weekly',key:string,missions:MissionState[]):void {
  pet.missions.history.push({period,key,completedIds:missions.filter(m=>m.completedAt!==null).map(m=>m.id)});
  if(pet.missions.history.length>100) pet.missions.history.splice(0,pet.missions.history.length-100);
}
/** Rotate only forward on the user's local calendar. Clock rollback cannot re-award earlier days. */
function updatePeriods(pet:PetSaveV2,now:number):boolean {
  const day=localDayKey(now); const week=weekKeyForDay(day); let changed=false;
  if(keyDayNumber(day)>keyDayNumber(pet.missions.dailyKey)) {
    if(pet.streak.lastActiveDay!==null) {
      const missedDays=keyDayNumber(day)-keyDayNumber(pet.streak.lastActiveDay);
      if(missedDays>2||(missedDays===2&&pet.streak.graceUsed)) {
        pet.streak.current=0; pet.streak.lastActiveDay=null; pet.streak.graceUsed=false;
      }
    }
    archiveMissions(pet,'daily',pet.missions.dailyKey,pet.missions.daily);
    pet.missions.dailyKey=day; pet.missions.daily=dailyForKey(day); pet.progress.dailyActionCounts=BLANK_COUNTS(); changed=true;
  }
  if(keyDayNumber(week)>keyDayNumber(pet.missions.weeklyKey)) {
    archiveMissions(pet,'weekly',pet.missions.weeklyKey,pet.missions.weekly);
    pet.missions.weeklyKey=week; pet.missions.weekly=weeklyMissions(); changed=true;
  }
  return changed;
}
function addXp(pet:PetSaveV2,amount:number):void {
  if(pet.progress.level>=30) { pet.progress.xp=0; return; }
  pet.progress.xp+=amount;
  while(pet.progress.level<30&&pet.progress.xp>=xpForNextLevel(pet.progress.level)) {
    pet.progress.xp-=xpForNextLevel(pet.progress.level); pet.progress.level+=1;
  }
  if(pet.progress.level===30) pet.progress.xp=0;
  for(const item of COSMETICS) if(item.level<=pet.progress.level&&!pet.unlocks.unlocked.includes(item.id)) pet.unlocks.unlocked.push(item.id);
}
function addBond(pet:PetSaveV2,amount:number):void {
  const room=Math.max(0,900-pet.progress.bond);
  pet.progress.bond+=Math.min(room,amount);
  pet.progress.bondMemories=Math.min(MAX_SAFE,pet.progress.bondMemories+Math.max(0,amount-room));
  pet.progress.bondLevel=Math.min(10,Math.floor(pet.progress.bond/100)+1);
}
function incrementStreak(pet:PetSaveV2,day:string):void {
  const last=pet.streak.lastActiveDay;
  if(last===day) return;
  const gap=last===null?0:keyDayNumber(day)-keyDayNumber(last);
  if(gap<0) return;
  if(last===null||gap>2||(gap===2&&pet.streak.graceUsed)) {
    pet.streak.current=1; pet.streak.graceUsed=false;
  } else {
    pet.streak.current+=1;
    if(gap===2) pet.streak.graceUsed=true;
  }
  pet.streak.best=Math.max(pet.streak.best,pet.streak.current);
  pet.streak.lastActiveDay=day;
  pet.progress.daysCared=Math.min(MAX_SAFE,pet.progress.daysCared+1);
}
function unlockAchievements(pet:PetSaveV2,now:number):boolean {
  let changed=false;
  for(const item of ACHIEVEMENTS) if(!Object.hasOwn(pet.achievements,item.id)&&item.progress(pet,now)>=item.target) {
    pet.achievements[item.id]=Math.max(pet.adoptedAt,pet.savedAt,now); changed=true;
  }
  return changed;
}
function applyMissionProgress(pet:PetSaveV2,action:CareAction,now:number):void {
  const day=localDayKey(now);
  // The device clock may move backwards; keep recording care, but don't replay rewards or earlier tasks.
  if(keyDayNumber(day)<keyDayNumber(pet.missions.dailyKey)) return;
  for(const mission of pet.missions.daily) if(mission.action===action&&mission.completedAt===null) {
    mission.count=Math.min(mission.target,mission.count+1);
    if(mission.count===mission.target) {
      mission.completedAt=Math.max(pet.adoptedAt,pet.savedAt,now);
      pet.progress.dailyCompleted=Math.min(MAX_SAFE,pet.progress.dailyCompleted+1);
      incrementStreak(pet,day); addXp(pet,mission.rewardXP); addBond(pet,5);
    }
  }
  if(keyDayNumber(weekKeyForDay(day))>=keyDayNumber(pet.missions.weeklyKey)) {
    for(const mission of pet.missions.weekly) if(mission.action===action&&mission.completedAt===null) {
      mission.count=Math.min(mission.target,mission.count+1);
      if(mission.count===mission.target) {
        mission.completedAt=Math.max(pet.adoptedAt,pet.savedAt,now);
        pet.progress.weeklyCompleted=Math.min(MAX_SAFE,pet.progress.weeklyCompleted+1);
        addXp(pet,mission.rewardXP); addBond(pet,15);
      }
    }
  }
  if(pet.progress.dailyActionCounts[action]<5) {
    pet.progress.dailyActionCounts[action]+=1; addXp(pet,5); addBond(pet,2);
  }
}
const JOURNAL_TEXT:Record<CareAction,string>={feed:'吃了一頓香香的飯。',pet:'享受了溫柔的摸摸。',play:'和你開心地玩了玩具。',water:'乖乖補充了水分。',sleep:'在小窩裡做了好夢。'};

/** Only pass foreground elapsed time. Offline time never reduces the pet's needs. */
export function advancePet(pet:PetSaveV2,activeMs:number,now:number,sleeping=false):PetSaveV2 {
  checkedTime(now); const next=copyPet(pet); const periodChanged=updatePeriods(next,now);
  const elapsed=Number.isFinite(activeMs)?Math.min(MAX_ACTIVE_MS,Math.max(0,activeMs)):0;
  if(elapsed>0) {
    const minutes=elapsed/MINUTE, restingFactor=sleeping?0.5:1;
    next.activeMs=Math.min(MAX_ACTIVE_MS,next.activeMs+elapsed);
    next.needs.satiety=clampNeed(next.needs.satiety-0.6*minutes*restingFactor);
    next.needs.mood=clampNeed(next.needs.mood-0.4*minutes*restingFactor);
    next.needs.hydration=clampNeed(next.needs.hydration-0.8*minutes*restingFactor);
    next.needs.energy=clampNeed(next.needs.energy+(sleeping?1.5*elapsed/1000:-0.5*minutes));
  }
  const unlocked=unlockAchievements(next,now);
  const changed=periodChanged||unlocked||next.activeMs!==pet.activeMs||NEED_KEYS.some(key=>next.needs[key]!==pet.needs[key]);
  return changed?markChanged(next,now):next;
}
/** Call once when an accepted interaction finishes; animation/click gating belongs to the UI. */
export function applyAction(pet:PetSaveV2,action:CareAction,now:number):PetSaveV2 {
  checkedTime(now); if(!ACTIONS.includes(action)) throw new Error('這個互動方式無法辨識。');
  const next=copyPet(pet); updatePeriods(next,now);
  if(next.counts[action]>=MAX_SAFE) throw new Error('互動次數已超出可用範圍，請先匯出備份。');
  next.counts[action]+=1;
  switch(action) {
    case 'feed':next.needs.satiety+=25;next.needs.mood+=3;break;
    case 'water':next.needs.hydration+=30;next.needs.mood+=2;break;
    case 'pet':next.needs.mood+=12;break;
    case 'play':next.needs.mood+=20;next.needs.energy-=8;next.needs.satiety-=3;next.needs.hydration-=4;break;
    case 'sleep':break;
  }
  for(const key of NEED_KEYS) next.needs[key]=clampNeed(next.needs[key]);
  applyMissionProgress(next,action,now);
  next.journal.push({id:'entry-'+String(now)+'-'+action+'-'+String(next.counts[action]),at:now,action,text:JOURNAL_TEXT[action]});
  if(next.journal.length>100) next.journal.splice(0,next.journal.length-100);
  unlockAchievements(next,now); return markChanged(next,now);
}
export function renamePet(pet:PetSaveV2,name:string,now:number):PetSaveV2 {
  checkedTime(now); const next=copyPet(pet); next.name=normalizedName(name);
  const periodChanged=updatePeriods(next,now); const unlocked=unlockAchievements(next,now);
  return next.name!==pet.name||unlocked||periodChanged?markChanged(next,now):next;
}
export function equipCosmetic(pet:PetSaveV2,id:string,now:number):PetSaveV2 {
  checkedTime(now); const item=COSMETICS.find(c=>c.id===id);
  if(!item||!pet.unlocks.unlocked.includes(id)) throw new Error('這個裝飾還沒有解鎖。');
  const next=copyPet(pet); const periodChanged=updatePeriods(next,now);
  const changed=next.unlocks.equipped[item.category]!==id;
  if(changed) { next.unlocks.equipped[item.category]=id; next.progress.cosmeticChanges=Math.min(MAX_SAFE,next.progress.cosmeticChanges+1); }
  const unlocked=unlockAchievements(next,now);
  return changed||periodChanged||unlocked?markChanged(next,now):next;
}
export function exploreCorner(pet:PetSaveV2,corner:ExploreCorner,now:number):PetSaveV2 {
  checkedTime(now);
  if(!CORNERS.includes(corner)) throw new Error('找不到這個角落。');
  const next=copyPet(pet); const periodChanged=updatePeriods(next,now);
  const changed=!next.progress.exploredCorners.includes(corner);
  if(changed) { next.progress.exploredCorners.push(corner); addXp(next,10); addBond(next,3); }
  const unlocked=unlockAchievements(next,now);
  return changed||periodChanged||unlocked?markChanged(next,now):next;
}

function record(value:unknown,label:string):Record<string,unknown> {
  if(typeof value!=='object'||value===null||Array.isArray(value)) throw new Error(label+'的格式不正確。');
  return value as Record<string,unknown>;
}
function field(object:Record<string,unknown>,key:string,label:string):unknown {
  if(!Object.hasOwn(object,key)) throw new Error('存檔缺少'+label+'。');
  return object[key];
}
function boundedNumber(value:unknown,label:string,min:number,max:number,integer=false):number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value))) throw new Error(label+'的數值無效，請選擇完整且未損壞的備份檔。');
  return value;
}
function booleanField(value:unknown,label:string):boolean {
  if(typeof value!=='boolean') throw new Error(label+'的格式不正確。'); return value;
}
function keyField(value:unknown,label:string):string {
  if(typeof value!=='string') throw new Error(label+'的格式不正確。');
  keyDayNumber(value); return value;
}
function countFields(value:unknown,label:string,max=MAX_SAFE):Record<CareAction,number> {
  const source=record(value,label); const result=BLANK_COUNTS();
  for(const action of ACTIONS) result[action]=boundedNumber(field(source,action,label),label,0,max,true);
  return result;
}
function validateMissionList(value:unknown,templates:readonly MissionTemplate[],maximumDate:number):MissionState[] {
  if(!Array.isArray(value)||value.length!==templates.length) throw new Error('任務資料格式不正確。');
  const result:MissionState[]=[];
  for(const template of templates) {
    const matching=value.filter(entry=>typeof entry==='object'&&entry!==null&&!Array.isArray(entry)&&(entry as Record<string,unknown>).id===template.id);
    if(matching.length!==1) throw new Error('任務資料缺少或重複。');
    const source=record(matching[0],'任務');
    if(field(source,'action','任務動作')!==template.action||field(source,'target','任務目標')!==template.target||field(source,'rewardXP','任務獎勵')!==template.rewardXP) throw new Error('任務目標無效。');
    const count=boundedNumber(field(source,'count','任務進度'),'任務進度',0,template.target,true);
    const stamp=field(source,'completedAt','任務完成時間');
    const completedAt=stamp===null?null:boundedNumber(stamp,'任務完成時間',0,maximumDate);
    if((completedAt!==null)!==(count===template.target)) throw new Error('任務完成狀態與進度不符。');
    result.push({...template,count,completedAt});
  }
  return result;
}

/** Validate and sanitize every stored field. Old v1 records are upgraded in memory without overwriting the original. */
export function validateSave(value:unknown,now=Date.now(),options:{allowFutureDates?:boolean}={}):PetSaveV2 {
  checkedTime(now);
  const maximumDate=options.allowFutureDates?MAX_TIMESTAMP:Math.min(MAX_TIMESTAMP,now+FUTURE_TOLERANCE_MS);
  const source=record(value,'存檔');
  if(source.schemaVersion!==1&&source.schemaVersion!==2) throw new Error('不支援這個存檔版本，請使用本遊戲匯出的備份。');
  const id=field(source,'id','寵物識別碼');
  if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u.test(id)) throw new Error('寵物識別碼無效，請選擇本遊戲匯出的備份。');
  const name=normalizedName(field(source,'name','名字'));
  const adoptedAt=boundedNumber(field(source,'adoptedAt','領養時間'),'領養時間',0,maximumDate);
  const savedAt=boundedNumber(field(source,'savedAt','儲存時間'),'儲存時間',adoptedAt,maximumDate);
  const revision=boundedNumber(field(source,'revision','更新次數'),'更新次數',0,MAX_SAFE,true);
  const activeMs=boundedNumber(field(source,'activeMs','陪伴時間'),'陪伴時間',0,MAX_ACTIVE_MS);
  const sourceNeeds=record(field(source,'needs','狀態'),'寵物狀態');
  const needs={} as PetSaveV1['needs'];
  for(const key of NEED_KEYS) needs[key]=boundedNumber(field(sourceNeeds,key,'狀態資料'),'寵物狀態',0,100);
  const counts=countFields(field(source,'counts','互動次數'),'互動次數');
  const sourceAchievements=record(field(source,'achievements','成就'),'成就');
  const achievements:Record<string,number>={};
  for(const [key,timestamp] of Object.entries(sourceAchievements)) {
    if(!ACHIEVEMENTS.some(item=>item.id===key)) throw new Error('存檔含有無法辨識的成就，請確認備份版本。');
    achievements[key]=boundedNumber(timestamp,'成就解鎖時間',adoptedAt,maximumDate);
  }
  const sourceSettings=record(field(source,'settings','設定'),'設定');
  const reducedMotion=booleanField(field(sourceSettings,'reducedMotion','動畫設定'),'動畫設定');
  const base:PetSaveV1={schemaVersion:1,id,name,adoptedAt,savedAt,revision,activeMs,needs,counts,achievements,settings:{reducedMotion}};
  if(source.schemaVersion===1) {
    const migrated=initialV2(base,now);
    migrated.achievements['adopted-name']=adoptedAt;
    return migrated;
  }

  const result=initialV2(base,now);
  // Pre-release v2 previews may be missing these two additive fields; normalize them safely.
  result.settings.soundEnabled=Object.hasOwn(sourceSettings,'soundEnabled') ? booleanField(sourceSettings.soundEnabled,'音效設定') : false;
  const sourceProgress=record(field(source,'progress','養成進度'),'養成進度');
  const level=boundedNumber(field(sourceProgress,'level','等級'),'等級',1,30,true);
  const xp=boundedNumber(field(sourceProgress,'xp','經驗值'),'經驗值',0,level===30?0:xpForNextLevel(level)-1,true);
  const bond=boundedNumber(field(sourceProgress,'bond','親密點數'),'親密點數',0,900,true);
  const bondLevel=boundedNumber(field(sourceProgress,'bondLevel','親密等級'),'親密等級',1,10,true);
  if(bondLevel!==Math.min(10,Math.floor(bond/100)+1)) throw new Error('親密等級與點數不符。');
  const bondMemories=boundedNumber(field(sourceProgress,'bondMemories','親密回憶'),'親密回憶',0,MAX_SAFE,true);
  const dailyActionCounts=countFields(field(sourceProgress,'dailyActionCounts','每日互動'),'每日互動',5);
  const dailyCompleted=boundedNumber(field(sourceProgress,'dailyCompleted','每日任務累計'),'每日任務累計',0,MAX_SAFE,true);
  const weeklyCompleted=boundedNumber(field(sourceProgress,'weeklyCompleted','每週任務累計'),'每週任務累計',0,MAX_SAFE,true);
  const daysCared=boundedNumber(field(sourceProgress,'daysCared','照顧天數'),'照顧天數',0,MAX_SAFE,true);
  const cosmeticChanges=boundedNumber(field(sourceProgress,'cosmeticChanges','裝飾次數'),'裝飾次數',0,MAX_SAFE,true);
  const exploredSource=Object.hasOwn(sourceProgress,'exploredCorners') ? sourceProgress.exploredCorners : [];
  if(!Array.isArray(exploredSource)||exploredSource.length>CORNERS.length||exploredSource.some(corner=>!CORNERS.includes(corner as ExploreCorner))||new Set(exploredSource).size!==exploredSource.length) throw new Error('探索角落資料無效。');
  const exploredCorners=[...exploredSource] as ExploreCorner[];
  result.progress={xp,level,bond,bondLevel,bondMemories,dailyActionCounts,dailyCompleted,weeklyCompleted,daysCared,cosmeticChanges,exploredCorners};

  const sourceStreak=record(field(source,'streak','連續照顧'),'連續照顧');
  const current=boundedNumber(field(sourceStreak,'current','連續天數'),'連續天數',0,MAX_SAFE,true);
  const best=boundedNumber(field(sourceStreak,'best','最佳連續天數'),'最佳連續天數',current,MAX_SAFE,true);
  const lastValue=field(sourceStreak,'lastActiveDay','最後照顧日期');
  const lastActiveDay=lastValue===null?null:keyField(lastValue,'最後照顧日期');
  const graceUsed=booleanField(field(sourceStreak,'graceUsed','寬限狀態'),'寬限狀態');
  if((current===0)!==(lastActiveDay===null)) throw new Error('連續照顧日期與天數不符。');
  result.streak={current,best,lastActiveDay,graceUsed};

  const sourceMissions=record(field(source,'missions','任務'),'任務');
  const dailyKey=keyField(field(sourceMissions,'dailyKey','每日任務日期'),'每日任務日期');
  const weeklyKey=keyField(field(sourceMissions,'weeklyKey','每週任務日期'),'每週任務日期');
  if(weeklyKey!==weekKeyForDay(dailyKey)||lastActiveDay!==null&&keyDayNumber(lastActiveDay)>keyDayNumber(dailyKey)) throw new Error('任務日期與照顧紀錄不符。');
  const dailyTemplates=dailyForKey(dailyKey).map(({count:_count,completedAt:_completedAt,...item})=>item);
  const daily=validateMissionList(field(sourceMissions,'daily','每日任務'),dailyTemplates,maximumDate);
  const weekly=validateMissionList(field(sourceMissions,'weekly','每週任務'),WEEKLY_MISSIONS,maximumDate);
  const historySource=field(sourceMissions,'history','任務歷史');
  if(!Array.isArray(historySource)||historySource.length>100) throw new Error('任務歷史格式不正確。');
  const history:MissionHistory[]=historySource.map(value=>{
    const item=record(value,'任務歷史'); const period=field(item,'period','任務類型');
    if(period!=='daily'&&period!=='weekly') throw new Error('任務類型不正確。');
    const key=keyField(field(item,'key','任務歷史日期'),'任務歷史日期');
    const ids=field(item,'completedIds','完成任務');
    const allowed=period==='daily'?dailyForKey(key):WEEKLY_MISSIONS;
    if(!Array.isArray(ids)||ids.length>allowed.length||ids.some(id=>typeof id!=='string'||!allowed.some(template=>template.id===id))||new Set(ids).size!==ids.length) throw new Error('任務歷史完成項目無效。');
    return {period,key,completedIds:[...ids] as string[]};
  });
  result.missions={dailyKey,weeklyKey,daily,weekly,history};

  const sourceUnlocks=record(field(source,'unlocks','收藏'),'收藏');
  const unlockedSource=field(sourceUnlocks,'unlocked','已解鎖裝飾');
  if(!Array.isArray(unlockedSource)||unlockedSource.length>COSMETICS.length||unlockedSource.some(id=>typeof id!=='string'||!COSMETICS.some(item=>item.id===id&&item.level<=level))||new Set(unlockedSource).size!==unlockedSource.length||Object.values(DEFAULT_COSMETICS).some(id=>!unlockedSource.includes(id))) throw new Error('已解鎖裝飾無效。');
  const unlocked=[...unlockedSource] as string[];
  const equippedSource=record(field(sourceUnlocks,'equipped','裝備'),'裝備');
  const equipped={} as CosmeticSelection;
  for(const category of CATEGORIES) {
    const chosen=field(equippedSource,category,'裝飾');
    if(typeof chosen!=='string'||!unlocked.includes(chosen)||!COSMETICS.some(item=>item.id===chosen&&item.category===category)) throw new Error('裝備的裝飾無效或尚未解鎖。');
    equipped[category]=chosen;
  }
  result.unlocks={unlocked,equipped};

  const journalSource=field(source,'journal','日記');
  if(!Array.isArray(journalSource)||journalSource.length>100) throw new Error('日記資料格式不正確。');
  result.journal=journalSource.map(value=>{
    const entry=record(value,'日記'); const entryId=field(entry,'id','日記識別碼');
    const at=boundedNumber(field(entry,'at','日記時間'),'日記時間',0,maximumDate);
    const action=field(entry,'action','日記動作'); const message=field(entry,'text','日記內容');
    if(typeof entryId!=='string'||entryId.length<1||entryId.length>100||!ACTIONS.includes(action as CareAction)||typeof message!=='string'||message.length>256) throw new Error('日記內容無效。');
    return {id:entryId,at,action:action as CareAction,text:message};
  });
  return result;
}
