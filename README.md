# Flow Analysis（流水分析）

专注法律场景的智能证据洞察工具，支持银行/支付宝/微信流水导入、OCR 识别、结构化分析、风险检测与场景化 AI 报告。

## 功能概览

### STEP 1 - 导入流水
- 拖拽上传 Excel、PDF、图片流水
- **OCR 工作台**（PDF/图片）：预览、旋转、页码跳转、逐页识别
- 左右分栏对照 + bbox 叠加、文本块编辑
- 导出 OCR JSON/CSV；确认后 LLM 结构化
- Excel/CSV 直接解析，无需 OCR

#### OCR 工作台使用流程

1. 上传 PDF 扫描件或图片，自动进入 OCR 工作台
2. **对照校对 Tab**：双栏同步缩放/拖拽；左侧原图+bbox，右侧同位置可编辑文本
3. **置信度配色**：绿(≥95%) / 黄(80-95%) / 红(<80%) 提醒检查
4. **逐页识别**：页范围如 `1-5,8`，点击「开始识别」（逐页请求，避免超时）
5. **流水表格 Tab**：点击「生成流水表格」→ bbox 聚类重建表格（支持折行合并、无表头）
6. **表格编辑**：类 WPS 编辑（改表头/单元格、合并行、增删行列、AI 辅助表头）
7. **导出**：流水表 CSV/Excel，或「确认并解析流水」进入 STEP 2

### STEP 2 - 结构化分析
- 统一交易字段（时间、对方、摘要、金额）
- 自动去重归类
- 风险规则检测（大额、频繁、异常时段等）
- 自定义筛选、核查对象管理
- 收支趋势与往来对象可视化
- 导出 Excel

### STEP 3 - 场景报告
- 婚姻家事 / 民间借贷 / 劳动争议 / 合伙纠纷
- DeepSeek-V3.2 智能分析报告
- 关键发现、风险预警、资金时间线
- 导出 PDF / Excel

## 技术栈

- **前端**: React 19 + Vite + Tailwind CSS 4
- **后端**: Netlify Functions (Serverless)
- **OCR**: PaddleOCR PP-OCRv6 (AI Studio API)
- **大模型**: SiliconFlow DeepSeek-V3.2
- **数据库**: Supabase (可选，用于持久化)

## 本地开发

### 1. 安装依赖

```bash
npm install
npm install -D netlify-cli
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并填写：

```env
# Netlify Functions 密钥（本地 dev 也需要）
SILICONFLOW_API_KEY=your-key
PADDLEOCR_TOKEN=your-token

# Supabase（可选）
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> **安全提示**: API 密钥仅配置在 Netlify 环境变量或本地 `.env` 中，切勿提交到 Git。

### 3. 启动开发服务器

```bash
# 仅前端（Functions 不可用）
npm run dev

# 完整本地环境（推荐，含 Netlify Functions）
npm run dev:netlify
```

访问 http://localhost:8888

## 部署到 Netlify

### 方式一：Git 连接

1. 将代码推送到 GitHub/GitLab
2. 在 [Netlify](https://app.netlify.com) 导入仓库
3. 构建设置已写在 `netlify.toml` 中，无需额外配置

### 方式二：CLI 部署

```bash
npm run build
npx netlify deploy --prod
```

### 环境变量（Netlify Dashboard → Site settings → Environment variables）

| 变量名 | 说明 |
|--------|------|
| `SILICONFLOW_API_KEY` | SiliconFlow API 密钥 |
| `PADDLEOCR_TOKEN` | PaddleOCR AI Studio Token |
| `VITE_SUPABASE_URL` | Supabase 项目 URL（可选） |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Key（可选） |

## Supabase 数据库（可选）

如需持久化项目数据，在 Supabase SQL Editor 中执行：

```
supabase/migrations/001_init.sql
```

## 项目结构

```
├── src/                    # React 前端
│   ├── components/
│   │   └── ocr/            # OCR 工作台组件
│   ├── pages/              # 三步向导页面
│   ├── lib/
│   │   ├── pdfUtils.ts     # PDF 渲染/旋转/拆页
│   │   ├── ocrExport.ts    # OCR JSON/CSV 导出
│   │   └── ocrDocument.ts  # OCR 文档创建
│   └── store/              # 状态管理
├── netlify/functions/      # Serverless API
│   ├── ocr.ts              # PP-OCRv6 识别
│   ├── parse-excel.ts      # Excel 解析
│   ├── parse-transactions.ts # LLM 结构化
│   └── analyze-scenario.ts # 场景分析报告
└── supabase/migrations/    # 数据库 Schema
```

## 支持的文件格式

| 格式 | 处理方式 |
|------|----------|
| .xlsx / .xls / .csv | 本地列映射解析 |
| .pdf / .png / .jpg | OCR 工作台逐页 PP-OCRv6 → 校对 → LLM 结构化 |

## License

MIT
