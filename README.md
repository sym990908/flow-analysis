# Flow Analysis（流水分析）

专注法律场景的智能证据洞察工具。支持银行 / 支付宝 / 微信流水导入、OCR 识别、结构化分析、风险检测与场景化 AI 报告。纯 Web 应用，无需安装客户端。

---

## 目录

- [功能概览](#功能概览)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [数据流与状态管理](#数据流与状态管理)
- [运行模式](#运行模式)
- [本地开发](#本地开发)
- [环境变量](#环境变量)
- [部署到 Netlify](#部署到-netlify)
- [Supabase 配置](#supabase-配置)
- [Edge Function 部署（浏览器编辑器）](#edge-function-部署浏览器编辑器)
- [用户认证](#用户认证)
- [异步 LLM 报告](#异步-llm-报告)
- [OCR 异步任务](#ocr-异步任务)
- [数据库 Schema](#数据库-schema)
- [API 参考](#api-参考)
- [分支策略](#分支策略)
- [安全说明](#安全说明)
- [常见问题](#常见问题)
- [License](#license)

---

## 功能概览

应用采用三步向导流程，由 `AppState.currentStep`（1 / 2 / 3）驱动，无 URL 路由。

### STEP 1 — 导入流水

| 能力 | 说明 |
|------|------|
| 文件上传 | 拖拽上传 Excel、PDF、PNG、JPG |
| Excel / CSV | 直接解析，列映射后进入 STEP 2 |
| OCR 工作台 | PDF / 图片扫描件逐页识别、校对、重建表格 |
| 双栏对照 | 原图 + bbox 叠加，右侧可编辑 OCR 文本 |
| 置信度提示 | 绿 ≥95% / 黄 80–95% / 红 <80% |
| 流水表格 | bbox 聚类重建表格，支持合并行、增删行列、AI 辅助表头 |
| 导出 | OCR JSON / CSV；确认后 LLM 结构化 |

**OCR 工作台流程**

1. 上传 PDF 或图片 → 自动进入工作台
2. **对照校对**：双栏同步缩放；逐页识别（页范围如 `1-5,8`）
3. **流水表格**：生成表格 → 编辑 → 「确认并解析流水」
4. 解析完成后进入 STEP 2

### STEP 2 — 结构化分析

- 统一交易字段（时间、对方、摘要、金额、方向）
- 自动去重与风险规则检测（大额、频繁、异常时段等）
- 自定义筛选、核查对象（Subject）管理
- 分析范围：全项目或选定文件
- 收支趋势图、往来对象可视化
- 导出 Excel

### STEP 3 — 场景化智能报告

| 场景 | 侧重点 |
|------|--------|
| 婚姻家事 | 非家庭支出、隐匿收入、特定对象打款 |
| 民间借贷 | 借-还-转链路、欠款余额 |
| 劳动争议 | 工资、补贴、扣款、离职前后变化 |
| 合伙纠纷 | 投资分红、异常往来、资产转移 |
| 通用分析 | 全面资金往来与异常识别 |

- 同一项目可按**不同文件组合 + 不同场景**生成多份报告
- 报告生成在**后台**进行，可切换步骤继续操作
- 支持导出 PDF / Excel
- 配置 Supabase 后，LLM 报告通过 Edge Function **异步**执行（约 1–2 分钟）

### 用户与数据（Supabase 可选）

| 能力 | 未配置 Supabase | 已配置 Supabase |
|------|-----------------|-----------------|
| 数据存储 | 浏览器 localStorage | localStorage + 云端快照 |
| 登录 | 无需登录 | 注册 / 登录 / 找回密码 / 修改密码 |
| LLM 报告 | Netlify Function（易超时） | Edge Function 异步任务 |
| 多设备 | 不支持 | 登录后项目同步云端 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器 (React SPA)                        │
│  Step1Upload → Step2Structure → Step3Analysis                   │
│  AppContext (状态) │ AuthContext (认证) │ localStorage (持久化)   │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐      ┌─────────────────────────────────┐
│   Netlify (静态托管)    │      │         Supabase (可选)          │
│   dist/ + redirects    │      │  Auth │ PostgreSQL │ Edge Fn    │
└────────────┬───────────┘      └─────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────┐
│              Netlify Functions (短任务 API)                      │
│  ocr / ocr-status │ parse-excel │ parse-transactions           │
│  infer-table-schema │ analyze-scenario (fallback)              │
└────────────┬───────────────────────────────┬─────────────────────┘
             │                               │
             ▼                               ▼
   PaddleOCR AI Studio              SiliconFlow DeepSeek-V3.2
   (PP-OCRv6)                       (结构化 / 场景报告)
```

### 异步任务架构

**OCR（Netlify，submit → poll 模式）**

```
前端 ──POST ocr────────► 提交 jobId，立即返回
前端 ──POST ocr-status─► 长轮询直到 done / failed
```

**LLM 场景报告（Supabase，配置后启用）**

```
前端 ──POST start-report-job──► Edge Function
         │                         ├─ 写入 report_jobs (pending)
         │                         ├─ 202 返回 jobId
         │                         └─ waitUntil 后台调用 DeepSeek (~2min)
前端 ──轮询 report_jobs 表──────► pending → running → done / error
```

### 组件层次

```
main.tsx
└── App
    └── AuthProvider
        └── AuthGate（未登录时显示登录页）
            └── AppProvider
                └── AppContent
                    ├── ProjectPersistence   # 自动保存 local + 云端
                    ├── ReportJobRunner      # 后台报告任务
                    ├── ParseJobBanner
                    ├── ReportJobBanner
                    └── Step1 / Step2 / Step3
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| 状态管理 | React Context + useReducer |
| 图表 | Recharts |
| PDF 渲染 | pdfjs-dist |
| Excel | xlsx |
| PDF 导出 | jspdf + jspdf-autotable |
| 静态托管 | Netlify |
| 短任务 API | Netlify Functions (esbuild) |
| OCR | PaddleOCR PP-OCRv6 (AI Studio API) |
| 大模型 | SiliconFlow DeepSeek-V3.2 |
| 认证 / 数据库 / 长任务 | Supabase (Auth + PostgreSQL + Edge Functions) |

---

## 项目结构

```
├── src/
│   ├── App.tsx                      # 根组件
│   ├── main.tsx                     # 入口
│   ├── pages/
│   │   ├── Step1Upload.tsx          # 上传 + OCR 工作台入口
│   │   ├── Step2Structure.tsx       # 结构化分析
│   │   └── Step3Analysis.tsx        # 场景报告
│   ├── components/
│   │   ├── auth/                    # 登录 / 注册 / 改密
│   │   │   ├── AuthGate.tsx
│   │   │   └── UserMenu.tsx
│   │   ├── ocr/                     # OCR 工作台（约 15 个组件）
│   │   ├── ReportJobRunner.tsx      # 后台报告执行器
│   │   ├── ProjectPersistence.tsx   # 自动持久化
│   │   └── ProjectRecordsPanel.tsx  # 项目列表（本地 + 云端）
│   ├── store/
│   │   ├── AppContext.tsx           # 全局业务状态
│   │   └── AuthContext.tsx          # 认证状态
│   ├── lib/
│   │   ├── api.ts                   # Netlify Functions 客户端
│   │   ├── supabase.ts              # Supabase 客户端
│   │   ├── supabaseReportJobs.ts    # 异步报告任务
│   │   ├── supabaseProjects.ts      # 云端项目同步
│   │   ├── projectStorage.ts        # localStorage 持久化
│   │   ├── buildScenarioReport.ts   # 报告构建
│   │   ├── riskEngine.ts            # 风险规则引擎
│   │   └── pdfUtils.ts              # PDF 工具
│   └── types/                       # TypeScript 类型定义
├── netlify/
│   └── functions/
│       ├── ocr.ts                   # OCR 提交
│       ├── ocr-status.ts            # OCR 轮询
│       ├── ocrShared.ts             # OCR 共享逻辑
│       ├── parse-excel.ts
│       ├── parse-transactions.ts
│       ├── infer-table-schema.ts
│       └── analyze-scenario.ts      # 同步报告（Supabase 未配置时的 fallback）
├── supabase/
│   ├── config.toml                  # Supabase CLI 本地配置
│   ├── migrations/
│   │   ├── 001_init.sql             # 基础表结构
│   │   └── 002_auth_rls_report_jobs.sql  # Auth RLS + 任务表 + 云端快照
│   └── functions/
│       └── start-report-job/
│           ├── index.ts             # CLI 部署（多文件）
│           ├── reportLogic.ts
│           └── index-browser.ts     # Dashboard Via Editor 单文件部署
├── netlify.toml                     # Netlify 构建与 Function 配置
├── vite.config.ts
├── .env.example
└── package.json
```

---

## 数据流与状态管理

### AppState 核心字段

```typescript
{
  projectId, projectName,
  currentStep: 1 | 2 | 3,
  step1Phase: 'upload' | 'workspace',
  scenario: 'marriage' | 'lending' | 'labor' | 'partnership' | 'general',
  files[], transactions[], subjects[],
  filters, riskRules[],
  reports[], activeReportId?, report?,
  reportJob?, parseJob?,
  ocrDocuments[], analysisScope
}
```

### 持久化策略

| 数据 | 存储位置 | 说明 |
|------|----------|------|
| 项目快照 | `localStorage` (`flow-analysis:v1`) | 交易、报告、筛选、风险规则等 |
| 文件二进制 | 内存 `fileCache` | 刷新后需重新上传 |
| OCR 块数据 | 内存 | 仅存 ocrMeta 到 localStorage |
| 云端快照 | Supabase `project_snapshots` | 登录用户自动同步 |
| 报告任务 | Supabase `report_jobs` | 异步 LLM 任务状态 |

---

## 运行模式

### 模式 A：纯本地（默认）

- 不配置 `VITE_SUPABASE_*` 环境变量
- 无需登录，数据存 localStorage
- LLM 报告走 Netlify `analyze-scenario`（受 Function 超时限制，大数据量可能失败）

### 模式 B：Supabase 完整模式（推荐生产）

- 配置 Supabase URL / Anon Key
- 必须登录后使用
- 项目云端同步 + LLM 报告异步执行（支持约 2 分钟长任务）

---

## 本地开发

### 前置要求

- Node.js 20+
- npm 9+

### 安装

```bash
git clone <repo-url>
cd 流水
npm install
```

`netlify-cli` 已在 devDependencies 中，无需全局安装。

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少配置 OCR 和 LLM 密钥（见 [环境变量](#环境变量)）。

### 启动

```bash
# 仅前端（Netlify Functions 不可用，OCR/LLM 会 404）
npm run dev
# → http://localhost:5180

# 完整本地环境（推荐）
npm run dev:netlify
# → http://localhost:8888
```

> 使用 OCR 和 LLM 功能时**必须**用 `npm run dev:netlify` 并访问 **8888** 端口。

### 构建

```bash
npm run build    # tsc + vite build → dist/
npm run preview  # 预览构建产物
```

---

## 环境变量

### 前端可见（`.env` / Netlify 环境变量）

| 变量 | 必填 | 说明 |
|------|------|------|
| `VITE_SUPABASE_URL` | Supabase 模式必填 | 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 模式必填 | 匿名公钥（可暴露在前端） |

### 服务端密钥（仅 Netlify / Edge Function，不可暴露到前端）

| 变量 | 必填 | 说明 |
|------|------|------|
| `SILICONFLOW_API_KEY` | 是 | SiliconFlow API，用于 LLM 结构化与报告 |
| `PADDLEOCR_TOKEN` | 是 | PaddleOCR AI Studio Token |

### Supabase Edge Function Secrets

| 变量 | 说明 |
|------|------|
| `SILICONFLOW_API_KEY` | LLM 报告生成 |
| `SUPABASE_URL` | 自动注入 |
| `SUPABASE_ANON_KEY` | 自动注入 |
| `SUPABASE_SERVICE_ROLE_KEY` | 自动注入 |

---

## 部署到 Netlify

### 方式一：Git 连接（推荐）

1. 将代码推送到 GitHub / GitLab
2. [Netlify Dashboard](https://app.netlify.com) → Import repository
3. 构建设置已在 `netlify.toml` 中配置，无需额外修改

```toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

### 方式二：CLI 部署

```bash
npm run build
npx netlify deploy --prod
```

### Netlify 环境变量

在 **Site settings → Environment variables** 中添加：

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SILICONFLOW_API_KEY
PADDLEOCR_TOKEN
```

> `VITE_` 前缀变量会在构建时打入前端包。

---

## Supabase 配置

### 1. 创建项目

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New Project**
2. 记录 **Project URL** 和 **anon public key**（Settings → API）

### 2. 执行数据库迁移

在 **SQL Editor** 中按顺序执行：

1. `supabase/migrations/001_init.sql`
2. `supabase/migrations/002_auth_rls_report_jobs.sql`

### 3. 配置 Auth

**Authentication → Providers → Email**

| 设置 | 建议 |
|------|------|
| Enable Email Signup | 开启 |
| Confirm email | 开发可关闭；生产建议开启 |
| Minimum password length | 6 |

**Authentication → URL Configuration**

| 字段 | 值 |
|------|-----|
| Site URL | 生产域名，如 `https://your-app.netlify.app` |
| Redirect URLs | `http://localhost:5180`、`http://localhost:8888`、生产域名 |

### 4. 前端环境变量

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

---

## Edge Function 部署（浏览器编辑器）

浏览器 **Via Editor** 仅支持单文件，请使用合并版：

**文件：`supabase/functions/start-report-job/index-browser.ts`**

### 步骤

1. Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. **Function name** 设为 `start-report-job`（必须与前端调用名一致）
3. 将 `index-browser.ts` **全部内容**粘贴到 `index.ts`
4. 点击 **Deploy function**
5. 在 **Secrets** 中添加 `SILICONFLOW_API_KEY`
6. 保持 **Verify JWT** 为开启

### 验证

部署后在 **Table Editor → report_jobs** 观察任务状态。应用内登录 → 生成报告 → 顶部横幅显示进度。

### CLI 替代方案

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-ref>
supabase secrets set SILICONFLOW_API_KEY=sk-xxx
supabase functions deploy start-report-job
```

---

## 用户认证

配置 Supabase 后，应用入口由 `AuthGate` 守卫：

| 功能 | 实现 |
|------|------|
| 注册 | 邮箱 + 密码（`signUp`） |
| 登录 | 邮箱 + 密码（`signInWithPassword`） |
| 找回密码 | 邮件重置链接（`resetPasswordForEmail`） |
| 修改密码 | 右上角用户菜单（`updateUser`） |
| 退出 | 用户菜单 → 退出登录 |

密码重置邮件跳转回 Site URL 后，自动进入「设置新密码」界面。

---

## 异步 LLM 报告

### 为何需要异步

Netlify Function 免费档超时约 **10 秒**，Pro 档约 26 秒；DeepSeek 场景报告通常需要 **1–2 分钟**。

Supabase Edge Function 使用 `EdgeRuntime.waitUntil()` 在返回 202 后继续后台执行，免费档 wall-clock 上限 **150 秒**。

### 流程

1. 用户在 STEP 3 点击「生成报告」→ `START_REPORT_JOB`
2. `ReportJobRunner` 调用 `createRemoteReportJob()` → Edge Function
3. Edge Function 写入 `report_jobs`，后台调用 SiliconFlow
4. 前端每 3 秒轮询 `report_jobs` 直到 `done`
5. 构建 `ScenarioReportRecord` 并加入报告列表

### 相关文件

- `src/lib/supabaseReportJobs.ts` — 创建与轮询
- `src/lib/buildScenarioReport.ts` — 报告组装
- `src/components/ReportJobRunner.tsx` — 后台执行器
- `supabase/functions/start-report-job/` — Edge Function

---

## OCR 异步任务

OCR 采用与报告类似的 **submit → poll** 模式，避免 Netlify 单请求超时：

| Function | 职责 | 超时配置 |
|----------|------|----------|
| `ocr.ts` | 提交 PaddleOCR 任务，返回 jobId | 默认 |
| `ocr-status.ts` | 长轮询任务状态，完成后返回 blocks | 26s（`netlify.toml`） |

前端 `src/lib/api.ts` 中：

- `OCR_TIMEOUT_MS = 120_000`（整页最长等待）
- `ocrPageBlob()` → submit + poll 循环

---

## 数据库 Schema

### 001_init.sql — 基础表

| 表 | 用途 |
|----|------|
| `projects` | 项目元数据 |
| `uploaded_files` | 上传文件记录 |
| `transactions` | 交易明细 |
| `subjects` | 核查对象 |
| `analysis_reports` | 分析报告 |

### 002_auth_rls_report_jobs.sql — 认证与任务

| 表 / 变更 | 用途 |
|-----------|------|
| `projects.user_id` | 项目归属用户 |
| `report_jobs` | 异步 LLM 报告任务 |
| `project_snapshots` | 云端项目 JSON 快照 |
| RLS 策略 | 用户只能访问自己的数据 |

---

## API 参考

### Netlify Functions

| 路径 | 方法 | 说明 |
|------|------|------|
| `/.netlify/functions/ocr` | POST | 提交 OCR 任务 |
| `/.netlify/functions/ocr-status` | POST | 查询 OCR 状态 |
| `/.netlify/functions/parse-excel` | POST | 解析 Excel base64 |
| `/.netlify/functions/parse-transactions` | POST | LLM 结构化流水 |
| `/.netlify/functions/infer-table-schema` | POST | AI 推断表头 |
| `/.netlify/functions/analyze-scenario` | POST | 同步场景报告（fallback） |

### Supabase Edge Functions

| 路径 | 方法 | 说明 |
|------|------|------|
| `/functions/v1/start-report-job` | POST | 创建异步报告任务，返回 `{ jobId, status }` |

请求头需包含 `Authorization: Bearer <access_token>` 和 `apikey: <anon_key>`。

---

## 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 生产稳定版，对应 Netlify 生产部署 |
| `develop` | 开发集成分支，功能合并后在此验证 |

```bash
# 日常开发
git checkout develop
# ... 开发、提交 ...
git push origin develop

# 发布到生产
git checkout main
git merge develop
git push origin main
```

---

## 安全说明

1. **切勿**将 `SILICONFLOW_API_KEY`、`PADDLEOCR_TOKEN`、`SUPABASE_SERVICE_ROLE_KEY` 提交到 Git 或写入前端代码
2. `.env` 已在 `.gitignore` 中，仅提交 `.env.example`
3. Supabase RLS 确保用户只能读写自己的 `report_jobs` 和 `project_snapshots`
4. Edge Function 使用 Service Role 写任务表，但创建前会校验用户 JWT
5. `VITE_SUPABASE_ANON_KEY` 可公开，依赖 RLS 保护数据

---

## 常见问题

### OCR 报「后端 API 未找到」

未使用 `npm run dev:netlify`，或访问了 5180 端口而非 8888。

### 报告生成超时

- **未配置 Supabase**：Netlify Function 超时，请配置 Supabase 异步模式
- **已配置 Supabase**：检查 Edge Function 是否部署、`SILICONFLOW_API_KEY` 是否设置

### 登录后看不到云端项目

确认 `002` 迁移已执行；检查浏览器控制台 `[cloud-sync]` 警告。

### 注册后无法登录

Supabase 开启了邮箱验证，需先点击验证邮件。

### Edge Function 401

确认已登录；Dashboard 中 Function 的 **Verify JWT** 与前端 token 一致。

### LLM 返回简易报告而非 AI 分析

SiliconFlow API Key 无效或调用失败，系统自动降级为 `buildFallbackReport` 规则报告。

---

## 支持的文件格式

| 格式 | 处理方式 |
|------|----------|
| `.xlsx` / `.xls` / `.csv` | Excel 解析 → LLM 结构化 |
| `.pdf` / `.png` / `.jpg` | OCR 工作台 → 校对 → LLM 结构化 |

---

## License

MIT
