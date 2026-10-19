// Exercise library, weekly plan generator and progressive overload rules.

const EQUIP_RANK = { none: 0, dumbbells: 1, gym: 2 };
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

/*
 * type: reps | time (seconds) | cardio (minutes)
 * range: [low, high] reps, seconds or minutes
 * inc: weight step in kg for weighted lifts (per dumbbell for dumbbell moves)
 * avoid: injuries that rule the move out
 * harder: progressions to try (first one the user can do wins)
 * perSide: reps are counted per side
 */
export const EXERCISES = {
  box_squat: { zh: '坐箱深蹲', en: 'Box squat', equip: 'none', type: 'reps', range: [8, 15], harder: ['bw_squat'],
    cues: { zh: ['身后放一把稳的椅子，臀部往后坐，轻碰到就站起', '膝盖和脚尖朝同一个方向', '选能不痛地完成的高度'],
            en: ['Sit back to a sturdy chair, touch lightly, stand up', 'Knees track over toes', 'Pick a height you can do pain-free'] } },
  bw_squat: { zh: '徒手深蹲', en: 'Bodyweight squat', equip: 'none', type: 'reps', range: [10, 20], avoid: ['knee'], harder: ['goblet_squat', 'pause_squat'],
    cues: { zh: ['双脚与肩同宽，脚尖略外八', '像坐椅子一样往后往下坐，背保持挺直', '脚跟不离地'],
            en: ['Feet shoulder-width, toes slightly out', 'Sit back and down, chest up', 'Keep heels down'] } },
  pause_squat: { zh: '停顿深蹲', en: 'Pause squat', equip: 'none', type: 'reps', range: [8, 15], avoid: ['knee'],
    cues: { zh: ['蹲到底停 2 秒再站起', '停顿时保持核心收紧'], en: ['Hold the bottom for 2 seconds', 'Stay braced during the pause'] } },
  goblet_squat: { zh: '高脚杯深蹲', en: 'Goblet squat', equip: 'dumbbells', type: 'reps', range: [8, 12], weighted: true, inc: 2, avoid: ['knee'],
    cues: { zh: ['双手捧一个哑铃贴近胸口', '蹲下时手肘在膝盖内侧', '起身时脚掌发力'],
            en: ['Hold one dumbbell at your chest', 'Elbows inside knees at the bottom', 'Drive up through the whole foot'] } },
  leg_press: { zh: '腿举', en: 'Leg press', equip: 'gym', type: 'reps', range: [10, 15], weighted: true, inc: 5, avoid: ['knee'],
    cues: { zh: ['腰背贴紧靠垫', '放下到膝盖约 90 度', '推起时膝盖不要锁死'],
            en: ['Keep your lower back on the pad', 'Lower to about 90° at the knee', 'Do not lock the knees at the top'] } },

  glute_bridge: { zh: '臀桥', en: 'Glute bridge', equip: 'none', type: 'reps', range: [10, 20], harder: ['single_leg_bridge'],
    cues: { zh: ['仰卧屈膝，脚跟靠近臀部', '臀部发力抬起到肩膝一条线', '顶端夹紧臀部停 1 秒'],
            en: ['Lie on your back, heels near your hips', 'Lift until shoulders, hips and knees line up', 'Squeeze and pause 1 second at the top'] } },
  single_leg_bridge: { zh: '单腿臀桥', en: 'Single-leg glute bridge', equip: 'none', type: 'reps', range: [8, 15], perSide: true,
    cues: { zh: ['一条腿伸直抬起', '骨盆保持水平不歪'], en: ['One leg straight in the air', 'Keep the hips level'] } },
  db_rdl: { zh: '哑铃罗马尼亚硬拉', en: 'Dumbbell Romanian deadlift', equip: 'dumbbells', type: 'reps', range: [8, 12], weighted: true, inc: 2, avoid: ['back'],
    cues: { zh: ['微屈膝，臀部向后推', '哑铃贴着大腿往下滑，背始终挺直', '大腿后侧有拉伸感就起'],
            en: ['Soft knees, push hips back', 'Slide the weights down your thighs, back flat', 'Stand up once you feel the hamstrings stretch'] } },

  reverse_lunge: { zh: '后撤步弓步', en: 'Reverse lunge', equip: 'none', type: 'reps', range: [8, 12], perSide: true, avoid: ['knee'], harder: ['db_split_squat'],
    cues: { zh: ['一条腿向后撤一大步', '前膝在脚踝正上方', '前脚发力站回'], en: ['Step one leg back', 'Front knee stays over the ankle', 'Push through the front foot to return'] } },
  db_split_squat: { zh: '哑铃分腿蹲', en: 'Dumbbell split squat', equip: 'dumbbells', type: 'reps', range: [8, 12], perSide: true, weighted: true, inc: 1, avoid: ['knee'],
    cues: { zh: ['前后分腿站稳，双手各拿一个哑铃', '垂直往下蹲，后膝接近地面', '上身保持直立'],
            en: ['Split stance, a dumbbell in each hand', 'Drop straight down, back knee near the floor', 'Keep your torso upright'] } },

  wall_pushup: { zh: '扶墙俯卧撑', en: 'Wall push-up', equip: 'none', type: 'reps', range: [10, 20], avoid: ['wrist'], harder: ['incline_pushup'],
    cues: { zh: ['双手扶墙，身体成一条直线', '胸口靠近墙再推开'], en: ['Hands on the wall, body in a straight line', 'Bring your chest close, then push away'] } },
  incline_pushup: { zh: '上斜俯卧撑', en: 'Incline push-up', equip: 'none', type: 'reps', range: [8, 15], avoid: ['wrist'], harder: ['knee_pushup'],
    cues: { zh: ['双手撑在稳固的桌子或沙发边', '身体从头到脚一条直线', '手肘与身体约 45 度'],
            en: ['Hands on a sturdy table or couch edge', 'Head-to-heels straight line', 'Elbows about 45° from your body'] } },
  knee_pushup: { zh: '跪姿俯卧撑', en: 'Knee push-up', equip: 'none', type: 'reps', range: [8, 15], avoid: ['wrist'], harder: ['pushup'],
    cues: { zh: ['膝盖着地，从头到膝一条直线', '胸口下到离地一拳'], en: ['Knees down, straight line head to knees', 'Lower until your chest is a fist from the floor'] } },
  pushup: { zh: '标准俯卧撑', en: 'Push-up', equip: 'none', type: 'reps', range: [8, 15], avoid: ['wrist'],
    cues: { zh: ['核心收紧，臀部不塌也不翘', '胸口下到离地一拳', '手肘与身体约 45 度'],
            en: ['Brace your core, hips neither sag nor pike', 'Chest to a fist from the floor', 'Elbows about 45°'] } },
  db_floor_press: { zh: '哑铃地板卧推', en: 'Dumbbell floor press', equip: 'dumbbells', type: 'reps', range: [8, 12], weighted: true, inc: 1,
    cues: { zh: ['仰卧屈膝，双手各握一个哑铃', '上臂碰地后推起', '推起时不要耸肩'], en: ['Lie with knees bent, a dumbbell in each hand', 'Upper arms touch the floor, then press', 'Keep shoulders down'] } },
  db_bench_press: { zh: '哑铃卧推', en: 'Dumbbell bench press', equip: 'gym', type: 'reps', range: [8, 12], weighted: true, inc: 2,
    cues: { zh: ['肩胛骨往后往下收紧', '哑铃下放到胸部两侧', '推起时手腕保持中立'], en: ['Pull shoulder blades back and down', 'Lower to the sides of your chest', 'Keep wrists stacked'] } },
  machine_chest_press: { zh: '器械推胸', en: 'Machine chest press', equip: 'gym', type: 'reps', range: [10, 15], weighted: true, inc: 5,
    cues: { zh: ['座椅调到把手与胸中部同高', '推出时呼气，慢慢收回'], en: ['Set the seat so handles are mid-chest', 'Exhale as you press, return slowly'] } },

  pike_pushup: { zh: '屈体俯卧撑', en: 'Pike push-up', equip: 'none', type: 'reps', range: [6, 12], minLevel: 'intermediate', avoid: ['wrist', 'shoulder'],
    cues: { zh: ['臀部抬高成倒 V 字', '头部朝双手之间下落'], en: ['Hips high in an upside-down V', 'Lower your head between your hands'] } },
  db_shoulder_press: { zh: '哑铃推举', en: 'Dumbbell shoulder press', equip: 'dumbbells', type: 'reps', range: [8, 12], weighted: true, inc: 1, avoid: ['shoulder'],
    cues: { zh: ['坐直，哑铃从肩膀高度向上推', '不要后仰腰部'], en: ['Sit tall, press from shoulder height', 'Do not arch your lower back'] } },

  backpack_row: { zh: '背包划船', en: 'Backpack row', equip: 'none', type: 'reps', range: [10, 15], avoid: ['back'],
    cues: { zh: ['背包里装几本书当重量', '俯身背挺直，把包拉向腹部', '手肘贴近身体'], en: ['Load a backpack with books', 'Hinge forward with a flat back, row to your belly', 'Keep elbows close'] } },
  prone_ytw: { zh: '俯卧 Y-T-W 字', en: 'Prone Y-T-W raise', equip: 'none', type: 'reps', range: [8, 12],
    cues: { zh: ['俯卧，手臂依次摆成 Y、T、W 抬起', '靠背部发力，不要甩'], en: ['Lie face down, lift arms into Y, T, then W', 'Use your upper back, no swinging'] } },
  db_row: { zh: '单臂哑铃划船', en: 'One-arm dumbbell row', equip: 'dumbbells', type: 'reps', range: [8, 12], perSide: true, weighted: true, inc: 2,
    cues: { zh: ['一手一膝撑在凳子上，背挺直', '把哑铃拉向腰部', '慢慢放下'], en: ['Support one hand and knee on a bench, back flat', 'Row the dumbbell to your hip', 'Lower slowly'] } },
  lat_pulldown: { zh: '高位下拉', en: 'Lat pulldown', equip: 'gym', type: 'reps', range: [10, 12], weighted: true, inc: 5,
    cues: { zh: ['握距略宽于肩', '把横杆拉到锁骨附近', '身体不要大幅后仰'], en: ['Grip a bit wider than shoulders', 'Pull the bar to your collarbone', 'Do not lean far back'] } },
  cable_row: { zh: '坐姿划船', en: 'Seated cable row', equip: 'gym', type: 'reps', range: [10, 12], weighted: true, inc: 5,
    cues: { zh: ['坐直，肩膀放松下沉', '把把手拉向腹部，夹紧背部'], en: ['Sit tall, shoulders down', 'Pull to your belly and squeeze your back'] } },

  plank: { zh: '平板支撑', en: 'Plank', equip: 'none', type: 'time', range: [20, 60],
    cues: { zh: ['手肘在肩膀正下方', '从头到脚一条直线，臀部不塌', '正常呼吸'], en: ['Elbows under shoulders', 'Straight line head to heels, hips up', 'Keep breathing'] } },
  dead_bug: { zh: '死虫式', en: 'Dead bug', equip: 'none', type: 'reps', range: [8, 12], perSide: true,
    cues: { zh: ['仰卧，腰背贴地', '对侧手脚慢慢伸远再收回'], en: ['On your back, lower back pressed down', 'Slowly extend opposite arm and leg, return'] } },
  bird_dog: { zh: '鸟狗式', en: 'Bird dog', equip: 'none', type: 'reps', range: [8, 12], perSide: true,
    cues: { zh: ['四点跪姿，背保持平', '对侧手脚伸直，停 2 秒'], en: ['On hands and knees, flat back', 'Reach opposite arm and leg, hold 2 seconds'] } },

  brisk_walk: { zh: '快走', en: 'Brisk walk', equip: 'none', type: 'cardio', range: [20, 45],
    cues: { zh: ['能说话但唱不了歌的速度', '室外、跑步机都可以'], en: ['You can talk but not sing', 'Outdoors or on a treadmill'] } },
};

// Slots: each day template is a list of slots in priority order; each slot
// lists candidate exercises best-first. Progress is tracked per slot.
export const SLOTS = {
  squat: ['goblet_squat', 'leg_press', 'bw_squat', 'box_squat'],
  hinge: ['db_rdl', 'glute_bridge'],
  lunge: ['db_split_squat', 'reverse_lunge'],
  push: ['machine_chest_press', 'db_bench_press', 'db_floor_press', 'pushup', 'knee_pushup', 'incline_pushup', 'wall_pushup'],
  vpush: ['db_shoulder_press', 'pike_pushup'],
  pull: ['lat_pulldown', 'db_row', 'backpack_row', 'prone_ytw'],
  pull2: ['cable_row', 'prone_ytw'],
  core_a: ['plank'],
  core_b: ['dead_bug', 'bird_dog'],
  cardio: ['brisk_walk'],
};

const MAIN_SLOTS = new Set(['squat', 'hinge', 'push', 'pull']);

export const DAY_TEMPLATES = {
  A: ['squat', 'push', 'pull', 'core_a', 'lunge', 'vpush'],
  B: ['hinge', 'push', 'pull2', 'core_b', 'squat', 'vpush'],
  upper: ['push', 'pull', 'vpush', 'pull2', 'core_a'],
  lower: ['squat', 'hinge', 'lunge', 'core_b'],
  cardio: ['cardio', 'core_a'],
};

const ROTATIONS = {
  1: ['A'],
  2: ['A', 'B'],
  3: ['A', 'B', 'A'],
  4: ['upper', 'lower', 'upper', 'lower'],
  5: ['upper', 'lower', 'cardio', 'upper', 'lower'],
  6: ['upper', 'lower', 'cardio', 'upper', 'lower', 'cardio'],
};

export function canDo(id, { equipment, injuries = [], experience = 'beginner' }) {
  const ex = EXERCISES[id];
  if (!ex) return false;
  if (EQUIP_RANK[ex.equip] > EQUIP_RANK[equipment]) return false;
  if ((ex.avoid || []).some((a) => injuries.includes(a))) return false;
  if (ex.minLevel && LEVEL_RANK[experience] < LEVEL_RANK[ex.minLevel]) return false;
  return true;
}

/** Picks the starting exercise for a slot; the fitness test can start people on an easier variation. */
export function pickExercise(slot, p) {
  const t = p.fitnessTest || {};
  const ok = (id) => canDo(id, p);
  if (slot === 'push' && p.equipment === 'none') {
    // no test: beginners start on incline push-ups, everyone else on full ones
    const n = Number.isFinite(t.pushups) ? t.pushups : p.experience === 'beginner' ? 3 : 10;
    const ladder = n >= 10 ? ['pushup'] : n >= 5 ? ['knee_pushup'] : n >= 1 ? ['incline_pushup'] : ['wall_pushup'];
    const pick = ladder.find(ok);
    if (pick) return pick;
  }
  if (slot === 'squat' && Number.isFinite(t.squats) && t.squats < 10 && ok('box_squat')) return 'box_squat';
  return SLOTS[slot].find(ok) || null;
}

function startTarget(id, p) {
  const ex = EXERCISES[id];
  const t = p.fitnessTest || {};
  if (ex.type === 'time') {
    const base = Number.isFinite(t.plankSec) && t.plankSec > 0 ? Math.round((t.plankSec * 0.6) / 5) * 5 : ex.range[0];
    return { secs: Math.min(ex.range[1], Math.max(ex.range[0], base)) };
  }
  if (ex.type === 'cardio') return { minutes: p.experience === 'beginner' ? 20 : 30 };
  return { reps: ex.range[0], weight: null };
}

function slotSeconds(ex, sets, target, rest) {
  if (ex.type === 'cardio') return target.minutes * 60 + 60;
  const work = ex.type === 'time' ? target.secs : (target.reps || 10) * 3 * (ex.perSide ? 2 : 1);
  return sets * (work + rest) + 60;
}

/**
 * Builds the weekly plan. Returns
 * { week: { [weekday]: { key, slots: [{slot, exerciseId, sets, rest, ...target}] } }, notes: [] }
 */
export function buildTrainingPlan(p) {
  const days = [...(p.trainDays || [])].sort((a, b) => a - b);
  const rotation = ROTATIONS[days.length] || [];
  const baseSets = p.experience === 'beginner' ? 2 : 3;
  const budget = Math.max(10, (p.sessionMin || 30) - 5) * 60; // minus warm-up
  const week = {};
  const notes = [];
  if ((p.injuries || []).length) notes.push('injury');
  if (!days.length) notes.push('noDays');

  days.forEach((wd, i) => {
    const key = rotation[i];
    const used = new Set();
    const slots = [];
    let total = 0;
    for (const slot of DAY_TEMPLATES[key]) {
      const id = pickExercise(slot, p);
      if (!id || used.has(id)) continue;
      const ex = EXERCISES[id];
      let sets = ex.type === 'cardio' ? 1 : baseSets + (p.experience === 'advanced' && MAIN_SLOTS.has(slot) ? 1 : 0);
      const rest = ex.type === 'cardio' ? 0 : ex.type === 'time' ? 45 : MAIN_SLOTS.has(slot) ? 90 : 60;
      const target = startTarget(id, p);
      if (ex.type === 'cardio') target.minutes = Math.max(10, Math.min(target.minutes, Math.floor(budget / 60) - 5));
      const secs = slotSeconds(ex, sets, target, rest);
      if (slots.length >= 3 && total + secs > budget) continue;
      total += secs;
      used.add(id);
      slots.push({ slot, exerciseId: id, sets, rest, ...target });
    }
    week[wd] = { key, slots, minutes: Math.round(total / 60) + 5 };
  });
  return { week, notes };
}

/** Merges the plan for a weekday with saved per-slot progress. */
export function resolveDay(plan, weekday, state = {}) {
  const day = plan?.week?.[weekday];
  if (!day) return null;
  return {
    key: day.key,
    minutes: day.minutes,
    slots: day.slots.map((s) => {
      const st = state[s.slot];
      if (!st) return { ...s };
      return { ...s, exerciseId: st.exerciseId || s.exerciseId, reps: st.reps ?? s.reps, secs: st.secs ?? s.secs, minutes: st.minutes ?? s.minutes, weight: st.weight ?? s.weight };
    }),
  };
}

/**
 * Progressive overload for one slot after a workout.
 * target: { exerciseId, sets, reps|secs|minutes, weight }
 * done:   [{ reps | secs | minutes, weight }]   (one per completed set)
 * returns { exerciseId, reps, secs, minutes, weight, change } where change is
 *   'reps' | 'time' | 'weight' | 'harder' | 'same' | 'maxed'
 */
export function progress(target, done, p) {
  const ex = EXERCISES[target.exerciseId];
  const next = { exerciseId: target.exerciseId, reps: target.reps, secs: target.secs, minutes: target.minutes, weight: target.weight ?? null };
  if (!ex) return { ...next, change: 'same' };
  const lastWeight = [...done].reverse().find((s) => Number.isFinite(s.weight) && s.weight > 0)?.weight;
  if (ex.weighted && Number.isFinite(lastWeight)) next.weight = lastWeight;
  if (done.length < target.sets) return { ...next, change: 'same' };
  const [lo, hi] = ex.range;

  if (ex.type === 'cardio') {
    const hit = done.every((s) => (s.minutes || 0) >= target.minutes);
    if (hit && target.minutes < hi) return { ...next, minutes: Math.min(hi, target.minutes + 5), change: 'time' };
    return { ...next, change: hit ? 'maxed' : 'same' };
  }
  if (ex.type === 'time') {
    const hit = done.every((s) => (s.secs || 0) >= target.secs);
    if (hit && target.secs < hi) return { ...next, secs: Math.min(hi, target.secs + 5), change: 'time' };
    return { ...next, change: hit ? 'maxed' : 'same' };
  }

  const reps = done.map((s) => s.reps || 0);
  if (reps.every((r) => r >= hi)) {
    if (ex.weighted && Number.isFinite(next.weight)) {
      return { ...next, weight: Math.round((next.weight + ex.inc) * 10) / 10, reps: lo, change: 'weight' };
    }
    const harder = (ex.harder || []).find((id) => canDo(id, p));
    if (harder) {
      const hx = EXERCISES[harder];
      return { exerciseId: harder, reps: hx.range[0], secs: undefined, minutes: undefined, weight: null, change: 'harder' };
    }
    return { ...next, reps: hi, change: 'maxed' };
  }
  if (reps.every((r) => r >= target.reps)) return { ...next, reps: Math.min(hi, target.reps + 1), change: 'reps' };
  return { ...next, change: 'same' };
}

export function plannedDaysCount(plan) {
  return Object.keys(plan?.week || {}).length;
}
