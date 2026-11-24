<script setup lang="ts">
import type { Preset, AiConfigMasked } from '../../server/utils/aiConfig'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloudUploadOutlined,
  DownOutlined,
  FilePdfOutlined,
  LinkOutlined,
  LockOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue'

// ---------- state ----------
type ModelRow = { id: string; owned_by?: string | null; context_window?: number | null }

const { data: bootstrap } = await useFetch<{
  ok: boolean
  presets: Preset[]
  current: AiConfigMasked | null
  activeId: string | null
  configs: AiConfigMasked[]
}>('/api/ai/config')

const presets = computed(() => bootstrap.value?.presets ?? [])

// Saved configs — every saved API key stays on disk; the active one drives ingest.
const configList = ref<AiConfigMasked[]>(bootstrap.value?.configs ?? [])
const activeId = ref<string | null>(bootstrap.value?.activeId ?? null)
const saved = computed(() => configList.value.find((c) => c.id === activeId.value) ?? null)
const editingId = ref<string | null>(saved.value?.id ?? null)

// form
const presetId = ref<string>(saved.value?.presetId ?? 'deepseek-official')
const label = ref<string>(saved.value?.label ?? 'DeepSeek (官方)')
const baseUrl = ref<string>(saved.value?.baseUrl ?? 'https://api.deepseek.com/v1')
const apiKey = ref<string>('')                // user types this fresh each session
const model = ref<string>(saved.value?.model ?? 'deepseek-flash')
const temperature = ref<number>(saved.value?.temperature ?? 0.1)

const testOk = ref(false)                    // explicit flag — false while testing, true on success

// loaded models (from /api/ai/models)
const loadedModels = ref<ModelRow[]>([])
const modelsLoading = ref(false)
const modelsError = ref<string | null>(null)
const modelsUpdatedAt = ref<string | null>(null)

// test-connection state
const testing = ref(false)
const testResult = ref<{ ok: boolean; model?: string; latencyMs?: number; reply?: string; error?: string; status?: number } | null>(null)

// save state
const saving = ref(false)
const saveMsg = ref<string | null>(null)

// ---------- computed ----------
const selectedPreset = computed(() => presets.value.find((p) => p.id === presetId.value))

// model options — preset defaults stay visible even when /v1/models omits them
const modelOptions = computed<string[]>(() => {
  const preset = selectedPreset.value?.defaultModels ?? []
  const fetched = loadedModels.value.map((m) => m.id)
  return fetched.length ? [...new Set([...preset, ...fetched])] : preset
})

const formValid = computed(() =>
  label.value.trim() !== ''
  && baseUrl.value.trim() !== ''
  && (model.value || '').trim() !== ''
)

// ---------- handlers ----------
function applyPreset(p: Preset) {
  editingId.value = null
  presetId.value = p.id
  if (p.label !== '自定义') label.value = p.label
  baseUrl.value = p.baseUrl
  loadedModels.value = []
  modelsError.value = null
  if (p.defaultModels.length && !p.defaultModels.includes(model.value)) {
    model.value = p.defaultModels[0]
  }
}

function pickModel({ key }: { key: string | number }) {
  model.value = String(key)
}

async function loadModels() {
  if (!baseUrl.value.trim()) return
  modelsLoading.value = true
  modelsError.value = null
  try {
    const params = new URLSearchParams({ baseUrl: baseUrl.value })
    if (apiKey.value.trim()) params.set('apiKey', apiKey.value.trim())
    else if (editingId.value) params.set('id', editingId.value)
    const data = await $fetch<{ ok: boolean; models: ModelRow[] }>(`/api/ai/models?${params.toString()}`)
    loadedModels.value = data.models ?? []
    modelsUpdatedAt.value = new Date().toLocaleTimeString()
    if (!loadedModels.value.length) {
      modelsError.value = '端点返回了 0 个模型 — 检查 key 权限 / baseUrl'
    }
  } catch (e: any) {
    modelsError.value = e?.statusMessage || e?.message || String(e)
    loadedModels.value = []
  } finally {
    modelsLoading.value = false
  }
}

async function testConnection() {
  testing.value = true
  testOk.value = false
  testResult.value = null
  try {
    const data = await $fetch<any>('/api/ai/test', {
      method: 'POST',
      body: {
        id: editingId.value ?? undefined,
        baseUrl: baseUrl.value,
        apiKey: apiKey.value,
        model: model.value,
        temperature: temperature.value,
      },
    })
    testResult.value = data
    testOk.value = !!data?.ok
  } catch (e: any) {
    testResult.value = {
      ok: false,
      error: e?.statusMessage || e?.message || String(e),
    }
    testOk.value = false
  } finally {
    testing.value = false
  }
}

// Sync the saved-config list from any /api/ai/config response.
function syncConfigs(data: { activeId?: string | null; configs?: AiConfigMasked[] }) {
  configList.value = data.configs ?? []
  activeId.value = data.activeId ?? null
}

// Load a saved config into the form (key stays on disk — never echoed back).
function fillForm(c: AiConfigMasked) {
  editingId.value = c.id
  presetId.value = c.presetId ?? 'custom'
  label.value = c.label
  baseUrl.value = c.baseUrl
  model.value = c.model
  temperature.value = c.temperature ?? 0.1
  apiKey.value = ''
  loadedModels.value = []
  modelsError.value = null
  testOk.value = false
  testResult.value = null
}

function flash(msg: string) {
  saveMsg.value = msg
  setTimeout(() => { saveMsg.value = null }, 3000)
}

// Click a saved config → make it the active one and load it into the form.
async function activateConfig(c: AiConfigMasked) {
  if (c.id === activeId.value && c.id === editingId.value) return
  try {
    const data = await $fetch<any>('/api/ai/config', {
      method: 'PUT',
      body: { activeId: c.id },
    })
    syncConfigs(data)
    fillForm(c)
    flash(`已切换到 ${c.label}`)
  } catch (e: any) {
    saveMsg.value = `切换失败: ${e?.statusMessage || e?.message || e}`
  }
}

async function saveConfig(asNew = false) {
  if (!formValid.value) return
  saving.value = true
  saveMsg.value = null
  try {
    const body: Record<string, unknown> = {
      label: label.value,
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,        // empty string preserves the stored key
      model: model.value,
      temperature: temperature.value,
      presetId: presetId.value,
    }
    if (!asNew && editingId.value) body.id = editingId.value
    const data = await $fetch<any>('/api/ai/config', { method: 'PUT', body })
    syncConfigs(data)
    const current: AiConfigMasked | null = data?.current ?? null
    if (current) fillForm(current)
    apiKey.value = ''
    flash(`已保存 — ${current?.label ?? label.value}`)
  } catch (e: any) {
    saveMsg.value = `保存失败: ${e?.statusMessage || e?.message || e}`
  } finally {
    saving.value = false
  }
}

function save() { return saveConfig(false) }
function saveAsNew() { return saveConfig(true) }

async function removeConfig(c: AiConfigMasked) {
  try {
    const data = await $fetch<any>(`/api/ai/config?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' })
    syncConfigs(data)
    const next = configList.value.find((x) => x.id === activeId.value)
    if (next) fillForm(next)
    else { editingId.value = null; testOk.value = false }
    flash(`已删除 — ${c.label}`)
  } catch (e: any) {
    saveMsg.value = `删除失败: ${e?.statusMessage || e?.message || e}`
  }
}

// ---------- Upload / Ingest ----------
// Show the upload section once a connection test passed or the active saved
// config already holds an API key.
const readyForIngest = computed(() => testOk.value || !!saved.value?.hasKey)

type ProgressLine = { step: string; ok?: boolean; out?: string; error?: string; stage?: string; product?: any; outDir?: string }

const ingestMode = ref<'pdf' | 'url'>('pdf')
const pdfFileList = ref<any[]>([])
const pdfFile = computed<File | null>(() => (pdfFileList.value[0]?.originFileObj as File | undefined) ?? null)
const ingestUrl = ref<string>('')
const postToStrapi = ref(false)
const publishProduct = ref(false)

const ingesting = ref(false)
const progress = ref<ProgressLine[]>([])
const ingestError = ref<string | null>(null)
const finalProduct = ref<any>(null)
const finalOutDir = ref<string | null>(null)

// Elapsed timer — makes it obvious the run is alive during the long LLM /
// Supabase round-trips, even when no new line has arrived yet.
const elapsed = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null
const progressList = ref<HTMLElement | null>(null)

function scrollProgressToBottom() {
  nextTick(() => {
    const el = progressList.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

const STEP_LABEL: Record<string, string> = {
  start: '接收文件',
  extract: '解析文档',
  ai: 'AI 提取',
  strapi: '写入 Strapi',
  done: '完成',
  error: '错误',
  run: '执行中',
}

const currentStep = computed(() => {
  const last = progress.value[progress.value.length - 1]
  return last ? (STEP_LABEL[last.step] ?? last.step) : ''
})

async function startIngest() {
  if (ingesting.value) return
  progress.value = []
  ingestError.value = null
  finalProduct.value = null
  finalOutDir.value = null

  const body = new FormData()
  if (ingestMode.value === 'pdf') {
    if (!pdfFile.value) { ingestError.value = '请先选择 PDF 文件'; return }
    body.append('pdf', pdfFile.value)
  } else {
    if (!ingestUrl.value.trim()) { ingestError.value = '请输入 URL'; return }
    body.append('url', ingestUrl.value.trim())
  }
  if (postToStrapi.value) body.append('post', 'true')
  if (publishProduct.value) body.append('publish', 'true')

  ingesting.value = true
  elapsed.value = 0
  elapsedTimer = setInterval(() => { elapsed.value += 1 }, 1000)
  try {
    const resp = await fetch('/api/ingest', { method: 'POST', body })
    if (!resp.ok || !resp.body) {
      ingestError.value = `HTTP ${resp.status} ${resp.statusText}`
      return
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const raw = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!raw.trim()) continue
        try {
          const line = JSON.parse(raw) as ProgressLine
          progress.value.push(line)
          scrollProgressToBottom()
          if (line.step === 'error' && !line.ok) ingestError.value = line.error || line.out || '失败'
          if (line.step === 'done' && line.product) finalProduct.value = line.product
          if (line.step === 'done' && line.outDir) finalOutDir.value = line.outDir
        } catch { /* garbage line, skip */ }
      }
    }
  } catch (e: any) {
    ingestError.value = e?.message || String(e)
  } finally {
    ingesting.value = false
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
  }
}
</script>

<template>
  <div>
    <section class="section intro">
      <div class="container">
        <p class="eyebrow">AI model</p>
        <h2>模型配置</h2>
        <p class="body-text">
          选择 DeepSeek 官方、EmpirioLabs AI 或任何 OpenAI 兼容端点。密钥保存在服务端 <code class="code">ai_config.json</code>，前端不会回显。
        </p>
      </div>
    </section>

    <section class="section config">
      <div class="container">
        <!-- Preset buttons -->
        <div class="preset-row">
          <button
            v-for="p in presets"
            :key="p.id"
            type="button"
            class="preset"
            :class="{ active: presetId === p.id }"
            @click="applyPreset(p)"
          >
            <span class="preset-label">{{ p.label }}</span>
            <span class="preset-hint" v-if="p.hint">{{ p.hint }}</span>
          </button>
        </div>

        <!-- Form card -->
        <a-card class="config-card">
          <template #title>端点设置</template>

          <!-- Saved configs — every saved key is a selectable option -->
          <div v-if="configList.length" class="saved-list">
            <p class="saved-list-title">已保存方案（点击切换使用）</p>
            <div
              v-for="c in configList"
              :key="c.id"
              class="saved-item"
              :class="{ active: c.id === activeId, editing: c.id === editingId }"
              @click="activateConfig(c)"
            >
              <div class="saved-item-main">
                <span class="saved-name">{{ c.label }}</span>
                <span class="saved-meta">{{ c.baseUrl }} · {{ c.model }}</span>
              </div>
              <a-tag v-if="c.id === activeId" color="success">使用中</a-tag>
              <a-tag v-if="!c.hasKey" color="warning">无密钥</a-tag>
              <a-popconfirm
                title="删除该方案？"
                ok-text="删除"
                cancel-text="取消"
                @confirm="removeConfig(c)"
              >
                <button type="button" class="saved-del" title="删除该方案" @click.stop>×</button>
              </a-popconfirm>
            </div>
          </div>

          <p v-if="saved" class="saved-info">
            当前使用: <strong>{{ saved.label }}</strong> · {{ saved.baseUrl }} · model:
            <a-typography-text code>{{ saved.model }}</a-typography-text>
            <a-tag v-if="saved.hasKey" color="success">密钥已设置</a-tag>
            <a-tag v-else color="warning">无密钥</a-tag>
            <span class="saved-at" v-if="saved.updatedAt"> · 更新于 {{ new Date(saved.updatedAt).toLocaleString() }}</span>
          </p>

          <a-form layout="vertical" class="config-form">
            <a-row :gutter="[24, 0]">
              <a-col :xs="24" :md="12">
                <a-form-item label="显示名称">
                  <a-input v-model:value="label" placeholder="如 DeepSeek 官方 (主力)" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :md="12">
                <a-form-item label="Base URL">
                  <a-input v-model:value="baseUrl" placeholder="https://api.deepseek.com/v1" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :md="12">
                <a-form-item label="API Key">
                  <a-input-password v-model:value="apiKey" placeholder="sk-••••••••" autocomplete="off" />
                  <div class="field-hint">留空则保留之前保存的 key</div>
                </a-form-item>
              </a-col>
              <a-col :xs="24" :md="12">
                <a-form-item label="Model">
                  <div class="model-row">
                    <a-input
                      v-model:value="model"
                      class="model-select"
                      placeholder="直接输入模型名，例如 deepseek-flash"
                      allow-clear
                    />
                    <a-dropdown trigger="click">
                      <a-button>
                        常用模型
                        <DownOutlined />
                      </a-button>
                      <template #overlay>
                        <a-menu style="max-height: 320px; overflow: auto" @click="pickModel">
                          <a-menu-item v-for="m in modelOptions" :key="m">{{ m }}</a-menu-item>
                        </a-menu>
                      </template>
                    </a-dropdown>
                    <a-button :loading="modelsLoading" @click="loadModels">
                      <template #icon><ReloadOutlined /></template>
                      刷新
                    </a-button>
                  </div>
                  <div class="field-hint">直接输入即可，任意 OpenAI 兼容模型名都行；「常用模型」是快捷选择，「刷新」从 /v1/models 拉取</div>
                  <div v-if="modelsUpdatedAt" class="field-hint">已从 /v1/models 拉取 · {{ modelsUpdatedAt }}</div>
                  <div v-if="modelsError" class="field-err">{{ modelsError }}</div>
                </a-form-item>
              </a-col>
              <a-col :span="24">
                <a-form-item>
                  <template #label>
                    Temperature <a-tag color="blue">{{ temperature.toFixed(2) }}</a-tag>
                  </template>
                  <a-slider v-model:value="temperature" :min="0" :max="2" :step="0.05" />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>

          <div class="actions">
            <a-button type="primary" :disabled="!formValid" :loading="testing" @click="testConnection">
              <template #icon><ThunderboltOutlined /></template>
              {{ testing ? '连接中…' : '测试连接' }}
            </a-button>
            <a-button :disabled="!formValid" :loading="saving" @click="save">
              <template #icon><SaveOutlined /></template>
              {{ saving ? '保存中…' : (editingId ? '更新方案' : '保存方案') }}
            </a-button>
            <a-button v-if="editingId" :disabled="!formValid" :loading="saving" @click="saveAsNew">
              另存为新方案
            </a-button>
          </div>

          <a-alert
            v-if="testResult"
            class="result-alert"
            :type="testResult.ok ? 'success' : 'error'"
            show-icon
            :message="testResult.ok ? '连接成功' : '连接失败'"
          >
            <template #description>
              <template v-if="testResult.ok">
                model: <a-typography-text code>{{ testResult.model }}</a-typography-text>
                · {{ testResult.latencyMs }}ms · 回复: “{{ testResult.reply }}”
              </template>
              <template v-else>HTTP {{ testResult.status ?? '—' }} · {{ testResult.error }}</template>
            </template>
          </a-alert>

          <a-alert
            v-if="saveMsg"
            class="result-alert"
            :type="saveMsg.startsWith('已') ? 'success' : 'error'"
            show-icon
            :message="saveMsg"
          />
        </a-card>

        <!-- Security note -->
        <a-alert type="warning" show-icon class="note">
          <template #message>安全说明</template>
          <template #description>
            API Key 以明文写入 <a-typography-text code>web/scripts/ingest/ai_config.json</a-typography-text>（server-side），
            前端只收到掩码版本。实际 AI 调用由 Python <a-typography-text code>ai_extract.py</a-typography-text> 读取此文件执行。
            不要把 <a-typography-text code>ai_config.json</a-typography-text> 提交到 Git。
          </template>
        </a-alert>
      </div>
    </section>

    <!-- Upload section — only appears once model is ready -->
    <section v-if="readyForIngest" class="section config">
      <div class="container">
        <a-card class="config-card">
          <template #title>导入产品</template>
          <p class="card-desc">
            选择一份 PDF 规格书或产品 URL，AI 会把它转成 Strapi Product schema。
          </p>

          <a-tabs v-model:activeKey="ingestMode" class="mode-tabs">
            <a-tab-pane key="pdf">
              <template #tab><FilePdfOutlined /> PDF 文件</template>
              <a-upload-dragger
                v-model:file-list="pdfFileList"
                accept=".pdf"
                :max-count="1"
                :before-upload="() => false"
              >
                <p class="ant-upload-drag-icon"><CloudUploadOutlined /></p>
                <p class="ant-upload-text">点击或拖拽 .pdf 文件到此处</p>
                <p class="ant-upload-hint">单个文件，最大 80 MB</p>
              </a-upload-dragger>
            </a-tab-pane>
            <a-tab-pane key="url">
              <template #tab><LinkOutlined /> URL</template>
              <a-input
                v-model:value="ingestUrl"
                type="url"
                size="large"
                allow-clear
                placeholder="https://example.com/product-spec"
              />
            </a-tab-pane>
          </a-tabs>

          <div class="ingest-options">
            <a-checkbox v-model:checked="postToStrapi">自动 POST 到 Strapi</a-checkbox>
            <a-checkbox v-model:checked="publishProduct" :disabled="!postToStrapi">同时发布 (publish)</a-checkbox>
          </div>

          <div class="actions">
            <a-button
              type="primary"
              size="large"
              :loading="ingesting"
              :disabled="(ingestMode === 'pdf' && !pdfFile) || (ingestMode === 'url' && !ingestUrl.trim())"
              @click="startIngest"
            >
              {{ ingesting ? '导入中…' : '开始导入' }}
            </a-button>
          </div>

          <a-alert v-if="ingestError" type="error" show-icon class="result-alert" :message="ingestError" />
        </a-card>

        <!-- Progress panel -->
        <a-card v-if="progress.length || finalProduct" class="config-card progress-card">
          <template #title>执行进度</template>
          <template #extra>
            <a-tag v-if="ingesting" color="processing">{{ currentStep }} · {{ elapsed }}s</a-tag>
            <a-tag v-else-if="finalProduct" color="success">完成 · {{ elapsed }}s</a-tag>
            <a-tag v-else-if="ingestError" color="error">失败</a-tag>
          </template>

          <!-- Progress lines -->
          <div ref="progressList" class="progress-list">
            <div
              v-for="(line, i) in progress"
              :key="i"
              class="progress-line"
              :class="{ err: line.step === 'error' || line.ok === false, done: line.step === 'done' }"
            >
              <span class="progress-icon">
                <CheckCircleFilled v-if="line.step === 'done'" />
                <CloseCircleFilled v-else-if="line.step === 'error' || line.ok === false" />
                <span v-else class="progress-dot" />
              </span>
              <span class="progress-step">{{ STEP_LABEL[line.step] ?? line.step }}</span>
              <span class="progress-out">{{ line.out ?? line.error ?? '' }}</span>
            </div>
          </div>

          <!-- Final product summary -->
          <div v-if="finalProduct" class="product-summary">
            <a-alert type="success" show-icon message="已生成 Product" class="summary-alert" />
            <a-descriptions :column="1" size="small" bordered>
              <a-descriptions-item label="name">
                <a-typography-text code>{{ finalProduct.name }}</a-typography-text>
              </a-descriptions-item>
              <a-descriptions-item label="code">
                <a-typography-text code>{{ finalProduct.code }}</a-typography-text>
              </a-descriptions-item>
              <a-descriptions-item label="slug">
                <a-typography-text code>{{ finalProduct.slug }}</a-typography-text>
              </a-descriptions-item>
              <a-descriptions-item label="sections">{{ finalProduct.sectionCount }}</a-descriptions-item>
              <a-descriptions-item v-if="finalOutDir && !postToStrapi" label="out">
                <a-typography-text code>{{ finalOutDir }}</a-typography-text>
              </a-descriptions-item>
            </a-descriptions>
            <p v-if="!postToStrapi" class="body-text summary-note">
              未勾选自动 POST — JSON 保存在上面的 out 目录里，下次
              <a-typography-text code>python ingest.py ... --post</a-typography-text> 即可。
            </p>
          </div>
        </a-card>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro { padding-top: clamp(64px, 10vw, 120px); }

.code {
  font-family: var(--font-family-code);
  background: var(--color-fill-tertiary);
  padding: 1px 6px; border-radius: var(--radius-sm); font-size: 12px;
}

.preset-row {
  display: flex; flex-wrap: wrap; gap: 12px;
  margin-bottom: 24px;
}
.preset {
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 2px;
  padding: 10px 16px;
  background: var(--color-bg-container);
  border: 1px solid var(--color-border); border-radius: var(--radius);
  cursor: pointer; text-align: left;
  font-family: var(--font-family); font-size: var(--font-size);
  transition:
    border-color var(--motion-duration) var(--motion-ease),
    box-shadow var(--motion-duration) var(--motion-ease),
    background var(--motion-duration) var(--motion-ease);
}
.preset:hover { border-color: var(--color-primary); }
.preset.active {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}
.preset-label { font-weight: 600; color: var(--color-text); }
.preset-hint { font-size: var(--font-size-sm); color: var(--color-text-tertiary); }

.config-card { margin-bottom: 24px; }
.config-card:last-child { margin-bottom: 0; }
.card-desc { margin: 0 0 16px; color: var(--color-text-secondary); }

.saved-list { margin: 0 0 20px; }
.saved-list-title {
  margin: 0 0 8px; font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}
.saved-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; margin-bottom: 8px;
  background: var(--color-bg-container);
  border: 1px solid var(--color-border); border-radius: var(--radius);
  cursor: pointer;
  transition:
    border-color var(--motion-duration) var(--motion-ease),
    background var(--motion-duration) var(--motion-ease);
}
.saved-item:hover { border-color: var(--color-primary); }
.saved-item.active {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}
.saved-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.saved-name { font-weight: 600; color: var(--color-text); }
.saved-item.editing .saved-name { color: var(--color-primary); }
.saved-meta {
  font-size: var(--font-size-sm); color: var(--color-text-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.saved-del {
  flex: none; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; border-radius: var(--radius-sm);
  color: var(--color-text-tertiary); font-size: 18px; line-height: 1;
  cursor: pointer;
}
.saved-del:hover { color: var(--color-error); background: var(--color-fill-tertiary); }

.saved-info {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin: 0 0 16px; font-size: 13px; color: var(--color-text-secondary);
}
.saved-info strong { color: var(--color-text); }
.saved-at { font-size: var(--font-size-sm); color: var(--color-text-tertiary); }

.config-form { margin-top: 8px; }
.config-form :deep(.ant-form-item-label .ant-tag) { margin-left: 8px; }
.field-hint { margin-top: 4px; font-size: var(--font-size-sm); color: var(--color-text-tertiary); }
.field-err { margin-top: 4px; font-size: var(--font-size-sm); color: var(--color-error-text); }

.model-row { display: flex; gap: 8px; width: 100%; }
.model-select { flex: 1; min-width: 0; }

.actions {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  margin-top: 8px; padding-top: 20px;
  border-top: 1px solid var(--color-border-secondary);
}
.result-alert { margin-top: 16px; }
.note { margin-top: 24px; }

.mode-tabs :deep(.ant-tabs-nav) { margin-bottom: 16px; }
.ingest-options {
  display: flex; gap: 20px; flex-wrap: wrap;
  margin-top: 8px; padding-top: 16px;
  border-top: 1px solid var(--color-border-secondary);
}
.ingest-options :deep(.ant-checkbox-wrapper) { color: var(--color-text-secondary); }

.progress-card { margin-top: 24px; }
.progress-list {
  max-height: 320px; overflow-y: auto;
  background: var(--color-bg-dark); color: var(--color-text-dark);
  border-radius: var(--radius); padding: 12px 14px;
  font-family: var(--font-family-code); font-size: 12px;
}
.progress-line {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}
.progress-line:last-child { border-bottom: none; }
.progress-icon { flex: none; width: 14px; color: var(--color-text-dark-tertiary); line-height: 1.4; }
.progress-line.done .progress-icon { color: var(--color-success); }
.progress-line.err .progress-icon { color: var(--color-error); }
.progress-dot {
  display: inline-block; width: 6px; height: 6px;
  margin: 5px 4px; border-radius: 50%;
  background: var(--color-text-dark-tertiary);
}
.progress-step { flex: none; min-width: 60px; color: var(--color-primary); font-weight: 600; }
.progress-line.err .progress-step { color: var(--color-error); }
.progress-line.done .progress-step { color: var(--color-success); }
.progress-out { flex: 1; white-space: pre-wrap; word-break: break-all; color: var(--color-text-dark-secondary); }
.progress-line.done .progress-out { color: var(--color-text-dark); }

.product-summary { margin-top: 16px; }
.summary-alert { margin-bottom: 12px; }
.summary-note { margin-top: 12px; max-width: none; }

@media (max-width: 720px) {
  .preset-row { flex-direction: column; }
  .preset { width: 100%; }
  .model-row { flex-direction: column; }
}
</style>
