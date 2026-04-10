# agent 协同开发对话纪要

**10 秒速览**（首次阅读可先扫此处；细节见各节与 [`README.md`](../README.md) 文档索引）：

1. **两条技术线**：**`pet-web/`**（Tauri + WebView + Spine 官方 JS 运行时）为**桌宠产品**；**`src/star_rail_pet/`**等为 **Python 自研网格预览**（能力子集）。**共用** `assets/argenti/`，经 **`pet-web` 的 `npm run sync-assets`** 同步到 **`public/argenti/`**。
2. **开发重心**：**新功能、日常迭代以 `pet-web` 为准**。**Python 线已搁置**（不作新功能承载，入口仍保留作可选预览/对照，见 [`README.md`](../README.md)）。
3. **资源主数据**：网格与桌宠以 **Spine `1302.1a88ff13.json` + `1302.atlas` + `1302.png`** 为准；**`*_ske.json`** 多用于 DragonBones **线框**工具，勿与 Spine mesh 逻辑混用。
4. **透明桌宠关键**：**`preserveDrawingBuffer`** + **`readPixels`** 像素命中；整窗穿透时 WebView 常收不到 `mousemove` → **`tauriPointerTick` 轮询** + **`setIgnoreCursorEvents`**；番茄面板/右键菜单矩形需纳入命中。
5. **表情与时间**：**`?cycle`** —浏览器默认关轮播（`?cycle=1` 开），**Tauri 默认开**（`?cycle=0` 关）。番茄台词期 **`isSpeechLocked()`** 冻结 **`__cycleTick`** 与倒计时扣减（以代码为准）。
6. **交互产品规则**：流汗 / 星星眼 / 说话优先级、TTL、统一 **`setAnimation(0,…)`** 仲裁 → **`docs/交互与表情仲裁设计.md`**、**`docs/交互进阶规划摘要.md`**（部分已落地，部分为演进目标）。
7. **本文定位**：按**主题**归纳工程结论与踩坑，**非**时间线对话实录；导航与文档清单以根目录 **README** 为准。

---

## python处理spine素材

- **格式**：`*_ske.json` 为 DragonBones，当时 skin 近乎空，无法拼部件；**Spine 4.2 的 `1302.1a88ff13.json` + `1302.atlas` + `1302.png`** 才是网格/UV 数据源；`images/` 散图不自动对 mesh，除非改 UV 或重打 atlas。
- **预览**：`preview_skeleton` 只画骨骼；`preview_spine_character` 分 **mesh（OpenGL+骨骼）** 与 **bitmap（整图缩放）**；`preview_skeleton` 用 **延迟 import pygame** + **`--summary-only`** 避免无图形环境刷屏。
- **UV 坑**：mesh 的 uvs 是 **regionUVs**，须按 atlas 的 offsets、original 尺寸、**rotate** 按官方 `spMeshAttachment_updateRegion` 思路换算到整页纹理；用 bounds 硬映射会 **错层、色块、邻格采样**。
- **糊/糊边**：多因 **atlas `scale` 小、PNG 分辨率低**；`--nearest` 只改过滤，不能代替高清导出；**pma:true** 需预乘混合。
- **身形扁**：**glOrtho 的 X/Y span 相同** 而窗口非正方形时，Y 被压扁；用 **正交范围宽高比 = 视口宽高比**（如 `ortho_size_match_viewport`）纠正。

### 动画与时间轴（`--anim`）

- **「7 段」**：同一 Spine JSON 里的 **7 条动画剪辑**（`idel`、`emoji_0`…`emoji_5`），共享同一套图集与骨骼；换导出则数量/名字会变。
- **自研预览能力**：`--anim` 对骨骼 **rotate/translate/scale/shear** 做时间采样与线性插值；**未实现** slot 显隐换图、贝塞尔曲线、IK、网格形变 —— 以骨骼为主的 `idel` 较准，依赖换附件的 emoji 可能「几乎不动」。
- **踩坑（脸与躯干不同步）**：资源里 Transform 约束常 **省略 `mixY`（与 `mixX` 相同）**；若解析时把缺省 `mixY` 当 **0**，则只做世界 X 混合、**Y 不跟随**，呼吸时会出现 **脸晚半拍**；应与官方一致：**`mixY` 缺失时用 `mixX`**。



## 架构规划与内存优化

### 官方运行时与并行架构

- **社区封装**（如基于 spine-ts 的播放器）仍是 **官方骨骼/附件/曲线语义 + API 封装**，与 **纯 Python 自研网格** 是两条线；**无官方 pip 版** Python 运行时，纯 Python 要么维持子集实现，要么自绑 **spine-c**。
- **交互**（输入 → 状态 → 表现）各栈同类问题；**动作完整度**上，官方 Web/引擎运行时更易覆盖 **slot、曲线、IK** 等，自研预览缺能力时会表现为「部分 emoji 几乎不动」等——**瓶颈多在数据与播放器完整度**，而非「换框架就只能呼吸 + 跟鼠标」。
- **本仓库落地**：保留 **`src/star_rail_pet` 等 Python 工具**；并列 **`pet-web/`（Vite + TS + `@esotericsoftware/spine-core` / `spine-webgl` 4.2）** 与 **`pet-web/src-tauri/`**；**`pet-web/scripts/sync-assets.mjs`**（经 **`npm run sync-assets`**）将 **`assets/argenti`** 同步到 **`pet-web/public/argenti`**，与 Python 同源。
- **分发合规**：集成 **Spine Runtimes** 须遵守 **Esoteric** 许可条款（通常与编辑器授权等相关），二创发布前自行核对。

### 包体与常驻内存（定性）

- **Electron**：自带 Chromium，**安装包与常驻内存通常最大档**（常见百余 MB 级安装包、数百 MB 级内存量级，随版本波动）。
- **Tauri**：使用 **系统 WebView**，**壳体积常明显小于 Electron**，常驻内存通常 **低于同复杂度 Electron**（仍随页面与 WebView 波动）。
- **Python 打包**（PyInstaller 等）：解释器 + 依赖打入，**体积与内存不一定低于 Tauri**，以 **Release 实测**为准。
- **资源**：**PNG 磁盘大小 ≠ GPU 纹理占用**；抠下载体积时 **压图 / 分辨率 / atlas 导出** 往往与「换壳」同样关键。
- **多角色（规划）**：安装包可尽量只带 **壳 + 公共代码**（及可选 **一个默认角色**）；其余角色 **按需从 HTTPS/对象存储拉取** 到 **应用数据目录**，解压后按 **角色 id** 分文件夹存放。常驻 **内存/显存** 主要随 **当前已加载角色** 与 **当前窗口渲染面积** 变化（与 **`preserveDrawingBuffer: true`** 下帧缓冲可读性相关）；切换角色时 **卸载上一套再加载** 可比 **多实例同时驻留** 更省。产品形态与目录约定见 **「动态与交互进阶」**。

### 依赖锁与供应链（`pet-web`）

- **攻击面**：当前直接依赖少（Spine 官方包、Tauri CLI、Vite、TypeScript），**无 axios 等宽 HTTP 依赖**；与典型「依赖链恶意 axios」场景不同。
- **已锁两层**：**`pet-web/package-lock.json`（lockfile v3）** 锁定整棵依赖树，含 **`resolved` + `integrity`（sha512）`**，安装时校验 tarball；**`src-tauri/Cargo.lock`** 锁定 Rust 依赖，**桌面应用应随仓库提交**。
- **`package.json` 的 `^` / `~`** 仍是**允许升级的范围**；**实际安装版本以 lock 为准**。防版本漂移：**优先 `npm ci`**（在锁已提交且可信的前提下），**避免删锁、避免随手 `npm install` / `npm update` 重解析**；升级应**有意修改 `package.json` 并重新生成、提交锁文件**。Rust 侧可用 **`cargo build --locked`**（与 `Cargo.lock` 不一致则失败），适合 CI。
- **审计**：`npm audit` 依赖 registry 能力；默认 **npmmirror** 等镜像可能无法审计，可对齐官方源例如 **`npm audit --registry https://registry.npmjs.org/`**（结果随时间变化，发版前重跑）。若锁内 `resolved` 指向镜像，需要时也可用 **`npm ci --registry https://registry.npmjs.org/`** 与官方解析对照。
- **极端降风险**：**`npm ci --ignore-scripts`** 可跳过生命周期脚本，但可能破坏 Tauri/Vite 链，**非默认可选**，需知后果再用。

### 文件拆分与工程演进

- **为何拆**：单文件承载过多职责（Python 侧预览循环与骨骼/网格/GL 揉在一起；`pet-web` 侧 Spine 生命周期、穿透、番茄钟、轮播、拖窗同挤入口）时，**可读性与回归成本**先于「行数」成为瓶颈；加交互（仲裁、窗体 `vy`、抚摸能量等）会放大**事件顺序与闭包耦合**风险。素材**入仓**（`assets/argenti`）与**双栈共用路径**也要求目录先定型。
- **过程（两次）**  
  1. **Python**：依 **`docs/架构规划.md`** 将大文件拆为 **`src/star_rail_pet/`**（`spine/`、`render/`、`anim/`、`preview_entry` 等），**`tools/`** 作薄入口；资源落到 **`assets/argenti/`**，与后续 **`sync-assets` → `pet-web/public/argenti`** 一致。  
  2. **`pet-web`**：依 **`docs/前端模块拆分与交互落地规划.md`** 做 **阶段 A**——仅搬迁与接线（如 **`spine/canvasApp.ts`**、**`pomodoro/*`**、**`tauri/pointerLoop.ts`**、**`ui/contextMenu.ts`**），**`main.ts`** 保留组装；**阶段 B** 再按 **`docs/交互与表情仲裁设计.md`** 接新交互，避免「拆」与「加」同一批提交里纠缠。
- **教训**：**先写规划、再改代码**；阶段 A 结束用 **tag / 回归清单** 验收，后续问题可区分是 **拆分回归** 还是 **新逻辑**。**禁止**大拆分与功能开发并行，否则难以定位行为漂移。子阶段表、文件级映射以 **上述两份专题 md** 为准，本节只记原则与互见。



## tauri使用官方运行时实现动图

与 **Python 网格预览** 共用 **`assets/argenti`**（经 `sync-assets` → `pet-web/public/argenti`），**资源文件本身一致**；下列为 **WebGL 官方运行时侧** 与 Python 对齐时踩过的坑（非改 JSON/PNG 能解）。

- **预乘 alpha（PMA）与直链 alpha**：`1302.atlas` **无 `pma:`** 时按 **直链（非 PMA）** 导出；Python 侧对非 PMA 使用 **`GL_SRC_ALPHA` / `GL_ONE_MINUS_SRC_ALPHA`**。若 `spine-webgl` 里 **`drawSkeleton(skeleton, true)`**（按 PMA 混合），会对直链 RGBA 误混，表现为 **透明边发白、高光/星星周围色块晕开、局部色相偏**（头发星星、眼眶、盔甲等）。应与图集一致：**`drawSkeleton(skeleton, false)`**。若图集将来带 **`pma:true`**，再改回 PMA 路径。
- **呼吸时轻微左右晃**：Python **`gl_preview`** 用 **首帧（或进入循环前）** 算好的包围范围固定正交投影，**机位不随动画变**。若 Tauri 端 **每帧 `fitCamera` 且用当前 `skeleton.getBoundsRect()` 居中**，呼吸导致网格 AABB 在 **X 向微变** 时，相机会 **跟着改 `position.x`**，视觉上像整体横移。做法：在 **`setToSetupPose()` + `updateWorldTransform` 之后采一次** 包围盒，得到 **`stableMidX` / `stableMidY`（及用于缩放的宽高）**，后续 **`fitCamera` 只基于该稳定值**，仅随 **canvas 尺寸** 调 viewport/zoom（与 Python「机位不跟每帧 AABB」一致）。若需与 **某动画 t=0** 对齐而非 setup pose，可改为在首帧有效 pose 后再抓一次稳定包围盒。
- **残余缝/细线渗色**：在 PMA 与相机修正后若仍有轻微问题，多与 **`filter: Linear`** + **低分辨率图集（如 `scale:0.2`）** 采样到邻格有关；Python 默认同样 Linear，可用 **`--nearest`** 对比；Web 端需时再按 atlas/开关改纹理 **MIN/MAG FILTER**。



## 需求与产品边界

本节为 **动功能模块之前** 的共识：界定 **无编辑器/仅靠现有导出** 能做什么、**表情与轨道策略**，避免把「规划」当成「素材里已有」。**多角色、按需资源、输入与时间轮播合并** 等产品化扩展见 **「动态与交互进阶」**；细则与优先级见 **`docs/交互与表情仲裁设计.md`**、**`docs/交互进阶规划摘要.md`**。

### 无 Spine 编辑器时的能力边界

- **高可行（程序 + 现有 JSON）**：待机 **`idel`** 照常播；在其上或单独用代码做 **小幅平移/旋转**（呼吸感、跟光标偏头、点击冲量、假走/假起立等 **近似**）；核心是 **运行时改骨骼 + 状态机**，不必再在 Spine 里导出一段新 animation。
- **低～中可行**：与编辑器里同等复杂的 **全身表演、大量 slot/曲线/网格形变**；无编辑器时靠 **手改 JSON** 或纯凑程序 **调试成本极高**。
- **坐立、步态**：若导出里 **没有** `sit` / `walk` 等动画，**程序无法「算」出好看的全套关节表演**；要么 **换新资源/正版导出**，要么接受 **根骨平移 + bobbing 类假动作**。
- **试用版导不出**：卡住的是 **在编辑器里新建并导出**；桌宠级 **点击会动、跟鼠标、简单表情** 仍可通过 **运行时骨骼 +（可选）换附件** 实现，与能否导出无必然关系。

### 素材里「确定有什么」（以本仓库 `1302` 导出为准）

- **可点名播放的动画共 7 条**：**`idel`** + **`emoji_0`…`emoji_5`**；换资源则数量与命名会变。
- **语义核对（与作者展示及数据对照）**：**`emoji_2`** 偏 **流汗**；**`emoji_5`** 偏 **说话**（嘴部附件与形变较多）；**`emoji_1`** 多为 **0 时刻换附件的「静态笑」**，不像带过程的表演；**`emoji_0` / `emoji_3` / `emoji_4`** 在数据上可视为 **同一段的重复存储**，不宜当作三种独立设计。
- **「跟鼠标」「单独眨眼」**：通常 **不是** JSON 里单独一条动画名；实现上归为 **程序改骨（如 `左看右看`）** 或 **slot/透明度/附件**（需在运行时支持程度与官方 Web 对齐时再验）。

### 多动作组合与轨道策略（桌宠 MVP）

- **双轨叠加**（如 track0=`idel`、track1=表情）：仅当上层动画 **不覆盖** 呼吸依赖的骨骼/slot 时，才容易得到「一边呼吸一边表情」；若表情轨 **改掉躯干/全身相关属性**，会出现 **切表情就没有上下起伏**——属数据与混合范围问题，不是「实现错了」一种解释就能消掉。
- **单轨串行**（仅 **track0**：定时 **`idel` ↔ emoji ↔ `idel`**，配 **`setMix`**、可用 **`addAnimation` 排队**）：**实现简单、行为可预期**，**包体/内存与单双轨几乎无关**；作为 **MVP 与后续 Git 按功能拆分** 的默认路径；待确认个别 emoji **只动局部** 后，再考虑 **双轨叠加** 或更细混合。
- **与当前实现方向**：表情仲裁采用 **单轨道 `track0` + 优先级/TTL** 等做法时，与本节 **单轨优先** 一致；番茄钟说话等 **高优先级独占** 见 **`docs/交互与表情仲裁设计.md`**。

### 资源来源与合规（产品侧自担）

- 行业常规范式为 **分层原画 → Spine 绑骨与网格 → K 动画 → 导出**；民间流通的 `json`/`atlas`/`png` 多为 **客户端或网页活动资源链路末端的导出**，具体来源因分享者而异。
- **著作权与平台规则**（自用 / 社区分享 / 商用）须 **自行评估**；技术选型不替代合规判断。



## 动态切换状态机

介于 **「需求与产品边界」**（能做什么、单轨策略）与 **「根据鼠标偏头 / 隐藏背景与穿透 / 可拖拽」等具体交互** 之间：专门收 **角色随时间、随输入该怎么切动画** 的一层——含 **轮播、优先级、触发条件、TTL、与 `idel` 的自然衔接** 等。实现上可与 **`pet-web/src/spine/canvasApp.ts`**（及后续拆出的仲裁模块）对应；**规则表与优先级约定**以 **`docs/交互与表情仲裁设计.md`** 为准，本节纪要只记 **结论与演进阶段**。

- **MVP（时间驱动轮播）**：**单轨道 `track0`**；**`idel` 停留**：当前实现为 **`randRange(3, 5)` 秒**（便于联调时可缩短；稳定后可再拉长）→ 仅在 **`idel` 循环接近起点**（**`idleEntryPhaseNearStart(0.08)`**，约 **0.08s** 窗口）时切入随机表情 → 按 **`emojiDur`** 持有各 emoji → **`AnimationStateData.setMix`** **`idel` ↔ emoji** 均为 **0.16s**；**浏览器** 默认 **关闭** 轮播，需 **`?cycle=1`** 开启；**Tauri** 默认 **开启** 轮播，需 **`?cycle=0`** 关闭（见 **`pet-web/src/main.ts`** 中 **`cycleMode`**）。
- **与目光层耦合**：轮播 **`setAnimation` 会每帧改写骨骼基准**；若目光在骨上 **累加偏移且不每帧撤销**，会出现 **低头不复原、越叠越大**。目光实现须 **先减掉上一帧已施加的 `appliedYawDeg` / `appliedYOffset` 再写回**（见 **「根据鼠标偏头」**）。已知 **表情切回 `idel` 时略跳** 等问题可后续再调 **mix / 切换窗口**。
- **进阶（开发中）**：在 MVP 上叠加 **表情优先级**（如说话独占）、**触发条件**（拖拽速度、抚摸能量等）、**冷却与残留锁**，仍建议 **单轨仲裁后统一 `setAnimation(0, …)`**，避免多轨覆盖冲突；落地后在此节补 **状态枚举 / 信号来源 / 与番茄钟的互斥** 等摘要。
- **输入驱动与时间轮播的合并**：**先经统一仲裁器**，再决定是否允许 **时间轮播（如 `__cycleTick`）** 在当帧改写 `track0`；具体优先级、TTL、`talkUntil` 内短路等以 **`docs/交互与表情仲裁设计.md`** 为准。



## 根据鼠标偏头

**性质**：**程序目光**（procedural），**不依赖** JSON 里单独一条「跟随鼠标」动画；骨架上已有 **`左看右看`** 等控制骨即可在 **官方运行时** 上每帧小幅度驱动。**实现**：**`pet-web/src/ui/gaze.ts`**；在 **`pet-web/src/spine/canvasApp.ts` 的 `update`** 里顺序为 **`animState.apply(skeleton)` → `applyGazeToSkeleton` → `skeleton.updateWorldTransform`**。

- **输入**：**浏览器** 用 **`mousemove`** 更新光标在 canvas 内像素；**Tauri** 由 **`createTauriPointerLoop`**（`cursorPosition` / `innerPosition` / `scaleFactor`）换算客户区坐标后调 **`syncGazeFromClient`**（与 **`gaze.ts`** 注释一致：**唯一写入 `mx`/`my`/`active` 的入口**）。
- **算法**：`screenToWorld` 得鼠标世界坐标；相对骨 **`worldX`/`worldY`** 算 **`dx`/`dy`**，映射到目标 **`targetYaw`/`targetPitch`**（当前代码用 **`-dx/260`、`-dy/420`** 与 **`maxYawDeg: 5`、`maxPitchDeg: 2`** 裁剪）；光标在画布外时目标为 0；**`yawDeg`/`pitchDeg`** 用 **`lerpExp`**（**`followK: 10`**）平滑；竖直分量以 **`pitchDeg * 0.6`** 写到骨的 **`y`**，水平写到 **`rotation`**。
- **开关**：URL **`?gaze=0`** 关闭；默认开启（`gaze !== "0"`）。
- **踩坑（累加爆炸）**：曾对 **`rotation`/`y` 做「只加不减」的累加**，会 **越转越歪、整头绕颈**；或动画每帧改基准后 **继续叠偏移** → **低头不复原、隔一段时间更低**。**正确做法**：每帧在施加新偏移前 **`b.rotation -= appliedYawDeg`、`b.y -= appliedYOffset`**，再写入本帧 **`yawDeg`** 与 **`wantYOffset`**，并更新 **`appliedYawDeg`/`appliedYOffset`**，保证相对 **当前 `apply` 结果** 只有 **一层** 程序偏移。**不宜**在 **`mouseleave` 上粗暴清零 applied** 却不在同一帧完成平滑收回，易 **卡在异常姿态**（与上述撤销逻辑二选一、以撤销再算为准）。
- **左右/上下反了**：骨链初始朝向会导致屏幕直觉相反；通过 **对 yaw/pitch 映射取反**（当前为 **`targetYaw`/`targetPitch` 前带负号的 dx/dy 组合）对齐 **「鼠标在哪边，头往哪边」**；若仍单轴反了可 **只翻一个轴**。
- **后续**：可改为 **只动更靠近眼的骨** 减轻整头扭转感；**轮播切回 `idel` 的轻微跳变** 与 **呼吸段内偶发不自然** 可再调 **混合时长 / 切点窗口**（见 **「动态切换状态机」**）。



## 可拖拽

**以下五节固定顺序、固定标题**：**可拖拽** → **隐藏背景与穿透判定** → **放缩** → **番茄钟（Pomodoro）MVP** → **动态与交互进阶**。  
**分工**：**可拖拽**—挪窗与排除 UI；**隐藏背景与穿透判定**—透明桌宠、边框与调试层、`setIgnoreCursorEvents`、空白区穿透与像素命中；**放缩**—窗口 `LogicalSize` 与相机 `zoom`；**番茄钟**—专注计时、`beginSpeech`/`isSpeechLocked`、面板/气泡/右键菜单与 **`pointerLoop`** 穿透协同（见 **「番茄钟（Pomodoro）MVP」**）；**动态与交互进阶**—输入→状态机→`setAnimation` 等产品化扩展。实现上共享 **`hitTestAtClientPoint`**（**`pet-web/src/spine/hitTest.ts`**）与客户区坐标。

### 当前实现（落点）

- **无标题栏挪窗**：**`@tauri-apps/api/window`** 的 **`getCurrentWindow().startDragging()`**（**`pet-web/src/main.ts`**，`pointerdown`）。**仅当 `isTauri` 为真** 时调用；**浏览器无系统窗口可拖**，只能验证命中与光标。
- **「只拖角色本体」**：**番茄面板 / 角色右键菜单** 区域 **不触发**；其余位置须 **`hitTestAtClientPoint`**（**`readPixels` α > 8**，依赖 **`preserveDrawingBuffer`**）才拖——**像素命中**，比纯 **`getBoundsRect()` AABB** 更贴「点到不透明才算本体」。**拖前** **`disableBackgroundClickThrough()`**，与 **「隐藏背景与穿透判定」** 一致。
- **环境判断**：**`pet-web/src/tauri/env.ts`** — **`isTauri = !!__TAURI_INTERNALS__ || !!__TAURI__`**。**勿只认 `window.__TAURI__`**：Tauri **v2** 常见只注入 **`__TAURI_INTERNALS__`**，误判会导致 **桌宠窗口里仍走非 Tauri 分支**，表现为 **`startDragging` 从不执行**。

### 摸索过程

1. 非官方/猜测的全局取窗 → 常拿不到 **`startDragging`**。  
2. 改为官方 **`getCurrentWindow().startDragging()`** 后仍失败 → 转向 **权限、远程源、`isTauri` 误判**。  
3. 试过 **`data-tauri-drag-region`**与骨骼包围盒对齐的 DOM 层 → 部分 WebView **原生拖拽区与 JS `pointer` 分发冲突**；且须用 **`canvas.getBoundingClientRect()`** 与 **canvas 内部尺寸** 做比例映射，否则覆盖层相对角色 **整体偏移**。  
4. **`capabilities`**：必备 **`core:window:allow-start-dragging`**；**`tauri dev`** 加载 **`devUrl`** 时须在 **`default.json`** 的 **`remote.urls`** 中 **允许对应 `http://localhost:…`**，否则 **IPC 禁用**，**静默拖不动**。  
5. **根因收敛**：桌宠窗口里仍 **`__TAURI__=false`**、调试文案不更新 → **`isTauri` 判错**；改为 **`INTERNALS || __TAURI__`** 后正常。  
6. **收尾**：去掉 **`debugDrag` / 冗余诊断**；**当前**以 **`main.ts` 像素命中 + `startDragging`** 为准。

### 互见

**「隐藏背景与穿透判定」**、**「放缩」**。



## 隐藏背景与穿透判定

**目标**：**透明背景**不挡桌面；**仅银枝绘制像素** 参与命中（手型、点击、拖窗）；**去掉** 银色/灰色装饰边与顶层调试字。

### 窗口与画面（非网页 CSS 独有）

- **`pet-web/src-tauri/tauri.conf.json`**：**`transparent: true`**、**`decorations: false`**、**`alwaysOnTop: true`**；**`resizable: false`** 减少 Windows 对无边框透明窗的 **可缩放边缘**（浅灰/银边来源之一）；**`shadow: false`** 关闭 DWM **阴影/细线**（Tauri schema 亦提示未装饰窗在 **`shadow: true`** 下可能出现 **1px 类边缘**）。
- **前端**：**`style.css`** 中 **`body` 透明**；**`#status`** 等可用 **`display: none`** 去掉顶层字条。**WebGL** 每帧 **`sp.clear(0,0,0,0)`**（见 **`canvasApp`**），与透明窗一致。

### 穿透 API 与策略

- **`getCurrentWindow().setIgnoreCursorEvents(ignore)`**，封装为 **`pet-web/src/tauri/pointerPassthrough.ts`** 的 **`setIgnoreCursorEventsSafe`**（**去重 + 防并发**）。
- **默认思路**：**透明空白区穿透**（`true`），**点到角色像素** 时 **关闭穿透**（`false`），才能 **`pointerdown` / `startDragging`**。**番茄面板 / 角色右键菜单** 上 **始终不穿透**。
- **轮询（`createTauriPointerLoop`，约33ms）**：**`cursorPosition` + `innerPosition` + `scaleFactor`** → 客户区坐标 → **`hitTestAtClientPoint`**（**`pet-web/src/spine/hitTest.ts`**）。**原因**：整窗 **`setIgnoreCursorEvents(true)`** 时 WebView **往往收不到 `mousemove`**，无法用纯前端事件判断「是否悬在角色上」；用 **全局光标** 拉取是 **JS + 官方 API** 下最常见、跨平台成本较低的折中。**替代路径**：不做整窗穿透（则背景仍会挡桌面）；或 **Win32 形状区域/钩子**（原生工作量大）。工程上可加 **降频、迟滞、拖拽中暂停切换** 减轻闪烁。

### 像素命中前提（易踩坑）

- **本仓库 `1302` 导出无 BoundingBox 附件** → **不能用** **`SkeletonBounds.containsPoint` 类「轮廓多边形」** 做精细命中 → **以 `gl.readPixels(1×1)` 的 α 阈值**（当前 **> 8**）判定是否落在 **已绘制角色像素** 上。
- **`webglConfig: { preserveDrawingBuffer: true }`**（**`SpineCanvas` 创建处**，如 **`canvasApp`**）**必须开启**；否则默认缓冲下 **`readPixels` 常为 0** → **永远判未命中** → **整窗一直穿透**、角色也无法点拖。

### 开发期能力

- **`devUrl` 端口若变**（如 Vite 换端口），**`src-tauri/capabilities/default.json`** 的 **`remote.urls`** 须 **包含当前 `http://localhost:…`**，否则 IPC/窗口 API 异常（与 **「可拖拽」** 中 **`startDragging` 白名单** 同源问题）。

### 互见

**「可拖拽」**；**「放缩」**；**`docs/交互与表情仲裁设计.md`**（穿透与像素命中产品约定）；**`docs/交互进阶规划摘要.md`**（信号分离与实现顺序速览）。



## 放缩

### 概念澄清

- **「960×800」**：指 **Tauri 主窗口逻辑尺寸**（**`tauri.conf.json`** 的 **`maxWidth`/`maxHeight`** 与 **`setSize` 目标**），**不是** 历史调试用的 DOM 绿框、也不是骨骼在世界单位里的身高。
- **桌宠约束**：要 **完整看到角色**，要么 **窗口长期够大（固定大卡）**，要么 **放大时窗口跟着变大（动态窗）**。只缩角色不拉大窗，大到一定程度必 **裁切**——几何上无法兼顾「小窗常驻」与「无限放大仍全显」。

### 方案取舍（实践结论）

- **固定大卡（方案 1）**：实现最简、命中最稳，但 **常驻渲染面积** 长期按最大窗算，**WebView + WebGL**（尤其 **`preserveDrawingBuffer: true`**）成本偏高。
- **动态窗（方案 2，当前）**：**默认小窗省显存/缓冲**；**放大** 时再 **`setSize`** 逼近 **960×800** 封顶。代价是 **resize 过程中** canvas/布局/相机若不同步，**像素命中与穿透** 易抖（见 **「隐藏背景与穿透判定」** 中轮询与迟滞；本仓库用 **`scheduleWindowResizeToScale` 约 40ms 防抖** 减轻连续 `setSize`）。

### 当前实现要点（分段缩放，避免「二次放大」裁切）

- **基准窗**：**360×300**（**`WIN_BASE_W/H`**，`windowChrome.ts`；与 **`tauri.conf.json`** 初始 **`width`/`height`/`minWidth`/`minHeight`** 一致）。
- **最大窗**：**960×800**；**`SCALE_MAX = min(960/360, 800/300)`**，**宽高比例同时约束**，避免只放宽或只放高导致越界。
- **`userScale`**：**0.35～`SCALE_MAX`**；**仅当光标在角色像素上**（**`hitTestAtClientPoint`**）且 **Ctrl + 滚轮**（**`main.ts`**）时调整。
- **相机（`fitCamera`，`camera.ts`）**：  
  - **`userScale ≤ 1`**：**窗口保持基准**；**`charScale = userScale`**，**`cam.zoom = baseZoom / charScale`** → **只缩小角色**、不缩窗，省内存。  
  - **`userScale > 1`**：**`charScale = 1`**，**`cam.zoom = baseZoom`**（**不再除 `userScale`**），避免与「窗变大」叠成 **双重放大** →曾导致的 **越放越裁切、上限虚高** 问题。  
  - **`winScale = clamp(userScale, 1, SCALE_MAX)`**，**`setSize(360×winScale, 300×winScale)`**（取整后仍受 **960×800** 限制）。
- **权限与配置**：**`applyWindowResizeToScale`** 内 **`setMinSize`/`setMaxSize`/`setSize`**；**`capabilities`** 需 **`allow-set-size`** 等。开发期 **`beforeDevCommand: dev:strict`** 固定 **5173**，与 **`remote.urls`** 对齐，减少端口漂移导致白名单失效。

### 与像素命中、缓冲的关系

- **`preserveDrawingBuffer: true`** 使 **`readPixels`** 可信，但成本随 **当前窗面积** 上升；故 **默认 360×300** 比 **480×400** 等更大基准 **更省常驻占用**。
- **resize / 坐标**：窗在变时 **`canvas` 尺寸、`getBoundingClientRect()`、相机 viewport** 可能帧间不一致；若用旧尺寸换算 **`readPixels` 坐标**，会 **误判透明/命中**。**工程上**可再加：**resize 结束后再统一判穿透**、**命中边界迟滞**（连续多帧才切换 `setIgnoreCursorEvents`）。

### 互见

**「可拖拽」**（仅角色上滚轮）；**「隐藏背景与穿透判定」**（`readPixels`、`轮询`、**`preserveDrawingBuffer`**）；**「tauri使用官方运行时实现动图」**（清屏与相机稳定）；**「番茄钟（Pomodoro）MVP」**（`resize` 时面板 **`clamp`**、气泡 **`layoutSpeechBubble`**）。



## 番茄钟（Pomodoro）MVP（当前实现对照）

本节按 **`pet-web/`源码** 归纳，避免与讨论稿脱节；**未实现**短休/长休自动链、系统通知、统计等「完整番茄」扩展。

### 代码落点

- **`pet-web/src/pomodoro/runtime.ts`**：`pomo` 状态（`idle` / `running` / `paused`）、`isSpeechLocked()`（`speechEndAt`）、`beginSpeech` / `resetSpeechAndBubble`、`formatMmSs` / `parseMmSsToMs`、`updatePomoTimeDisplay`。
- **`pet-web/src/pomodoro/panel.ts`**：`POMO_PANEL_MARGIN`（当前 **0**）、`isClientPointOverPomoPanel`、`syncPomoPanelWidthFromButtons`（`--pomo-btn-row-px` 与按钮行同宽）、`setupPomoPanelDrag` / `clampPomoPanelPosition`。
- **`pet-web/src/spine/canvasApp.ts`**：番茄按钮事件、`__cycleTick` 与 **`update`** 内台词结束、倒计时、到点 **`beginSpeech`**；轮播与 **`pomo.startIdleRef`**（`startIdle`）衔接。
- **`pet-web/src/spine/assets.ts`**：`TALK_ANIM = emoji_5`、台词常量 **`POMO_START_LINES` / `POMO_END_LINES` / `POMO_PAUSE_LINE` / `POMO_RESUME_LINE`**。
- **`pet-web/src/ui/speechBubble.ts`**：气泡跟随 **`身体4`**（优先）或 **`左看右看`** 骨骼屏幕坐标；**`SPEECH_FACE_OFFSET_X = 36`**、**`SPEECH_FACE_OFFSET_Y = 40`**；与 **`#pomo-panel`** 矩形重叠则 **右移** 迭代，仍重叠则 **移到面板右侧或下缘以下**。
- **`pet-web/src/ui/contextMenu.ts`**：画布 **`contextmenu`**（命中角色像素才弹出 **`#character-context-menu`**）、**`打开/关闭计时器`**、**`Escape`** / 点击外部关闭；Tauri 下 **`showCharacterContextMenu`** 末尾调用 **`disableBackgroundClickThrough()`**。
- **`pet-web/src/tauri/pointerLoop.ts`**（仅 Tauri）：约 **33ms** 一轮；光标在 **`#pomo-panel`** 或 **角色右键菜单** 矩形内 → **`setIgnoreCursorEvents(false)`**；否则仅 **角色像素 `readPixels` 命中** 时为 **`false`**，其余 **`true`**（穿透桌面）。
- **`pet-web/src/main.ts`**：`pointerdown` 在面板/菜单上 **不触发** **`startDragging`**；挂载上述循环与 **`setupCharacterContextMenu`**。
- **DOM**：**`pet-web/src/app/domTemplate.ts`**（**`#pomo-panel`**：拖动手柄、**`#pomo-time`**、三按钮；**`#speech-bubble`**；**`#character-context-menu`**）。

### 交互与规则（与实现对齐）

- **专注时长**：单一 **`MM:SS`** 文本框（**`#pomo-time`**，默认 **`25:00`**）。**`parseMmSsToMs`**：分钟 **1～180**，秒 **0～59**；非法输入在 **`change`/`blur`** 时回退为当前剩余/默认显示。仅 **`phase === "idle"` 且未在说话** 时可编辑（**`readOnly`** 否则）。
- **三按钮**：**开始**（运行中为禁用；暂停时文案为 **继续**）、**暂停**（仅 **`running`** 可用）、**重置**（回到 **`idle`**，清台词与气泡，剩余时间回到 **`defaultDurationMs`**；**不**因重置强制 **`#pomo-panel`** 显示）。**`click`** 处理在 **`canvasApp.initialize`**。
- **台词与动画**：**`beginSpeech`** 设 **`speechEndAt`**、显示气泡、**`track0` → `emoji_5`**（**`assets.TALK_ANIM`**）。**开始**随机 **`POMO_START_LINES` 之一**，时长 **2800ms**；**暂停 / 继续** 各 **2200ms**；**到点** 随机 **`POMO_END_LINES` 之一**，时长 **3000 + random×3000 ms**，结束后 **`speechAfter`** 把 **`remainingMs`** 设回 **`defaultDurationMs`**。
- **倒计时**：仅 **`pomo.phase === "running"` 且 `!isSpeechLocked()`** 时每帧扣 **`delta*1000`** ms——**台词播放期间倒计时暂停**（与「开始期间表是否要走」的讨论稿不同，以代码为准）。
- **时间自然结束**：**`remainingMs <= 0`** 时置 **`idle`**、显示归零；若 **`#pomo-panel`** 此前被隐藏，则 **自动显示**（**`hidden = false`**）并 **`syncPomoPanelWidthFromButtons`**，再播结束台词。
- **表情轮播与台词**：**`__cycleTick`** 在 **`isSpeechLocked()`** 时 **直接 return**，不推进 idle/emoji状态机。台词结束时：若 **`cycleMode`** 则 **`startIdle()`**，否则回到 **`animName`**（URL **`?anim=`** 或默认 **`idel`**）。

### 穿透与拖拽（Tauri）

- **番茄面板整块**、**右键菜单整块** 与 **角色像素** 三类区域会 **`setIgnoreCursorEvents(false)`**，否则透明区穿透；故面板/菜单在透明背景上仍可点（**`pointerLoop` + `main.ts` 跳过拖窗**）。
- **浏览器**：无 **`pointerLoop`**；**`pointermove`** 在面板上将光标设为 **default**，避免仍显示 **grab**。

### UI 样式与初始位置

- **`pet-web/src/style.css`**：**`#pomo-panel`** 默认 **`left: 10%`**、**`bottom: 0`**，**`z-index: 10`**（画布为 **1**）；气泡 **`z-index: 11`**。**`#pomo-panel[hidden]`** 使用 **`display: none !important`**，避免与 **`inline-flex`** 冲突。按钮为 **半透明红系**（`rgba(130, 42, 58, …)` 等）。

### 与「动态切换状态机」的关系

- 番茄台词占用 **`emoji_5`** 与 **`isSpeechLocked()`**，在时间轮播开启时 **冻结 `__cycleTick`**；完整 **多源仲裁**（输入驱动 + 轮播）仍以 **`docs/交互与表情仲裁设计.md`** 为演进目标，当前番茄与轮播 **同属 `canvasApp` 内顺序逻辑**，尚未拆成独立仲裁模块。

### 互见

**「可拖拽」**（面板/菜单不触发拖窗）；**「隐藏背景与穿透判定」**（`setIgnoreCursorEvents` 与矩形命中）；**「放缩」**（`resize` 时 **`clampPomoPanelPosition`** / **`layoutSpeechBubble`**）；**「动态与交互进阶」**（说话优先级与统一仲裁演进）。



## 动态与交互进阶

- **统一出口**：时间轮播（如 **`__cycleTick`**）与 **输入驱动表情**（流汗 `emoji_2`、星星眼 `emoji_1`、番茄说话 `emoji_5` 等）最终都应经 **同一套仲裁逻辑**，由 **唯一路径** 调用 **`setAnimation(0, …)`**，避免多源抢轨、闪烁或叠层。**说话 `talkUntil` 内**：仲裁对其它意图 **短路、不处理、不入队**（与仲裁文档一致）。
- **信号与手感**：**流汗** 仅用 **窗口竖直速度 `vy`** 判定，且 **仅在拖拽态** 采样（与光标在客户区内位移分离）；**星星眼能量** 在 **拖拽进行中不累计**（冻结或强衰减），避免与「过山车」误叠。**评估、TTL、残留锁、建议实现顺序** 见 **`docs/交互与表情仲裁设计.md`** 与 **`docs/交互进阶规划摘要.md`**。
- **基于现有素材的快捷交互**（仲裁落地后补全）：如 **点击/右键触发表情 + 冷却**、移入移出窗口反应等，均属 **输入 → 仲裁 → `setAnimation(0, …)`**；与 **「动态切换状态机」** 同层演进。
- **多角色与按需资源（规划）**：与 **Tauri + 前端按 `pathPrefix` 加载 Spine** 一致，可把 **安装包** 与 **角色资源包** 拆开，避免「所有角色塞进一次安装」导致 **磁盘与分发体积** 过大。
  - **分角色下载**：安装包带 **壳程序、公共逻辑**；其余角色在用户 **首次选用或设置里下载** 时，从 **HTTPS / 对象存储** 拉取 **zip 或分文件**，校验 **哈希（如 SHA256）** 后解压到 **应用数据目录**（如 **`%AppData%\应用名\characters\<角色 id>\`**），不宜全部硬打进 **`src-tauri` resources**。下载与落盘可在 **Rust（如 reqwest）** 或 **前端 fetch + Tauri 自定义命令写入受限目录**，避免任意路径写权限过大。
  - **静态目录约定**：与现有 **`public/argenti/` + `pathPrefix: '/argenti/'`** 同类，扩展为 **`characters/<id>/`（json + atlas + png）**；运行时 **只把已下载目录** 列入可选（**索引 manifest** 或 **Rust 扫描目录** 暴露给前端）。
  - **运行时选一个或多个**：**单实例单角色**（当前主线）— 改 **`pathPrefix`/资源路径** 只加载一套；**省内存** 时 **同时只驻留一套**，切换前 **dispose 纹理/骨架** 再加载新角。**同一窗口多 Skeleton** 或 **多 WebView 窗口** 都会 **叠加纹理与缓冲占用**。若产品接受 **「想同时多个就自己多开进程」**：实现成本最低；需注意 **Windows 默认单实例** 时要在 **Tauri 配置/产品层** 明确 **是否允许多开**，否则再点图标只会 **聚焦旧窗口**。
  - **与 MSI 分组件打包**：安装程序按组件分角色 **可做但维护成本高**；**应用内按需下载** 更贴合「下载时勾选」、加角色 **不必重做安装包**。落地前宜定：**包格式（zip + `manifest.json`）**、**校验**、**安装目录规范（角色 id）**，再接到现有加载逻辑。

