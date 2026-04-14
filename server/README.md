# CFO Control Tower — Backend Server

FastAPI 后端，提供数据 API + AI 大模型对话服务。

## 快速启动

```bash
cd server

# 1. 创建虚拟环境
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 LLM API Key

# 4. 启动服务
python main.py
# 服务运行在 http://localhost:8000
# API 文档: http://localhost:8000/docs
```

## 前端连接后端

```bash
# 在项目根目录，使用 .env.api 配置启动前端
cp .env.api .env
npm run dev
```

或手动设置环境变量：
```
VITE_AI_MODE=api-stream
VITE_API_BASE_URL=http://localhost:8000
```

## 三种 AI 模式

| VITE_AI_MODE | 说明 | 需要后端？ |
|---|---|---|
| `local` | 前端正则引擎（默认） | 否 |
| `api` | 后端 LLM，一次性返回 | 是 |
| `api-stream` | 后端 LLM，SSE 流式 | 是 |

## 支持的 LLM 提供商

任何兼容 OpenAI API 格式的服务：

| 提供商 | LLM_BASE_URL | 模型示例 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | gpt-4o, gpt-4-turbo |
| DeepSeek | `https://api.deepseek.com` | deepseek-chat |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-max |
| Moonshot | `https://api.moonshot.cn/v1` | moonshot-v1-128k |
| 本地 Ollama | `http://localhost:11434/v1` | llama3, qwen2 |

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/data/opening` | 季度总览 |
| GET | `/api/data/secondary` | 运营指标 |
| GET | `/api/data/tertiary` | BG×Geo 交叉 |
| POST | `/api/chat` | AI 对话 (完整) |
| POST | `/api/chat/stream` | AI 对话 (SSE 流式) |
