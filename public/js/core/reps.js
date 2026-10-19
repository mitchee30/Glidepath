// Camera rep counting from MediaPipe Pose landmarks.
//
// Each frame has 33 image landmarks (x, y normalised to the frame, y pointing down,
// plus a visibility score) and 33 world landmarks (metres, centred on the hips).
// Joint angles come from the world landmarks, so they hold up whether the camera
// is in front of you or at your side. Image landmarks are only used for
// visibility and for telling a sagging back from a piked one.
//
// A rep is: start extended (above `top`), bend past `bottom`, come back above `top`.
// Going down part of the way and coming back up is a partial rep: it is not
// counted and triggers a "go deeper" cue. When the joints are hard to see the
// counter keeps counting but gives no form cues; when they can't be seen at all
// it pauses.

export const P = {
  lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
};

const SIDES = {
  L: { shoulder: P.lShoulder, elbow: P.lElbow, wrist: P.lWrist, hip: P.lHip, knee: P.lKnee, ankle: P.lAnkle },
  R: { shoulder: P.rShoulder, elbow: P.rElbow, wrist: P.rWrist, hip: P.rHip, knee: P.rKnee, ankle: P.rAnkle },
};

// Thresholds in degrees, checked against real MediaPipe output on demo photos
// (see test/unit/reps.test.js): standing knees read about 150–160°, a full squat
// 55–80°, a half squat 120–135°; push-up elbows read about 165–172° at the top and
// 55–80° at the bottom.
export const COUNTABLE = {
  bw_squat: { kind: 'squat', top: 140, bottom: 100 },
  pause_squat: { kind: 'squat', top: 140, bottom: 100 },
  goblet_squat: { kind: 'squat', top: 140, bottom: 100 },
  box_squat: { kind: 'squat', top: 140, bottom: 110 },
  pushup: { kind: 'pushup', top: 140, bottom: 100, line: 'ankle' },
  knee_pushup: { kind: 'pushup', top: 140, bottom: 100, line: 'knee' },
  incline_pushup: { kind: 'pushup', top: 140, bottom: 100, line: 'ankle' },
  wall_pushup: { kind: 'pushup', top: 140, bottom: 110, line: null },
};

export const VIS_COUNT = 0.5; // below this a joint is treated as not visible
export const VIS_FORM = 0.75; // below this we count but don't judge form
const ENTER_MARGIN = 10; // a rep starts once the angle drops this far below `top`
const PARTIAL_MARGIN = 10; // bending at least this far counts as an attempt
const MIN_REP_MS = 400; // faster than this is jitter, not a rep
const LOST_RESET_MS = 1500; // out of view this long abandons the current rep
const LINE_MIN = 145; // shoulder–hip–ankle angle below this is a broken body line
const LINE_FRAMES = 3; // bad frames in one rep before we say anything
const SMOOTH = 0.5; // exponential smoothing of the angle

const deg = (r) => (r * 180) / Math.PI;

export function angle3(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v2 = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const n = Math.hypot(...v1) * Math.hypot(...v2);
  if (!n) return NaN;
  const cos = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / n;
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

const vis = (lm, ids) => Math.min(...ids.map((i) => lm[i]?.visibility ?? 0));

/** Picks the joint angle for this frame. Returns null when the joints can't be seen. */
export function measure(cfg, frame) {
  const { landmarks: lm, world } = frame;
  if (!lm || !world) return null;
  if (cfg.kind === 'squat') {
    // average both legs when both are visible (front view), else use the visible one (side view)
    const legs = Object.values(SIDES)
      .map((s) => ({ v: vis(lm, [s.hip, s.knee, s.ankle]), a: angle3(world[s.hip], world[s.knee], world[s.ankle]) }))
      .filter((l) => l.v >= VIS_COUNT && Number.isFinite(l.a));
    if (!legs.length) return null;
    return { angle: legs.reduce((s, l) => s + l.a, 0) / legs.length, vis: Math.min(...legs.map((l) => l.v)) };
  }
  // push-ups: use the arm/body side facing the camera
  const anchorKey = cfg.line === 'knee' ? 'knee' : 'ankle';
  let best = null;
  for (const s of Object.values(SIDES)) {
    const ids = [s.shoulder, s.elbow, s.wrist, s.hip, s[anchorKey]];
    const v = vis(lm, cfg.line ? ids : ids.slice(0, 3));
    if (!best || v > best.v) best = { s, v };
  }
  if (!best || best.v < VIS_COUNT) return null;
  const s = best.s;
  const out = { angle: angle3(world[s.shoulder], world[s.elbow], world[s.wrist]), vis: best.v };
  if (cfg.line) {
    out.line = angle3(world[s.shoulder], world[s.hip], world[s[anchorKey]]);
    // which side of the shoulder–anchor line the hip is on, in the image (y points down)
    const a = lm[s.shoulder];
    const b = lm[s[anchorKey]];
    const h = lm[s.hip];
    const aspect = frame.aspect || 1;
    const dx = (b.x - a.x) * aspect;
    const dy = b.y - a.y;
    const t = Math.abs(dx) > 1e-6 ? ((h.x - a.x) * aspect) / dx : 0.5;
    const lineY = a.y + dy * t;
    out.hipBelow = h.y > lineY;
  }
  return Number.isFinite(out.angle) ? out : null;
}

export class RepCounter {
  constructor(exerciseId) {
    this.cfg = COUNTABLE[exerciseId];
    if (!this.cfg) throw new Error(`not countable: ${exerciseId}`);
    this.kind = this.cfg.kind;
    this.count = 0;
    this.partials = 0;
    this.armed = false;
    this.inRep = false;
    this.smoothed = null;
    this.lastSeen = null;
    this.cue = null;
    this.cueAt = 0;
    this.status = 'notVisible';
  }

  /**
   * frame: { landmarks, world, t (ms), aspect (width / height) }
   * returns { count, partials, status, angle, event, cue }
   *   status: notVisible | getReady | counting
   *   event:  null | 'rep' | 'partial'
   *   cue:    null | 'deeper' | 'hipsSag' | 'hipsHigh'   (only on the frame it is raised)
   */
  update(frame) {
    const t = frame.t ?? 0;
    const m = measure(this.cfg, frame);
    let event = null;
    let cue = null;

    if (!m) {
      if (this.lastSeen !== null && t - this.lastSeen > LOST_RESET_MS) {
        // we lost track: start over from a top position so half-seen reps don't count
        this.inRep = false;
        this.armed = false;
        this.smoothed = null;
      }
      this.status = 'notVisible';
      return this.snapshot(null, event, cue);
    }
    this.lastSeen = t;
    this.smoothed = this.smoothed === null ? m.angle : this.smoothed + SMOOTH * (m.angle - this.smoothed);
    const a = this.smoothed;
    const { top, bottom } = this.cfg;
    const formOk = m.vis >= VIS_FORM;

    if (!this.armed) {
      if (a >= top) this.armed = true;
      this.status = this.armed ? 'counting' : 'getReady';
      return this.snapshot(a, event, cue);
    }
    this.status = 'counting';

    if (!this.inRep) {
      if (a < top - ENTER_MARGIN) {
        this.inRep = true;
        this.repStart = t;
        this.minAngle = a;
        this.reachedBottom = false;
        this.sag = 0;
        this.high = 0;
      }
    }
    if (this.inRep) {
      this.minAngle = Math.min(this.minAngle, a);
      if (a <= bottom) this.reachedBottom = true;
      if (formOk && m.line !== undefined && m.line < LINE_MIN) {
        if (m.hipBelow) this.sag++;
        else this.high++;
      }
      if (a >= top) {
        this.inRep = false;
        if (this.reachedBottom && t - this.repStart >= MIN_REP_MS) {
          this.count++;
          event = 'rep';
          if (this.sag + this.high >= LINE_FRAMES) cue = this.sag >= this.high ? 'hipsSag' : 'hipsHigh';
        } else if (!this.reachedBottom && this.minAngle <= top - PARTIAL_MARGIN) {
          this.partials++;
          event = 'partial';
          cue = 'deeper';
        }
      }
    }
    if (cue) {
      this.cue = cue;
      this.cueAt = t;
    }
    return this.snapshot(a, event, cue);
  }

  snapshot(angle, event, cue) {
    return {
      count: this.count,
      partials: this.partials,
      status: this.status,
      angle: angle === null ? null : Math.round(angle),
      event,
      cue,
    };
  }
}

export function isCountable(exerciseId) {
  return exerciseId in COUNTABLE;
}
