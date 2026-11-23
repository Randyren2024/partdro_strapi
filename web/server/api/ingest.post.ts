// POST /api/ingest
// Accepts either:
//   - multipart/form-data with a "pdf" file field, or
//   - multipart/form-data or application/json with { url: "https://..." }
// Optional flags: post? (POST to Strapi), publish? (also publish)
//
// Spawns scripts/ingest/ingest.py as a subprocess and streams NDJSON lines:
//   {"step":"start","ok":true,...}
//   {"step":"extract","stage":"[1/3]","out":"..."}
//   {"step":"ai","stage":"[2/3]","out":"..."}
//   {"step":"strapi","stage":"[3/3]","out":"..."}
//   {"step":"done","ok":true,"product":{...}}
//   {"step":"error","ok":false,"error":"..."}

import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INGEST_SCRIPT = join(__dirname, '..', '..', 'scripts', 'ingest', 'ingest.py')

const MAX_PDF_BYTES = 80 * 1024 * 1024 // 80 MB

type ProgressLine = { step: string; stage?: string; ok?: boolean; out?: string; error?: string; [k: string]: any }

export default defineEventHandler(async (event) => {
  const contentType = getRequestHeader(event, 'content-type') || ''
  const isMultipart = contentType.startsWith('multipart/form-data')

  let outDir: string
  try {
    outDir = await mkdtemp(join(tmpdir(), 'ingest-web-'))
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: `无法创建临时目录: ${err?.message}` })
  }

  // ---------- Parse input ----------
  let post = false
  let publish = false
  let source: string
  let sourceLabel: string

  if (isMultipart) {
    // Read the multipart body exactly once — a second readMultipartFormData()
    // call returns nothing because the request stream is already consumed.
    const form = await readMultipartFormData(event)
    if (!form?.length) throw createError({ statusCode: 400, statusMessage: '表单为空' })

    const fields = new Map<string, string>()
    for (const part of form) {
      if (!part.name) continue
      if (!part.filename) fields.set(part.name, part.data.toString('utf-8'))
    }
    post = fields.get('post') === 'true'
    publish = fields.get('publish') === 'true'

    const file = form.find((p) => (p.name === 'pdf' || p.name === 'file') && p.filename)
    const urlField = (fields.get('url') || '').trim()

    if (file) {
      if (!file.filename.toLowerCase().endsWith('.pdf')) {
        throw createError({ statusCode: 400, statusMessage: '请上传 .pdf 文件' })
      }
      if (!file.data?.length) throw createError({ statusCode: 400, statusMessage: '文件为空' })
      if (file.data.length > MAX_PDF_BYTES) {
        throw createError({ statusCode: 413, statusMessage: `文件超过 ${(MAX_PDF_BYTES / 1024 / 1024) | 0} MB` })
      }
      const tempPdf = join(outDir, file.filename)
      await writeFile(tempPdf, file.data as Buffer)
      source = tempPdf
      sourceLabel = `${file.filename} (${(file.data.length / 1024 / 1024).toFixed(1)} MB)`
    } else if (urlField) {
      if (!/^https?:\/\//i.test(urlField)) {
        throw createError({ statusCode: 400, statusMessage: 'URL 必须以 http(s):// 开头' })
      }
      source = urlField
      sourceLabel = urlField
    } else {
      throw createError({ statusCode: 400, statusMessage: '需要 pdf 文件或 url 字段' })
    }
  } else {
    const body = (await readBody(event)) as Record<string, unknown>
    if (typeof body?.url === 'string' && body.url.trim()) {
      source = body.url.trim()
      sourceLabel = source
    } else {
      throw createError({ statusCode: 400, statusMessage: '需要 multipart pdf 字段或 { url: ... }' })
    }
    post = body?.post === true || body?.post === 'true'
    publish = body?.publish === true || body?.publish === 'true'
  }

  // ---------- Build CLI args ----------
  const args: string[] = ['-u', INGEST_SCRIPT, source, '--out', outDir]
  if (post) args.push('--post')
  if (publish) args.push('--publish')

  // Forward Strapi env vars so ingest.py --post works even though it's called
  // from Nuxt (a different process env).
  const extraEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1', // without this, Python block-buffers stdout and the UI shows nothing until exit
    PYTHONIOENCODING: 'utf-8',
  }
  const config = useRuntimeConfig(event)
  // ingest.py needs a writable token (the read-only NUXT_STRAPI_TOKEN gets 403
  // on POST). Prefer the Full Access token and leave STRAPI_TOKEN unset when we
  // don't have one so ingest.py's own NUXT_STRAPI_FULL_TOKEN fallback kicks in.
  const writeToken = process.env.NUXT_STRAPI_FULL_TOKEN || ''
  if (writeToken) extraEnv.STRAPI_TOKEN = writeToken
  else delete extraEnv.STRAPI_TOKEN
  if (config.public?.strapiUrl) extraEnv.STRAPI_URL = config.public.strapiUrl

  // ---------- Stream response ----------
  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  // h3 1.x wants an actual Readable — not a callback — so pump a PassThrough.
  const stream = new PassThrough()
  const send = (line: ProgressLine) => {
    stream.write(JSON.stringify(line) + '\n')
  }

  send({ step: 'start', ok: true, out: `已接收: ${sourceLabel}` })

  let child: ReturnType<typeof spawn>
  try {
    child = spawn('python', args, {
      env: extraEnv,
      windowsHide: true,
      timeout: 600_000, // 10 min
    })
  } catch (err: any) {
    send({ step: 'error', ok: false, error: `无法启动 Python: ${err?.message}` })
    stream.end()
    return sendStream(event, stream)
  }

  // ingest.py prints stage banners like "[1/3] PDF extract → ..."; map them
  // onto stable step names so the UI can render per-phase progress.
  let stage = 'run'
  const tagStage = (line: string) => {
    if (line.includes('[1/3]')) stage = 'extract'
    else if (line.includes('[2/3]')) stage = 'ai'
    else if (line.includes('[3/3]')) stage = 'strapi'
    return stage
  }

  const forward = (raw: string, streamName: 'stdout' | 'stderr') => {
    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim()
      if (!text) continue
      tagStage(text)
      // ingest.py / its children emit JSON summaries — surface them as done/error.
      if (text.startsWith('{')) {
        try {
          const parsed = JSON.parse(text)
          if (parsed.ok === false) {
            send({ step: 'error', ok: false, error: parsed.error || JSON.stringify(parsed.errors ?? parsed), stage })
            continue
          }
          if (parsed.ok === true) {
            send({ step, ok: true, stage, out: text })
            continue
          }
        } catch { /* not JSON, fall through */ }
      }
      send({ step: stage, ok: streamName === 'stdout', stage, out: text })
    }
  }

  child.stdout?.on('data', (buf) => forward(buf.toString('utf-8'), 'stdout'))
  child.stderr?.on('data', (buf) => forward(buf.toString('utf-8'), 'stderr'))

  child.on('error', (err) => {
    send({ step: 'error', ok: false, error: `spawn error: ${err.message}` })
  })

  child.on('close', async (code) => {
    let productSummary: any = null
    try {
      const fs = await import('node:fs/promises')
      const txt = await fs.readFile(join(outDir, 'product.json'), 'utf-8')
      const p = JSON.parse(txt)
      productSummary = {
        name: p.name,
        code: p.code,
        slug: p.slug,
        sectionCount: (p.sections ?? []).length,
      }
    } catch { /* no product.json — extraction failed or --skip-ai */ }

    if (code === 0) {
      send({ step: 'done', ok: true, outDir, product: productSummary })
    } else {
      send({ step: 'error', ok: false, exitCode: code })
    }

    // Keep the output dir when the run succeeded without posting to Strapi
    // (the UI tells the user the JSON is there), clean it otherwise.
    if (!(code === 0 && !post)) {
      try { await rm(outDir, { recursive: true, force: true }) } catch {}
    }

    stream.end()
  })

  return sendStream(event, stream)
})