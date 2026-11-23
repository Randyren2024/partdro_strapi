'use strict';

/**
 * Strapi upload provider backed by Supabase Storage.
 *
 * The bucket must exist and be public (read access). Files are written with
 * `x-upsert: true`, so re-uploading the same hash simply overwrites.
 *
 * Config (cms/config/plugins.ts → upload.config.providerOptions):
 *   url      – https://<project-ref>.supabase.co
 *   key      – service_role key (server-side only)
 *   bucket   – bucket name, defaults to "product-media"
 */
module.exports = {
  init(options = {}) {
    const url = String(options.url || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = options.key || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const bucket = options.bucket || process.env.SUPABASE_STORAGE_BUCKET || 'product-media';

    if (!url || !key) {
      throw new Error(
        '[upload-supabase] Missing credentials: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
      );
    }

    const objectPath = (file) => `${file.hash}${file.ext}`;
    const publicUrl = (file) => `${url}/storage/v1/object/public/${bucket}/${objectPath(file)}`;

    async function putObject(file, body) {
      const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath(file)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          'Content-Type': file.mime || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'x-upsert': 'true',
        },
        body,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`[upload-supabase] upload failed (${res.status}): ${detail.slice(0, 300)}`);
      }
      file.url = publicUrl(file);
    }

    return {
      async upload(file) {
        if (!file.buffer) throw new Error('[upload-supabase] missing file buffer');
        await putObject(file, file.buffer);
      },

      async uploadStream(file) {
        if (!file.stream) throw new Error('[upload-supabase] missing file stream');
        const chunks = [];
        for await (const chunk of file.stream) chunks.push(chunk);
        await putObject(file, Buffer.concat(chunks));
      },

      async delete(file) {
        const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath(file)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${key}`, apikey: key },
        });
        // Supabase returns 404 (or 400 "not found") for objects that never existed.
        if (!res.ok && res.status !== 404) {
          const detail = await res.text().catch(() => '');
          throw new Error(`[upload-supabase] delete failed (${res.status}): ${detail.slice(0, 300)}`);
        }
      },
    };
  },
};