# Third-party notices

Glidepath is MIT-licensed (see `LICENSE`). It includes or loads the following third-party work.

## Exercise demo images: free-exercise-db

- Source: https://github.com/yuhonas/free-exercise-db
- License: The Unlicense (public domain)
- Used for: the start/end demo photos in `public/img/exercises/`, resized and recompressed.
  The mapping from Glidepath exercises to free-exercise-db entries is in `public/js/core/training.js` (`demo`).

## Pose detection: MediaPipe Tasks Vision

- Source: https://github.com/google-ai-edge/mediapipe (npm package `@mediapipe/tasks-vision`)
- License: Apache License 2.0
- Used for: on-device body pose detection for camera rep counting. The JavaScript bundle and
  WebAssembly files are served from `node_modules/@mediapipe/tasks-vision` at `/vendor/mediapipe/`;
  they are not modified.
- Model: Pose Landmarker (lite), loaded in the browser from Google's model storage by default
  (`POSE_MODEL_URL` changes this). See the MediaPipe model card for its terms.

## Font: Archivo

- Source: https://github.com/Omnibus-Type/Archivo
- License: SIL Open Font License 1.1 (see `public/fonts/OFL.txt`)

## Food data

- Built-in food values are typical values based on USDA FoodData Central (public domain / CC0)
  and common Chinese food-composition tables.
