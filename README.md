# Flow Analysis（流水分析）

专注法律场景的智能证据洞察工具。支持银行 / 支付宝 / 微信流水导入、OCR 识别、结构化分析、风险检测与场景化 AI 报告。纯 Web 应用，无需安装客户端。

### 快速开始（Supabase 完整模式，推荐）

1. `npm install` → 复制 `.env.example` 为 `.env`，填写 Supabase 与 API 密钥  
2. Supabase SQL Editor 依次执行 `001` → `002` → `003` 迁移  
3. Dashboard **Via Editor** 部署 Edge Functions：`start-report-job`、`start-ocr-job`  
4. Secrets 配置 `SILICONFLOW_API_KEY`、`PADDLEOCR_TOKEN`  
5. Auth 中设置 Site URL / Redirect URLs  
6. `npm run dev:netlify` → 注册登录 → 上传流水 → OCR / 生成报告  

> 未配置 Supabase 时仍可本地使用（localStorage + Netlify Functions），但 OCR 与 LLM 报告易受超时影响。

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
| LLM 报告 | Netlify Function（易超时） | Edge Function 同步执行（约 1–2 分钟） |
| OCR 识别 | Netlify submit/poll（易 502/504） | Edge Function 同步轮询（最长 140s） |
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
│              Netlify Functions (短任务 API / fallback)            │
│  ocr / ocr-status (fallback) │ parse-excel │ parse-transactions │
│  infer-table-schema │ analyze-scenario (fallback)              │
└────────────┬───────────────────────────────┬─────────────────────┘
             │                               │
             ▼                               ▼
   PaddleOCR AI Studio              SiliconFlow DeepSeek-V3.2
   (PP-OCRv6)                       (结构化 / 场景报告)

Supabase Edge Functions（登录后启用，Via Editor 部署）：
  start-report-job  → 同步 LLM 场景报告（~1–2min，请求内完成）
  start-ocr-job     → 同步 OCR（提交 Paddle + 轮询，最长 140s）
```

### 异步任务架构

**OCR（Supabase 配置 + 已登录时启用，推荐）**

```
前端 ──POST start-ocr-job（上传图片）──► Edge Function
         │                               ├─ 写入 ocr_jobs (running)
         │                               ├─ 同步提交 Paddle + 轮询（最长 140s）
         │                               └─ 200 返回 { jobId, state: 'done', blocks }
前端 ◄── 直接使用 blocks，或 fallback 轮询 ocr_jobs 表
```

**OCR（Netlify fallback，未配置 Supabase 或未登录）**

```
前端 ──POST ocr────────► 提交 jobId，立即返回
前端 ──POST ocr-status─► 长轮询直到 done / failed（每轮 ≤22s，多次冷启动）
```

**LLM 场景报告（Supabase，配置后启用）**

```
前端 ──POST start-report-job──► Edge Function
         │                         ├─ 写入 report_jobs (running)
         │                         ├─ 同步调用 DeepSeek (~1–2min)
         │                         └─ 200 返回 { jobId, status: 'done', result }
前端 ◄── 直接使用 result，或 fallback 轮询 report_jobs 表（最长 10min）
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
│   │   ├── supabaseOcrJobs.ts       # 异步 OCR 任务
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
│   │   ├── 002_auth_rls_report_jobs.sql  # Auth RLS + 报告任务 + 云端快照
│   │   └── 003_ocr_jobs.sql         # OCR 异步任务表
│   └── functions/
│       ├── start-report-job/
│       │   ├── index.ts             # CLI 部署（多文件）
│       │   ├── reportLogic.ts
│       │   └── index-browser.ts     # Dashboard Via Editor 单文件部署
│       └── start-ocr-job/
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
| OCR 任务 | Supabase `ocr_jobs` | 异步 OCR 任务状态与 blocks 结果 |

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
- OCR 走 Supabase Edge Function（单次后台最长 140s，显著减少 502/504）

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
| `SILICONFLOW_API_KEY` | LLM 报告生成（`start-report-job`） |
| `PADDLEOCR_TOKEN` | OCR 识别（`start-ocr-job`） |
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
3. `supabase/migrations/003_ocr_jobs.sql`

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

浏览器 **Via Editor** 仅支持单文件，需分别部署两个函数。合并版源码在 `supabase/functions/*/index-browser.ts`。

### 函数一：`start-report-job`（LLM 场景报告）

**源码：`supabase/functions/start-report-job/index-browser.ts`**

1. Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. **Function name** 设为 `start-report-job`
3. 将 `index-browser.ts` **全部内容**粘贴到 `index.ts` → **Deploy**
4. **Secrets** 中添加 `SILICONFLOW_API_KEY`
5. 保持 **Verify JWT** 为开启

### 函数二：`start-ocr-job`（OCR，推荐）

**源码：`supabase/functions/start-ocr-job/index-browser.ts`**

1. 同上创建新函数，**Function name** 设为 `start-ocr-job`
2. 粘贴 `start-ocr-job/index-browser.ts` 全部内容 → **Deploy**
3. **Secrets** 中添加 `PADDLEOCR_TOKEN`
4. 保持 **Verify JWT** 为开启

> 两个函数可共用同一套 Secrets；`SUPABASE_*` 由平台自动注入。

### 验证

| 功能 | 观察位置 |
|------|----------|
| LLM 报告 | **Table Editor → report_jobs**，应用 STEP 3 生成报告 |
| OCR | **Table Editor → ocr_jobs**，OCR 工作台逐页识别 |

### CLI 替代方案

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-ref>
supabase secrets set SILICONFLOW_API_KEY=sk-xxx
supabase secrets set PADDLEOCR_TOKEN=xxx
supabase functions deploy start-report-job
supabase functions deploy start-ocr-job
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

### 为何需要 Supabase Edge Function

Netlify Function 免费档超时约 **10 秒**，Pro 档约 26 秒；DeepSeek 场景报告通常需要 **1–2 分钟**。

Supabase Edge Function 在**同一 HTTP 请求内**同步调用 LLM 并写回 `report_jobs`，免费档 wall-clock 上限 **150 秒**（勿使用 `waitUntil`，后台任务会在 ~75s 被终止）。

### 流程

1. 用户在 STEP 3 点击「生成报告」→ `START_REPORT_JOB`
2. `ReportJobRunner` 调用 `createRemoteReportJob()` → Edge Function（请求可能等待 1–2 分钟）
3. Edge Function 写入 `report_jobs`，同步调用 SiliconFlow，返回 `{ jobId, status: 'done', result }`
4. 若响应已含 `result` 则直接使用；否则每 3 秒轮询 `report_jobs`（最长 10 分钟）
5. 构建 `ScenarioReportRecord` 并加入报告列表

> **注意**：`ReportJobRunner` 的 effect 依赖仅绑定 `job.id` / `job.status`，进度更新不会中断轮询。

### 相关文件

- `src/lib/supabaseReportJobs.ts` — 创建与轮询
- `src/lib/buildScenarioReport.ts` — 报告组装
- `src/components/ReportJobRunner.tsx` — 后台执行器
- `supabase/functions/start-report-job/` — Edge Function

---

## OCR 异步任务

### 为何 Netlify OCR 容易失败

| 问题 | 说明 |
|------|------|
| Function 超时 | 免费 ~10s，Pro 26s；`ocr-status` 每轮最多 22s |
| 冷启动 | submit / poll 多次调用，间歇性 502/504 |
| 网关限制 | 大图上传易触发 ~30s 网关超时 |

### Supabase 模式（推荐，登录后自动启用）

配置 Supabase 并部署 `start-ocr-job` 后，前端 `ocrPageBlob()` 自动路由到 Edge Function：

1. 上传图片 → Edge Function 写入 `ocr_jobs`，**同步**提交 Paddle + 轮询（最长 **140s**）
2. 返回 `{ jobId, state: 'done', blocks }`；前端优先直接使用 `blocks`
3. 若仅返回 `jobId`，则每 2s 轮询 `ocr_jobs` 表直到 `done`

> **注意**：勿使用 `EdgeRuntime.waitUntil()` 后台 OCR，Supabase 会在 ~75s 终止 worker。

相关文件：

- `src/lib/supabaseOcrJobs.ts` — 提交与轮询
- `src/lib/api.ts` — 自动选择 Supabase / Netlify 路径
- `supabase/functions/start-ocr-job/index-browser.ts` — Edge Function

### Netlify fallback

未配置 Supabase 或未登录时，仍走 Netlify：

| Function | 职责 | 超时 |
|----------|------|------|
| `ocr.ts` | 提交 PaddleOCR 任务 | 默认 |
| `ocr-status.ts` | 长轮询状态 | 26s（`netlify.toml`） |

前端常量：`OCR_TIMEOUT_MS = 120_000`，`SUPABASE_OCR_TIMEOUT_MS = 150_000`。

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

### 003_ocr_jobs.sql — OCR 异步任务

| 表 | 用途 |
|----|------|
| `ocr_jobs` | 异步 OCR 任务（status、progress、result.blocks） |
| RLS | 用户只读自己的 OCR 任务 |

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
| `/functions/v1/start-report-job` | POST | 同步生成场景报告，返回 `{ jobId, status: 'done', result }` |
| `/functions/v1/start-ocr-job` | POST | 同步 OCR（二进制 body），返回 `{ jobId, state: 'done', blocks }` |

请求头需包含 `Authorization: Bearer <access_token>` 和 `apikey: <anon_key>`。

---

## 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 生产稳定版，对应 Netlify 生产部署 |
| `develop` / `dev` | 开发集成分支（二者同步，功能在此验证后再合并 main） |

```bash
# 日常开发
git checkout develop   # 或 git checkout dev
# ... 开发、提交 ...
git push origin develop
git push origin develop:dev   # 同步到远程 dev（可选）

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

### OCR 频繁 502 / 504 / 超时

- **已配置 Supabase**：确认已登录、`003` 迁移已执行、`start-ocr-job` 已部署且配置了 `PADDLEOCR_TOKEN`
- **未配置 Supabase**：Netlify 超时导致，建议启用 Supabase OCR 模式
- **图片过大**：单张 > 5.5MB 会被拒绝；PDF 失败页会自动压缩重试

### 报告生成超时或一直「后台生成中」

- **未配置 Supabase**：Netlify Function 超时，请配置 Supabase 模式
- **已配置 Supabase**：确认 Edge Function 已重新部署（同步版 `index-browser.ts`）、`SILICONFLOW_API_KEY` 已设置
- **横幅一直转圈**：点击「取消等待」后重试；检查 Supabase Logs 是否有 `[start-report-job] complete`
- **report_jobs 已是 done 但前端无报告**：刷新页面后重新生成（旧版 progress 更新 bug 已修复）

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
