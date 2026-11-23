<script setup lang="ts">
import type { Preset, AiConfigMasked } from '../../server/utils/aiConfig'

// ---------- state ----------
type ModelRow = { id: string; owned_by?: string | null; context_window?: number | null }

const { data: bootstrap } = await useFetch<{
  ok: boolean
  presets: Preset[]
  current: AiConfigMasked | null
}>('/api/ai/config')

const presets = computed(() => bootstrap.value?.presets ?? [])
const saved = computed(() => bootstrap.value?.current ?? null)

// form
const presetId = ref<string>(saved.value?.presetId ?? 'deepseek-official')
const label = ref<string>(saved.value?.label ?? 'DeepSeek (官方)')
const baseUrl = ref<string>(saved.value?.baseUrl ?? 'https://api.deepseek.com/v1')
const apiKey = ref<string>('')                // user types this fresh each session
const model = ref<string>(saved.value?.model ?? 'deepseek-v4-flash')
const temperature = ref<number>(saved.value?.temperature ?? 0.1)

// If user previously saved a config with a key, open upload section immediately on reload.
const saveOk = ref<boolean>(!!saved.value?.hasKey)
const testOk = ref(false)                    // explicit flag — false while testing, true on success

// loaded models (from /api/ai/models)
const loadedModels = ref<ModelRow[]>([])
const modelsLoading = ref(false)
const modelsError = ref<string | null>(null)
const modelsUpdatedAt = ref<string | null>(null)

// test-connection state
const testing = ref(false)
const testResult = ref<{ ok: boolean; latencyMs?: number; reply?: string; error?: string; status?: number } | null>(null)

// save state
const saving = ref(false)
const saveMsg = ref<string | null>(null)

// ---------- computed ----------
const selectedPreset = computed(() => presets.value.find((p) => p.id === presetId.value))

// model options — use fetched list if we have it, otherwise preset defaults
const modelOptions = computed<string[]>(() => {
  if (loadedModels.value.length) return loadedModels.value.map((m) => m.id)
  return selectedPreset.value?.defaultModels ?? []
})

const formValid = computed(() =>
  label.value.trim() !== ''
  && baseUrl.value.trim() !== ''
  && model.value.trim() !== ''
)

// ---------- handlers ----------
function applyPreset(p: Preset) {
  presetId.value = p.id
  if (p.label !== '自定义') label.value = p.label
  baseUrl.value = p.baseUrl
  loadedModels.value = []
  modelsError.value = null
  if (p.defaultModels.length && !p.defaultModels.includes(model.value)) {
    model.value = p.defaultModels[0]
  }
}

async function loadModels() {
  if (!baseUrl.value.trim()) return
  modelsLoading.value = true
  modelsError.value = null
  try {
    const params = new URLSearchParams({ baseUrl: baseUrl.value })
    if (apiKey.value.trim()) params.set('apiKey', apiKey.value.trim())
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

async function save() {
  if (!formValid.value) return
  saving.value = true
  saveOk.value = false
  saveMsg.value = null
  try {
    const data = await $fetch<any>('/api/ai/config', {
      method: 'PUT',
      body: {
        label: label.value,
        baseUrl: baseUrl.value,
        apiKey: apiKey.value,        // empty string preserves existing on server
        model: model.value,
        temperature: temperature.value,
        presetId: presetId.value,
      },
    })
    saveOk.value = !!data?.ok
    saveMsg.value = data?.ok ? `已保存 — ${data?.current?.label ?? label.value}` : '保存失败'
    // Clear the key from form — it's now on disk in ai_config.json
    apiKey.value = ''
    setTimeout(() => { saveMsg.value = null }, 3000)
  } catch (e: any) {
    saveOk.value = false
    saveMsg.value = `保存失败: ${e?.statusMessage || e?.message || e}`
  } finally {
    saving.value = false
  }
}

// ---------- Upload / Ingest ----------
// Show the upload section only once test succeeded OR saved successfully.
const readyForIngest = computed(() => testOk.value || saveOk.value)

type ProgressLine = { step: string; ok?: boolean; out?: string; error?: string; stage?: string; product?: any }

const ingestMode = ref<'pdf' | 'url'>('pdf')
const pdfFile = ref<File | null>(null)
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

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  pdfFile.value = input.files?.[0] ?? null
}

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
        <div class="card">
          <div class="card-head">
            <h3>端点设置</h3>
            <p v-if="saved" class="saved-info">
              已保存: <strong>{{ saved.label }}</strong> · {{ saved.baseUrl }} · model: <em>{{ saved.model }}</em>
              <span v-if="saved.hasKey" class="chip chip--ok">密钥已设置</span>
              <span v-else class="chip chip--warn">无密钥</span>
              <span class="saved-at" v-if="saved.updatedAt"> · 更新于 {{ new Date(saved.updatedAt).toLocaleString() }}</span>
            </p>
          </div>

          <div class="grid2">
            <div>
              <label>显示名称</label>
              <input v-model="label" type="text" placeholder="如 DeepSeek 官方 (主力)" />
            </div>
            <div>
              <label>Base URL</label>
              <input v-model="baseUrl" type="text" placeholder="https://api.deepseek.com/v1" />
            </div>
            <div>
              <label>API Key</label>
              <input v-model="apiKey" type="password" placeholder="sk-••••••••" autocomplete="off" />
              <span class="field-hint">留空则保留之前保存的 key</span>
            </div>
            <div>
              <label>Model</label>
              <div class="model-row">
                <select v-model="model">
                  <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
                  <option :value="model" v-if="model && !modelOptions.includes(model)">{{ model }} (自定义)</option>
                </select>
                <button type="button" class="btn-mini" :disabled="modelsLoading" @click="loadModels">
                  {{ modelsLoading ? '加载中…' : '刷新' }}
                </button>
              </div>
              <div v-if="modelsUpdatedAt" class="field-hint">已从 /v1/models 拉取 · {{ modelsUpdatedAt }}</div>
              <div v-if="modelsError" class="field-err">{{ modelsError }}</div>
            </div>
            <div>
              <label>Temperature <span class="chip chip--dim">{{ temperature.toFixed(2) }}</span></label>
              <input v-model.number="temperature" type="range" min="0" max="2" step="0.05" />
            </div>
          </div>

          <div class="actions">
            <button class="btn" :disabled="!formValid || testing" @click="testConnection">
              {{ testing ? '连接中…' : '测试连接' }}
            </button>
            <button class="btn btn--ghost-dark" :disabled="!formValid || saving" @click="save">
              {{ saving ? '保存中…' : '保存' }}
            </button>

            <div v-if="testResult" class="test-result" :class="{ ok: testResult.ok, err: !testResult.ok }">
              <strong>{{ testResult.ok ? '✓ 连接成功' : '✗ 连接失败' }}</strong>
              <span v-if="testResult.ok">
                model: <em>{{ testResult.model }}</em> · {{ testResult.latencyMs }}ms · 回复: “{{ testResult.reply }}”
              </span>
              <span v-else>HTTP {{ testResult.status ?? '—' }} · {{ testResult.error }}</span>
            </div>
            <div v-if="saveMsg" class="save-msg" :class="{ ok: saveMsg.startsWith('已保存') }">
              {{ saveMsg }}
            </div>
          </div>
        </div>

        <!-- Security note -->
        <div class="note">
          <strong>安全说明:</strong>
          API Key 以明文写入 <code class="code">web/scripts/ingest/ai_config.json</code> (server-side)，
          前端只收到掩码版本。实际 AI 调用由 Python <code class="code">ai_extract.py</code> 读取此文件执行。
          不要把 <code class="code">ai_config.json</code> 提交到 Git。
        </div>
      </div>
    </section>

    <!-- Upload section — only appears once model is ready -->
    <section v-if="readyForIngest" class="section config">
      <div class="container">
        <div class="card">
          <div class="card-head">
            <h3>导入产品</h3>
            <p class="body-text" style="margin: 4px 0 0; max-width: none;">
              选择一份 PDF 规格书或产品 URL，AI 会把它转成 Strapi Product schema。
            </p>
          </div>

          <!-- Mode tabs -->
          <div class="mode-tabs">
            <button type="button" class="mode-tab" :class="{ active: ingestMode === 'pdf' }" @click="ingestMode = 'pdf'">📄 PDF 文件</button>
            <button type="button" class="mode-tab" :class="{ active: ingestMode === 'url' }" @click="ingestMode = 'url'">🔗 URL</button>
          </div>

          <!-- PDF mode -->
          <div v-if="ingestMode === 'pdf'" class="upload-area">
            <label class="file-drop">
              <input type="file" accept=".pdf" style="display:none" @change="onFileChange" />
              <div class="file-drop-inner">
                <span class="file-icon">📄</span>
                <span class="file-label">
                  {{ pdfFile ? pdfFile.name : '点击选择 .pdf 文件' }}
                </span>
                <span class="file-hint" v-if="pdfFile">
                  {{ (pdfFile.size / 1024 / 1024).toFixed(1) }} MB · 点此处重选
                </span>
                <span class="file-hint" v-else>最大 80 MB</span>
              </div>
            </label>
          </div>

          <!-- URL mode -->
          <div v-else class="upload-area">
            <input v-model="ingestUrl" type="url" placeholder="https://example.com/product-spec" class="url-input" />
          </div>

          <!-- Options -->
          <div class="ingest-options">
            <label class="chk">
              <input type="checkbox" v-model="postToStrapi" />
              <span>自动 POST 到 Strapi</span>
            </label>
            <label class="chk" :class="{ disabled: !postToStrapi }">
              <input type="checkbox" v-model="publishProduct" :disabled="!postToStrapi" />
              <span>同时发布 (publish)</span>
            </label>
          </div>

          <div class="actions">
            <button class="btn" :disabled="ingesting || (ingestMode === 'pdf' && !pdfFile) || (ingestMode === 'url' && !ingestUrl.trim())" @click="startIngest">
              {{ ingesting ? '导入中…' : '开始导入' }}
            </button>
            <div v-if="ingestError" class="inline-err">✗ {{ ingestError }}</div>
          </div>
        </div>

        <!-- Progress panel -->
        <div v-if="progress.length || finalProduct" class="card progress-card">
          <div class="card-head">
            <h3>执行进度</h3>
            <span class="chip" v-if="ingesting">{{ currentStep }} · {{ elapsed }}s</span>
            <span class="chip chip--ok" v-else-if="finalProduct">完成 · {{ elapsed }}s</span>
            <span class="chip chip--warn" v-else-if="ingestError">失败</span>
          </div>

          <!-- Progress lines -->
          <div ref="progressList" class="progress-list">
            <div
              v-for="(line, i) in progress"
              :key="i"
              class="progress-line"
              :class="{ ok: line.ok !== false && line.step !== 'error', err: line.step === 'error' || line.ok === false, done: line.step === 'done' }"
            >
              <span class="progress-step">{{ STEP_LABEL[line.step] ?? line.step }}</span>
              <span class="progress-out">{{ line.out ?? line.error ?? '' }}</span>
            </div>
          </div>

          <!-- Final product summary -->
          <div v-if="finalProduct" class="product-summary">
            <h4>✅ 已生成 Product</h4>
            <div class="product-row"><strong>name:</strong> <code>{{ finalProduct.name }}</code></div>
            <div class="product-row"><strong>code:</strong> <code>{{ finalProduct.code }}</code></div>
            <div class="product-row"><strong>slug:</strong> <code>{{ finalProduct.slug }}</code></div>
            <div class="product-row"><strong>sections:</strong> {{ finalProduct.sectionCount }}</div>
            <div v-if="finalOutDir && !postToStrapi" class="product-row"><strong>out:</strong> <code>{{ finalOutDir }}</code></div>
            <p v-if="!postToStrapi" class="body-text" style="margin-top: 10px; max-width: none;">
              未勾选自动 POST — JSON 保存在上面的 out 目录里，下次 <code class="code">python ingest.py ... --post</code> 即可。
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro { padding-top: clamp(64px, 10vw, 120px); }

.code {
  font-family: var(--font-mono);
  background: rgba(12, 15, 18, 0.06);
  padding: 1px 6px; border-radius: 3px; font-size: 12px;
}

.preset-row {
  display: flex; flex-wrap: wrap; gap: 12px;
  margin-bottom: 28px;
}
.preset {
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 4px;
  padding: 12px 18px;
  background: #fff;
  border: 1px solid var(--line); border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-body); font-size: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.preset:hover { border-color: var(--accent-ink); transform: translateY(-1px); }
.preset.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(255, 90, 31, 0.15);
  background: rgba(255, 90, 31, 0.03);
}
.preset-label {
  font-family: var(--font-display); font-size: 14px; font-weight: 600;
}
.preset-hint {
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft);
}

.card {
  background: #fff;
  border: 1px solid var(--line); border-radius: 6px;
  padding: 28px 32px;
}
.card-head h3 { font-size: 20px; margin-bottom: 8px; }
.saved-info { margin: 0 0 4px; font-size: 13px; color: var(--ink-soft); }
.saved-info strong { color: var(--ink); }
.saved-info em { font-style: normal; font-family: var(--font-mono); font-size: 12px; }
.saved-at { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); opacity: 0.7; }

.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 24px;
  margin-top: 20px;
}
.grid2 label {
  display: block;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-soft);
  margin-bottom: 6px;
}
.grid2 input[type="text"],
.grid2 input[type="password"],
.grid2 select {
  width: 100%;
  padding: 10px 12px;
  font-family: var(--font-mono); font-size: 13px;
  border: 1px solid var(--line); border-radius: 3px;
  background: var(--paper); color: var(--ink);
  outline: none;
  transition: border-color 0.15s ease;
}
.grid2 input:focus, .grid2 select:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(255, 90, 31, 0.15); }

.field-hint { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); margin-top: 4px; }
.field-err { font-family: var(--font-mono); font-size: 11px; color: #b42318; margin-top: 4px; }

.model-row { display: flex; gap: 8px; }
.model-row select { flex: 1; min-width: 0; }

input[type="range"] { width: 100%; accent-color: var(--accent); }

.actions {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  margin-top: 28px; padding-top: 20px;
  border-top: 1px solid var(--line);
}
.btn {
  display: inline-block;
  font-family: var(--font-display); font-stretch: 92%;
  font-size: 14px; letter-spacing: 0.08em;
  padding: 10px 22px;
  background: var(--accent); color: #fff;
  text-transform: uppercase;
  border: none; border-radius: 3px; cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn:hover:not(:disabled) { background: var(--accent-ink); transform: translateY(-1px); }

.btn--ghost-dark { background: var(--ink); color: var(--paper); }
.btn--ghost-dark:hover:not(:disabled) { background: #1a1f26; }

.btn-mini {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em;
  padding: 10px 12px; text-transform: uppercase;
  background: var(--ink); color: var(--paper);
  border: none; border-radius: 3px; cursor: pointer;
  white-space: nowrap;
}
.btn-mini:disabled { opacity: 0.5; cursor: not-allowed; }

.test-result {
  margin-left: 8px;
  font-family: var(--font-mono); font-size: 12px;
  padding: 6px 12px; border-radius: 3px;
  background: rgba(12, 15, 18, 0.04);
}
.test-result.ok { background: rgba(10, 125, 79, 0.1); color: #0a7d4f; }
.test-result.err { background: rgba(180, 35, 24, 0.1); color: #b42318; }
.test-result strong { margin-right: 6px; }
.test-result em { font-style: normal; }

.save-msg { margin-left: 8px; font-family: var(--font-mono); font-size: 12px; color: #b42318; }
.save-msg.ok { color: #0a7d4f; }

.chip {
  display: inline-block;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em;
  padding: 2px 8px; border-radius: 3px;
  border: 1px solid var(--line);
}
.chip--ok { background: rgba(10, 125, 79, 0.1); color: #0a7d4f; border-color: rgba(10, 125, 79, 0.3); }
.chip--warn { background: rgba(180, 120, 24, 0.12); color: #98660a; border-color: rgba(180, 120, 24, 0.3); }
.chip--dim { background: rgba(12, 15, 18, 0.04); color: var(--ink-soft); border-color: var(--line); }

.note {
  margin-top: 28px;
  padding: 14px 18px;
  border-left: 3px solid var(--accent);
  background: rgba(255, 90, 31, 0.04);
  font-size: 13px; color: var(--ink-soft); line-height: 1.6;
}

/* ---------- upload section ---------- */
.mode-tabs {
  display: inline-flex; gap: 0;
  border: 1px solid var(--line); border-radius: 4px;
  overflow: hidden;
  margin: 14px 0 0;
}
.mode-tab {
  font-family: var(--font-body); font-size: 13px;
  padding: 8px 18px; border: none; cursor: pointer;
  background: #fff; color: var(--ink-soft);
  border-right: 1px solid var(--line);
  transition: background 0.15s ease, color 0.15s ease;
}
.mode-tab:last-child { border-right: none; }
.mode-tab.active {
  background: var(--ink); color: var(--paper);
}

.upload-area {
  margin-top: 16px;
}
.file-drop {
  display: block;
  border: 2px dashed var(--line); border-radius: 6px;
  background: var(--paper);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.file-drop:hover { border-color: var(--accent); background: rgba(255, 90, 31, 0.02); }
.file-drop-inner {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 40px 24px;
}
.file-icon { font-size: 36px; }
.file-label { font-family: var(--font-display); font-size: 16px; font-weight: 600; }
.file-hint { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); }

.url-input {
  width: 100%;
  padding: 12px 14px;
  font-family: var(--font-mono); font-size: 13px;
  border: 1px solid var(--line); border-radius: 3px;
  background: var(--paper); color: var(--ink);
  outline: none;
}
.url-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(255, 90, 31, 0.15); }

.ingest-options {
  display: flex; gap: 20px; flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px; border-top: 1px solid var(--line);
}
.chk {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--ink-soft); cursor: pointer;
}
.chk input { accent-color: var(--accent); }
.chk.disabled { opacity: 0.4; cursor: not-allowed; }
.chk.disabled input { cursor: not-allowed; }

.inline-err {
  margin-left: 10px;
  font-family: var(--font-mono); font-size: 12px; color: #b42318;
}

/* ---------- progress panel ---------- */
.progress-card { margin-top: 24px; }
.progress-list {
  margin-top: 12px;
  max-height: 320px; overflow-y: auto;
  background: var(--ink); color: rgba(244, 242, 236, 0.85);
  border-radius: 4px; padding: 10px 14px;
  font-family: var(--font-mono); font-size: 12px;
}
.progress-line {
  display: flex; gap: 12px; padding: 3px 0;
  border-bottom: 1px dashed rgba(244, 242, 236, 0.08);
}
.progress-line:last-child { border-bottom: none; }
.progress-step {
  min-width: 60px;
  color: var(--accent); font-weight: 600;
}
.progress-line.err .progress-step { color: #f56c6c; }
.progress-line.done .progress-step { color: #7ed957; }
.progress-out { flex: 1; white-space: pre-wrap; word-break: break-all; color: rgba(244, 242, 236, 0.7); }
.progress-line.done .progress-out { color: rgba(244, 242, 236, 0.95); }

.product-summary {
  margin-top: 16px;
  padding: 16px 18px;
  border-left: 3px solid var(--ok);
  background: rgba(10, 125, 79, 0.06);
  border-radius: 3px;
}
.product-summary h4 {
  font-family: var(--font-display); font-size: 15px; margin: 0 0 10px;
}
.product-row {
  font-family: var(--font-mono); font-size: 12px; color: var(--ink-soft);
  padding: 2px 0;
}
.product-row strong { color: var(--ink); min-width: 80px; display: inline-block; }
.product-row code {
  font-family: var(--font-mono); font-size: 11px;
  background: rgba(12, 15, 18, 0.06);
  padding: 1px 6px; border-radius: 3px;
}

@media (max-width: 720px) {
  .grid2 { grid-template-columns: 1fr; }
  .card { padding: 20px; }
}
</style>
