// Camera rep counter sheet: camera preview, skeleton overlay, live count and cues.

import { html, openSheet, icon } from './ui.js';
import { t, exName, getLang } from './i18n.js';
import { RepCounter, COUNTABLE } from './core/reps.js';
import { loadPose } from './pose.js';
import { state } from './app.js';

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const CUE_MS = 2500;
const VOICE_KEY = 'glidepath.voice';

function voicePref() {
  try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; }
}

function say(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = getLang() === 'en' ? 'en-US' : 'zh-CN';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}

function cameraError(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'denied';
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'noCamera';
  return 'camera';
}

/**
 * Opens the counter for one set.
 * onDone(count) is called when the user saves; nothing happens on close.
 */
export function openCounter({ exerciseId, target, onDone }) {
  const cfg = COUNTABLE[exerciseId];
  const counter = new RepCounter(exerciseId);
  let voice = voicePref();
  let stream = null;
  let raf = 0;
  let closed = false;
  let lastVideoTime = -1;
  let lastCue = null;
  let reachedSaid = false;

  const cleanup = () => {
    closed = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((tr) => tr.stop());
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  };

  openSheet({
    title: t('cam.title', { ex: exName(exerciseId) }),
    wide: true,
    closeLabel: t('common.close'),
    onClose: cleanup,
    content: html`
      <div class="cam">
        <div class="cam-stage">
          <video playsinline muted autoplay></video>
          <canvas aria-hidden="true"></canvas>
          <div class="cam-count"><b data-count>0</b><span>/ ${target}</span></div>
          <p class="cam-status" data-status role="status" aria-live="polite">${t('cam.loading')}</p>
        </div>
        <p class="hint">${t(`cam.setup.${cfg.kind}`)}</p>
        <div class="cam-actions">
          <button class="btn" type="button" data-voice aria-pressed="${voice}">${icon('volume', 18)}<span>${voice ? t('cam.voiceOn') : t('cam.voiceOff')}</span></button>
          <button class="btn btn-primary" type="button" data-save disabled>${t('cam.save', { n: 0 })}</button>
        </div>
        <p class="fineprint">${t('cam.privacy')}</p>
      </div>`,
    async onMount(body, close) {
      const video = body.querySelector('video');
      const canvas = body.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const countEl = body.querySelector('[data-count]');
      const statusEl = body.querySelector('[data-status]');
      const saveBtn = body.querySelector('[data-save]');
      const voiceBtn = body.querySelector('[data-voice]');
      const setStatus = (text, kind = '') => {
        statusEl.textContent = text;
        statusEl.dataset.kind = kind;
      };

      voiceBtn.onclick = () => {
        voice = !voice;
        try { localStorage.setItem(VOICE_KEY, voice ? 'on' : 'off'); } catch { /* ignore */ }
        voiceBtn.setAttribute('aria-pressed', String(voice));
        voiceBtn.querySelector('span').textContent = voice ? t('cam.voiceOn') : t('cam.voiceOff');
        if (!voice && 'speechSynthesis' in window) speechSynthesis.cancel();
      };
      saveBtn.onclick = () => {
        const n = counter.count;
        close();
        onDone?.(n);
      };

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus(t('cam.err.unsupported'), 'error');
        return;
      }
      let landmarker;
      try {
        const modelUrl = state.config?.poseModelUrl;
        [stream, landmarker] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
            .catch((e) => { throw Object.assign(new Error('camera'), { code: cameraError(e) }); }),
          loadPose(modelUrl).catch(() => { throw Object.assign(new Error('model'), { code: 'model' }); }),
        ]);
      } catch (e) {
        if (!closed) setStatus(t(`cam.err.${e.code || 'camera'}`), 'error');
        stream?.getTracks().forEach((tr) => tr.stop());
        return;
      }
      if (closed) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});

      const draw = (lm) => {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!lm) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.lineWidth = Math.max(2, W / 160);
        ctx.strokeStyle = 'rgba(127, 162, 245, 0.95)';
        ctx.fillStyle = '#F4E35A';
        for (const [a, b] of BONES) {
          if ((lm[a].visibility ?? 1) < 0.5 || (lm[b].visibility ?? 1) < 0.5) continue;
          ctx.beginPath();
          ctx.moveTo(lm[a].x * W, lm[a].y * H);
          ctx.lineTo(lm[b].x * W, lm[b].y * H);
          ctx.stroke();
        }
        for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
          if ((lm[i].visibility ?? 1) < 0.5) continue;
          ctx.beginPath();
          ctx.arc(lm[i].x * W, lm[i].y * H, Math.max(3, W / 120), 0, Math.PI * 2);
          ctx.fill();
        }
      };

      const show = (snap, now) => {
        countEl.textContent = String(snap.count);
        saveBtn.disabled = snap.count === 0;
        saveBtn.textContent = t('cam.save', { n: snap.count });
        if (snap.event === 'rep' && voice) say(String(snap.count));
        if (snap.cue) {
          lastCue = { cue: snap.cue, at: now };
          if (voice) say(t(`cam.cue.${snap.cue}.${cfg.kind}`, {}, t(`cam.cue.${snap.cue}`)));
        }
        if (snap.count >= target && !reachedSaid) {
          reachedSaid = true;
          if (voice) setTimeout(() => say(t('cam.reachedVoice')), 700);
        }
        if (snap.status === 'notVisible') setStatus(t('cam.notVisible'), 'warn');
        else if (snap.status === 'getReady') setStatus(t(`cam.getReady.${cfg.kind}`));
        else if (lastCue && now - lastCue.at < CUE_MS) setStatus(t(`cam.cue.${lastCue.cue}.${cfg.kind}`, {}, t(`cam.cue.${lastCue.cue}`)), 'cue');
        else if (snap.count >= target) setStatus(t('cam.reached'), 'good');
        else setStatus(t('cam.go'));
      };

      const tick = () => {
        if (closed) return;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime && video.videoWidth) {
          lastVideoTime = video.currentTime;
          const now = performance.now();
          try {
            const r = landmarker.detectForVideo(video, now);
            const lm = r.landmarks?.[0];
            const frame = lm ? { landmarks: lm, world: r.worldLandmarks[0], t: now, aspect: video.videoWidth / video.videoHeight } : { t: now };
            draw(lm);
            show(counter.update(frame), now);
          } catch {
            // a dropped frame is fine; keep going
          }
        }
        raf = requestAnimationFrame(tick);
      };
      setStatus(t(`cam.getReady.${cfg.kind}`));
      raf = requestAnimationFrame(tick);
    },
  });
}
