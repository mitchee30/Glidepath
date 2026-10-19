// Loads MediaPipe Pose Landmarker once and reuses it.
// The JS bundle and WebAssembly come from our own server (/vendor/mediapipe, served
// from node_modules/@mediapipe/tasks-vision); the model comes from `modelUrl`.
// Everything runs on the device: no video frames leave the browser.

let pending = null;

export function loadPose(modelUrl) {
  if (!pending) {
    pending = (async () => {
      const vision = await import('/vendor/mediapipe/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try {
        return await vision.PoseLandmarker.createFromOptions(files, options('GPU'));
      } catch {
        return vision.PoseLandmarker.createFromOptions(files, options('CPU'));
      }
    })();
    pending.catch(() => { pending = null; });
  }
  return pending;
}
