/**
 * Attribution fields sent with inquiry submissions so the CMS record keeps
 * track of where the form was filled in.
 */
export function attributionFields(path: string, productSlug: string | null) {
  return {
    page: path,
    productSlug: productSlug ?? undefined,
  }
}