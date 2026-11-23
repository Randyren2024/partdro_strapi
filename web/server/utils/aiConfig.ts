// AI model configuration shared across server routes.
// Stores presets + the currently saved config on disk in scripts/ingest/ai_config.json
// so both the Nuxt frontend and the Python ingest.py CLI see the same state.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname equivalent for ESM — resolve to web/server/utils → web/scripts/ingest
const __dirname = dirname(fileURLToPath(import.meta.url))
export const INGEST_DIR = join(__dirname, '..', '..', 'scripts', 'ingest')

export type AiConfig = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  presetId?: string
  updatedAt: string
}

export type AiConfigMasked = Omit<AiConfig, 'apiKey'> & {
  apiKey: string        // masked: "sk-••••abcd"
  hasKey: boolean
}

export type Preset = {
  id: string
  label: string
  provider: string
  baseUrl: string
  defaultModels: string[]
  hint: string
}

// ----- Presets -----------------------------------------------------------

export const PRESETS: Preset[] = [
  {
    id: 'deepseek-official',
    label: 'DeepSeek (官方)',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    hint: 'OpenAI Format, 国内直连稳定',
  },
  {
    id: 'empiriolabs',
    label: 'EmpirioLabs AI',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://api.empiriolabs.ai/v1',
    defaultModels: ['deepseek-v4-1-flash', 'gpt-4o-mini', 'claude-sonnet-4'],
    hint: 'sk-empiriolabs-... key, 900+ models on one key',
  },
  {
    id: 'dashscope',
    label: '阿里云百炼 / DashScope',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['deepseek-v4.1-flash-1017', 'qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-72b-instruct'],
    hint: 'compatible-mode OpenAI 端点',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModels: ['deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-exp'],
    hint: '聚合多厂商，统一接口',
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    provider: 'OpenAI Compatible',
    baseUrl: 'http://localhost:11434/v1',
    defaultModels: ['qwen2.5:7b', 'llama3.1:8b', 'deepseek-r1:14b'],
    hint: '本地运行，无 API Key',
  },
  {
    id: 'custom',
    label: '自定义',
    provider: 'OpenAI Compatible',
    baseUrl: '',
    defaultModels: [],
    hint: '自由填写任何 OpenAI 兼容端点',
  },
]

export function presetById(id: string | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

// ----- Disk I/O ----------------------------------------------------------

export const CONFIG_FILE = join(INGEST_DIR, 'ai_config.json')

export function readConfig(): AiConfig | null {
  try {
    if (!existsSync(CONFIG_FILE)) return null
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && parsed.baseUrl ? (parsed as AiConfig) : null
  } catch {
    return null
  }
}

export function writeConfig(cfg: AiConfig): void {
  mkdirSync(INGEST_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

// ----- Masking -----------------------------------------------------------

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••••'
  const prefix = key.startsWith('sk-') ? 'sk-' : key.slice(0, 4)
  const suffix = key.slice(-4)
  return `${prefix}••••${suffix}`
}

export function toMasked(cfg: AiConfig | null): AiConfigMasked | null {
  if (!cfg) return null
  return {
    id: cfg.id,
    label: cfg.label,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    temperature: cfg.temperature,
    presetId: cfg.presetId,
    updatedAt: cfg.updatedAt,
    apiKey: maskKey(cfg.apiKey),
    hasKey: !!cfg.apiKey,
  }
}

// ----- Validation --------------------------------------------------------

const URL_RE = /^https?:\/\/[^\s]+$/

export function validateConfig(input: Partial<AiConfig>): string[] {
  const errs: string[] = []
  if (!input.label || !input.label.trim()) errs.push('label 不能为空')
  if (!input.baseUrl || !input.baseUrl.trim()) errs.push('baseUrl 不能为空')
  else if (!URL_RE.test(input.baseUrl)) errs.push('baseUrl 必须是 http(s)://... 格式')
  if (!input.model || !input.model.trim()) errs.push('model 不能为空')
  if (input.temperature !== undefined && (input.temperature < 0 || input.temperature > 2)) {
    errs.push('temperature 必须在 0–2 之间')
  }
  return errs
}
