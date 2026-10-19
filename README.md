# Glidepath

[English](#english) | [中文](#中文)

> This is your captain speaking. Destination: your goal weight.
>
> 各位乘客，本次航班目的地：目标体重。

---

## English

A fat-loss coach that won't let you crash-diet. If your goal is too aggressive, it says no and offers safe paces instead. Then it coaches food, training and sleep together: log meals with a photo, follow a training plan that progresses on its own, and watch your weight trend instead of the daily noise. Mobile-first web app, installable to your home screen, in English and Chinese.

**Why "Glidepath"**: a glide path is the line an aircraft follows down to the runway, at a fixed, safe slope. Weight loss should work the same way: come down at a safe slope, touch down on your goal, then level off into maintenance.

> Glidepath is not a medical product and does not replace advice from a doctor or dietitian.

### What's in v1

- **Onboarding and a feasibility check**: height, weight, goal, target date, activity level, sleep schedule, diet, training setup, injuries, and an optional fitness test. If the goal is too fast, the app won't follow it. It offers 2–3 safe options instead: a steady pace, a faster pace, or keeping your date and reaching a milestone weight first.
- **Health screening**: under 18, pregnant or breastfeeding, a history of eating disorders, or a BMI already under 18.5 means no fat-loss plan, plus help resources. Diabetes medication, another medical condition, age 65+ or a BMI of 40+ means you confirm you'll check with a doctor first.
- **Food logging**: photo recognition (portion and calories for each item, shown as a range, every item editable by grams and cooking method), a built-in table of 112 common Chinese and Western foods, one-tap recent foods, custom entries, and "same as yesterday" for a meal.
- **Today**: calories left (on a ruler), protein progress, today's workout, weight, a steps and sleep check-in, and your 7-day average.
- **Weight trend**: daily dots, a 7-day average line and a goal line. When your trend moves about 1 kg, you're prompted to update your calorie target. Plateaus are explained. Once you reach your goal, you move to maintenance: calories rise by 150 kcal a week up to your maintenance level.
- **Training plan**: built from 28 exercises around your experience, equipment (home with nothing, home with dumbbells, or a gym), training days, session length and injuries. Each exercise has sets, reps, rest time and form cues. During a workout you tick off each set and a rest timer starts. Afterwards the plan progresses automatically (more reps, more weight, or a harder variation), and you can undo the most recent workout.
- **Demo photos**: 21 of the 28 exercises show start and end photos from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), alternating so you can see the movement.
- **Camera rep counting** for squats (bodyweight, pause, goblet, box) and push-ups (standard, knee, incline, wall): point your phone at yourself and it counts each full rep, says the count out loud, and when you save it fills in that set. Half reps don't count and get a "go deeper" cue; push-ups also get "don't let your hips sag" / "hips too high". When your joints are hard to see it keeps counting but stops judging form. Pose detection is [MediaPipe](https://github.com/google-ai-edge/mediapipe) running in the browser: video never leaves the device.
- **Safety signals**: three days in a row well under your safe minimum, or losing more than 1.5% of body weight a week after the first three weeks, triggers a gentle note and help resources.
- **"Where these numbers come from"**: the Me tab explains resting metabolism, daily burn, calorie target, safe minimum, protein, steps and sleep, one by one.
- **Also**: English and Chinese, kg / jin (斤) / lb, dark mode, PWA, export all your data, delete your account, and a demo account (four weeks of sample data, deleted after 24 hours).

#### Safety rules (in `public/js/core/plan.js`)

| Rule | Value |
|---|---|
| Fastest weekly loss | 1% of body weight (the "steady" pace is 0.5%) |
| Lowest daily intake | Never below resting metabolism, and at least 1200 kcal (women), 1500 (men), 1350 (other) |
| Goal weight | BMI of at least 18.5; lower goals are raised to the BMI 18.5 weight |
| Resting metabolism | Mifflin-St Jeor × activity factor (1.2 / 1.375 / 1.55 / 1.725) |
| 1 kg of fat | ≈ 7,700 kcal; dates are projected week by week, since your daily burn drops as you lose weight |
| Protein | 1.6–2.2 g per kg of goal weight |

The server checks these again when a plan is saved, so the browser can't get around them. A unit test runs 400 random body profiles to make sure no option ever breaks these limits.

### Run it locally

Needs Node.js 22.13 or newer. The database is Node's built-in SQLite (`node:sqlite`), so there's no native module to compile. Node 22 prints one "experimental" warning on start; it's safe to ignore.

```bash
npm install
npm start
# open http://localhost:3000
```

Without an API key, photo recognition runs in **demo mode**: it returns fixed sample results (clearly labelled) so you can try the whole flow.

#### Turn on real photo recognition

Use Claude (recommended) or OpenAI. Get a Claude key at platform.claude.com:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Then sign up for your own account; demo accounts always get sample results unless `DEMO_USES_AI=1`. The default model, Claude Haiku 5.5, is the fastest and cheapest Claude model: with photos shrunk to 1024 px, a photo costs roughly a tenth of a US cent.

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | empty | Claude key; used first when set |
| `ANTHROPIC_VISION_MODEL` | `claude-haiku-5-5` | e.g. `claude-sonnet-5-5` for harder photos (slower, about 20× the price) |
| `ANTHROPIC_EFFORT` | model default | `low` is faster and cheaper, `high` thinks more about portions |
| `OPENAI_API_KEY` | empty | OpenAI key, used when there is no Claude key |
| `OPENAI_VISION_MODEL` | `gpt-4.1-mini` | Change this if the model is retired or you want another |
| `OPENAI_IMAGE_DETAIL` | `auto` | `low` is cheaper, `high` reads portions more closely |
| `AI_PROVIDER` | automatic | `anthropic` or `openai` to choose when both keys are set |
| `RECOGNIZE_DAILY_LIMIT` | `30` | Photo recognitions per account per day |
| `DEMO_USES_AI` | `0` | Set to `1` to let demo accounts use the real model (costs money on a public site) |
| `DB_PATH` | `./data/glidepath.db` | Where the SQLite database lives |
| `TRUST_PROXY` | `0` | Set to `1` behind a proxy such as Render |
| `POSE_MODEL_URL` | Google's hosted Pose Landmarker (lite) | Where the browser downloads the pose model (about 6 MB) |
| `POSE_MODEL_FILE` | empty | Path to a local copy of the model; the server then serves it itself (useful where Google is blocked) |
| `PORT` | `3000` | |

Set a monthly spending limit in your Claude Console or OpenAI account. Photos are shrunk in the browser to 1024 px on the long side before upload, and discarded after recognition.

### Tests

```bash
npm test                          # 88 unit + API tests (math, safety rules, progression, rep counting, account isolation, the vision-model call…)
npx playwright install chromium   # once, before the first browser test run
npm run e2e                       # 15 end-to-end browser tests at phone size (signup, photo, search, weight, training, camera counting, language, screening, dark mode…)
SHOTS=shots npm run e2e           # also save a screenshot of each step to shots/
```

The rep-counting tests use real MediaPipe output: `test/fixtures/pose-frames.json` holds the landmarks the model found on the demo photos, so the unit tests check the thresholds against what the model actually sees. The camera end-to-end test plays squat photos through Chromium's fake camera and runs the real model in the page; it downloads the model from Google once (or uses `POSE_MODEL_FILE`) and is skipped if neither works.

### Deploy (Render)

`render.yaml` is included: on Render choose New → Blueprint → this repo → Apply. It deploys in demo mode; when you have a key, add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) under the service's Environment tab.

Note: Render's free plan sleeps after 15 minutes without visitors, and its disk isn't persistent, so **every restart or deploy wipes all accounts and logs in SQLite**. For real users, use a paid instance with a persistent disk and point `DB_PATH` at it (for example `/var/data/glidepath.db`).

### Project layout

```
server/
  index.js        Express app, security headers, static files
  api.js          all /api routes
  store.js        data access, plan creation, workout logging and progression
  ai.js           photo recognition (Claude or OpenAI vision model + demo results)
  demo.js         demo account with four weeks of sample data
  auth.js         scrypt passwords, sessions (stored in the database, so restarts don't log you out)
  db.js           SQLite schema (built-in node:sqlite) and transactions
public/
  js/core/        logic shared by browser and server: plan (plans and safety rules), nutrition,
                  foods (food table), trend (trend and safety signals), training (exercises and progression),
                  reps (camera rep counting: joint angles, rep state machine, form cues)
  js/camera.js    the camera counter screen; js/pose.js loads MediaPipe
  js/pages/       one file per screen
  img/exercises/  demo photos from free-exercise-db
  js/i18n.js      English and Chinese strings
  js/charts.js    weight trend and weekly intake charts (hand-written SVG)
  css/app.css
test/unit, test/api, test/e2e
```

### Data and privacy

- Passwords are hashed with salted scrypt; only a hash of each session token is stored.
- Every write request needs a custom header, which blocks cross-site request forgery. Cookies are HttpOnly and SameSite=Lax.
- Each account can only read and write its own data (covered by API tests).
- Camera counting runs entirely in the browser. Video frames are never uploaded or stored.
- "Export my data" downloads every record as JSON; "Delete account" removes the account and all its records.
- The database isn't encrypted at the application level. In production, keep it on an encrypted disk (most cloud disks are encrypted by default).

### Food data

The built-in food table is in `public/js/core/foods.js`. Calories, protein, carbs and fat per 100 g are typical values from USDA FoodData Central and common Chinese food-composition tables. Chinese dishes vary a lot (especially in oil), so treat them as a starting estimate. Photo and custom entries carry their own nutrition values.

### Help resources

Eating-disorder help lines are listed in `RESOURCES` in `public/js/pages/shared.js` (currently NEDIC in Canada and the National Alliance for Eating Disorders in the US). If you serve other regions, replace them with local resources.

### Next (v2 / v3)

- v2 (done so far): exercise demo photos; camera counting for squats and push-ups
- v2 (still to do): camera counting for lunges, jumping jacks and plank holds; a daily science card; weekly summaries; a larger food database (USDA FoodData Central); barcode scanning (Open Food Facts); voice logging
- v3: an iOS app (Expo / React Native) with HealthKit (sleep, steps, active energy) and AlarmKit; adaptive calories that work out your real daily burn from what you eat and how your weight changes

### License

MIT, see `LICENSE`. Third-party work (free-exercise-db photos, MediaPipe, the Archivo font) is listed in `THIRD_PARTY_NOTICES.md`.

### Font

Numbers and Latin text use [Archivo](https://github.com/Omnibus-Type/Archivo) (SIL Open Font License, see `public/fonts/OFL.txt`), self-hosted with no Google Fonts dependency. Chinese uses system fonts.

---

## 中文

一个**不会让你瞎减**的减脂教练。目标太急时它会直接说不，并给出安全的替代节奏；然后从饮食、训练、作息三方面一起管：拍照记饮食，按器材和时间安排会自动加量的训练，看体重趋势而不是每天的波动。网页应用，手机优先，可以“添加到主屏幕”，中英双语。

**为什么叫 Glidepath**：Glidepath 是飞机降落时的“下滑道”，按固定坡度安全地降到跑道上。体重也一样：按安全的坡度往下走，平稳落地，然后改平飞行，进入维持期。

> Glidepath 不是医疗产品，不能代替医生或营养师的建议。

### v1 有什么

- **建档 + 可行性检查**：身高、体重、目标、日期、活动量、作息、饮食偏好、训练条件、伤病、可选体能小测试。目标太急时不照做，而是给 2–3 个安全的替代方案（稳妥节奏 / 较快节奏 / 保留日期先到阶段目标）。
- **健康筛查**：未满 18 岁、怀孕或哺乳、进食障碍史、BMI 已低于 18.5 → 不生成减脂计划，并给出求助资源；用降糖药、有其他疾病、65 岁以上、BMI ≥ 40 → 需要确认会先和医生沟通。
- **饮食记录**：拍照识别（每样食物估分量和热量，显示范围，可逐项改克数和做法）、搜索内置食物表（112 种中西餐常见食物）、常吃一键添加、自己填、复制昨天的一餐。
- **今天**：还能吃多少（刻度尺）、蛋白质进度、今日训练、体重、步数和睡眠打卡、最近 7 天平均。
- **体重趋势**：每天的点 + 7 天平均线 + 目标线；体重变化约 1 kg 时提醒按新体重更新热量目标；平台期解释；到达目标后进入维持期（热量每周加 150 大卡，直到维持水平）。
- **训练计划**：按经验、器材（家里无器材 / 有哑铃 / 健身房）、每周哪几天、每次多久、伤病，从 28 个动作里生成；每个动作有组数、次数、休息时间和动作要点；训练时逐组打勾、自动组间休息倒计时；完成后按规则自动加量（加次数 / 加重量 / 换更难的变式），可以撤销最近一次。
- **动作示范图**：28 个动作里有 21 个配了起始和结束两张照片，来自 [free-exercise-db](https://github.com/yuhonas/free-exercise-db)（公有领域），两张交替显示，能看出动作怎么做。
- **摄像头计数**：深蹲（徒手、停顿、高脚杯、坐箱）和俯卧撑（标准、跪姿、上斜、扶墙）可以用摄像头数。手机对着自己，每做完整一次就数一下并念出来，保存后自动填进这一组。蹲得不够低的不算，会提示“再蹲低一点”；俯卧撑还会提示“臀部别塌”“臀部别翘太高”。关节看不太清时只计数、不判动作对错。姿态识别用的是 [MediaPipe](https://github.com/google-ai-edge/mediapipe)，在浏览器里本地运行，画面不会离开手机。
- **安全信号**：连续 3 天吃得远低于安全下限、或 3 周后每周减重超过体重 1.5% → 温和提示并给求助资源。
- **“这些数字怎么来的”**：在“我的”里逐条解释基础代谢、总消耗、热量目标、安全下限、蛋白质、步数和睡眠。
- **其他**：中英双语、单位支持公斤 / 斤 / 磅、深色模式、PWA、导出全部数据、删除账号、演示账号（4 周示例数据，24 小时后自动删除）。

#### 安全规则（写在 `public/js/core/plan.js`）

| 规则 | 数值 |
|---|---|
| 每周减重上限 | 体重的 1%（“稳妥节奏” 0.5%） |
| 每日摄入下限 | 不低于基础代谢，且女性 ≥ 1200、男性 ≥ 1500、其他 ≥ 1350 大卡 |
| 目标体重 | BMI 不低于 18.5，低于时自动调到 BMI 18.5 对应的体重 |
| 基础代谢 | Mifflin-St Jeor 公式 × 活动系数（1.2 / 1.375 / 1.55 / 1.725） |
| 1 kg 脂肪 | ≈ 7700 大卡；日期按体重下降后消耗也会下降来逐周估算 |
| 蛋白质 | 目标体重 × 1.6–2.2 克 |

服务器在保存计划时会重新检查一遍，前端改不了这些限制。单元测试里有 400 组随机身体数据的检查，保证没有任何方案超过上面的限制。

### 本地运行

需要 Node.js 22.13 或更新版本。数据库用的是 Node 自带的 SQLite（`node:sqlite`），不用编译任何原生模块；Node 22 启动时会打印一行 “experimental” 提示，可以忽略。

```bash
npm install
npm start
# 打开 http://localhost:3000
```

没有设置 API key 时，拍照识别是**演示模式**：返回固定的示例结果（会明确标出来），整个流程都能走通。

#### 开启真实的拍照识别

可以用 Claude（推荐）或 OpenAI。Claude 的 key 在 platform.claude.com 申请：

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

然后注册一个自己的账号再试；演示账号永远只给示例结果，除非设置 `DEMO_USES_AI=1`。默认模型 Claude Haiku 5.5 是最快最便宜的 Claude 模型，照片缩到 1024 像素后，一张大约 0.1 美分。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 空 | Claude 的 key；设置了就优先用 |
| `ANTHROPIC_VISION_MODEL` | `claude-haiku-5-5` | 比如换成 `claude-sonnet-5-5` 识别更难的照片（更慢，价格约 20 倍） |
| `ANTHROPIC_EFFORT` | 模型默认 | `low` 更快更便宜，`high` 估分量时想得更多 |
| `OPENAI_API_KEY` | 空 | OpenAI 的 key，没有 Claude key 时才用 |
| `OPENAI_VISION_MODEL` | `gpt-4.1-mini` | 模型下线或想换时改这里 |
| `OPENAI_IMAGE_DETAIL` | `auto` | `low` 更便宜，`high` 看分量更细 |
| `AI_PROVIDER` | 自动 | 两个 key 都有时，用 `anthropic` 或 `openai` 指定 |
| `RECOGNIZE_DAILY_LIMIT` | `30` | 每个账号每天最多识别几次 |
| `DEMO_USES_AI` | `0` | 设成 `1` 演示账号也会调用真实模型（公开网站上会花钱） |
| `DB_PATH` | `./data/glidepath.db` | SQLite 数据库位置 |
| `TRUST_PROXY` | `0` | 部署在 Render 等代理后面时设成 `1` |
| `POSE_MODEL_URL` | Google 托管的 Pose Landmarker（lite） | 浏览器从哪里下载姿态模型（约 6 MB） |
| `POSE_MODEL_FILE` | 空 | 本地模型文件的路径，填了以后由服务器自己提供（Google 打不开的地区用这个） |
| `PORT` | `3000` | |

建议在 Claude Console 或 OpenAI 后台设置每月花费上限。照片在浏览器里先缩小到最长边 1024 像素再上传，识别完就丢掉，不保存。

### 测试

```bash
npm test                          # 88 个单元 + 接口测试（计算、安全规则、训练进阶、动作计数、账号隔离、拍照识别的模型调用等）
npx playwright install chromium   # 第一次跑端到端测试前装一次
npm run e2e                       # 15 个浏览器端到端测试，手机尺寸（注册建档、拍照、搜索、体重、训练、摄像头计数、切换语言、筛查、深色模式…）
SHOTS=shots npm run e2e           # 顺便把每一步截图存到 shots/
```

动作计数的测试用的是 MediaPipe 的真实输出：`test/fixtures/pose-frames.json` 存的是模型在示范照片上识别出的关节点，单元测试拿它检查阈值是否符合模型实际看到的角度。摄像头的端到端测试用 Chromium 的假摄像头播放深蹲照片，在页面里跑真实模型；它会从 Google 下载一次模型（或者用 `POSE_MODEL_FILE`），两样都不行就跳过。

### 部署（Render）

仓库里有 `render.yaml`：Render 上选 New → Blueprint → 选这个仓库 → Apply。部署出来是演示模式；有了 key 以后，在服务的 Environment 页面加上 `ANTHROPIC_API_KEY`（或 `OPENAI_API_KEY`）。

注意：Render 免费版 15 分钟没人访问会休眠，而且硬盘不持久，**重启或重新部署会清空 SQLite 里的所有账号和记录**。给真实用户用，需要付费实例 + 持久盘，并把 `DB_PATH` 指到盘上（例如 `/var/data/glidepath.db`）。

### 结构

```
server/
  index.js        Express 应用、安全头、静态文件
  api.js          所有 /api 接口
  store.js        数据读写、建计划、记训练和进阶
  ai.js           拍照识别（Claude 或 OpenAI 视觉模型 + 演示结果）
  demo.js         演示账号和 4 周示例数据
  auth.js         密码 scrypt、登录会话（存在数据库里，重启不会掉线）
  db.js           SQLite 表结构（Node 自带的 node:sqlite）和事务
public/
  js/core/        浏览器和服务器共用的逻辑：plan（计划和安全规则）、nutrition、foods（食物表）、
                  trend（趋势和安全信号）、training（动作库和进阶）、reps（摄像头计数：关节角度、计数状态机、动作提示）
  js/camera.js    摄像头计数页面；js/pose.js 负责加载 MediaPipe
  js/pages/       各个页面
  img/exercises/  free-exercise-db 的示范图
  js/i18n.js      中英文案
  js/charts.js    体重趋势图、每周摄入柱状图（手写 SVG）
  css/app.css
test/unit, test/api, test/e2e
```

### 数据和隐私

- 密码用 scrypt 加盐哈希；登录会话的 token 只存哈希值。
- 所有写操作都要带自定义请求头，挡住跨站请求伪造；Cookie 是 HttpOnly + SameSite=Lax。
- 每个账号只能读写自己的数据（有接口测试覆盖）。
- 摄像头计数完全在浏览器里完成，画面不会上传，也不会保存。
- “导出我的数据”下载全部记录（JSON），“删除账号”会删掉账号和所有记录。
- 数据库本身没有在应用层加密：生产环境请把数据库放在加密的磁盘上（大部分云主机的磁盘默认加密）。

### 食物数据

内置食物表在 `public/js/core/foods.js`，每 100 克的热量、蛋白质、碳水、脂肪取自 USDA FoodData Central 和常见中国食物成分表的典型值；中式菜品差别很大（尤其是油），所以只当起点估算。拍照和自己填的食物会带上自己的营养数据。

### 求助资源

进食障碍求助热线写在 `public/js/pages/shared.js` 的 `RESOURCES` 里（目前是加拿大 NEDIC 和美国 National Alliance for Eating Disorders）。如果面向其他地区的用户，请改成当地的资源。

### 之后（v2 / v3）

- v2（已完成）：动作示范图；深蹲和俯卧撑的摄像头计数
- v2（还没做）：弓步、开合跳的摄像头计数和平板支撑计时；每日科学知识卡片；每周总结；更大的食物库（USDA FoodData Central）；条形码扫描（Open Food Facts）；语音记录
- v3：iOS app（Expo / React Native）接 HealthKit（睡眠、步数、活动能量）和 AlarmKit；用实际摄入和体重变化反推真实消耗的自适应热量

### 许可证

MIT，见 `LICENSE`。用到的第三方内容（free-exercise-db 示范图、MediaPipe、Archivo 字体）写在 `THIRD_PARTY_NOTICES.md` 里。

### 字体

数字和英文使用 [Archivo](https://github.com/Omnibus-Type/Archivo)（SIL Open Font License，见 `public/fonts/OFL.txt`），本地托管，不依赖 Google Fonts；中文使用系统字体。
