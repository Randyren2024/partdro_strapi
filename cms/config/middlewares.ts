import type { Core } from '@strapi/strapi';

export default ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  // Media is stored in Supabase Storage and served from another origin, so the
  // admin panel's default CSP (img-src 'self' data: blob:) blocks every
  // thumbnail. Allow the Supabase host explicitly.
  const supabaseUrl = env('SUPABASE_URL', '');
  let supabaseOrigin = '';
  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : '';
  } catch {
    supabaseOrigin = '';
  }
  const mediaSrc = ["'self'", 'data:', 'blob:', 'https://*.supabase.co'];
  if (supabaseOrigin && !mediaSrc.includes(supabaseOrigin)) {
    mediaSrc.push(supabaseOrigin);
  }

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'img-src': mediaSrc,
            'media-src': mediaSrc,
          },
        },
      },
    },
    'strapi::cors',
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};