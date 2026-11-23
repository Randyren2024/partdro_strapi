export function useStrapiAsset() {
  const { public: { strapiUrl } } = useRuntimeConfig()
  // Strapi's local provider returns relative paths ("/uploads/x.jpg") that need
  // the Strapi origin prefixed. Remote providers (e.g. Supabase Storage) return
  // absolute URLs — those must pass through untouched.
  return (path?: string | null) => {
    if (!path) return ''
    if (/^https?:\/\//i.test(path)) return path
    return `${strapiUrl}${path}`
  }
}