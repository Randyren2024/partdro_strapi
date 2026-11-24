import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context'

/**
 * Ant Design 5 seed tokens for Partdro.
 *
 * Mirrors `app/assets/css/variables.css`. Keep both in sync when changing the palette.
 */
const fontFamily = [
  "'Barlow'",
  'system-ui',
  '-apple-system',
  "'Segoe UI'",
  "'Helvetica Neue'",
  'Arial',
  'sans-serif',
].join(', ')

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#e85d2a',
    colorInfo: '#e85d2a',
    colorSuccess: '#2f9e63',
    colorWarning: '#faad14',
    colorError: '#d94a3d',
    colorTextBase: '#171a1c',
    colorBgBase: '#f5f4f0',
    fontFamily,
    fontFamilyCode: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
    fontSize: 15,
    lineHeight: 1.65,
    borderRadius: 18,
    controlHeight: 40,
  },
  components: {
    Button: {
      fontWeight: 700,
      primaryShadow: 'none',
      controlHeightLG: 48,
      paddingInlineLG: 26,
      borderRadius: 999,
      borderRadiusLG: 999,
    },
    Card: {
      borderRadiusLG: 22,
    },
    Table: {
      headerBg: 'transparent',
      headerColor: '#73797a',
    },
    Collapse: {
      headerBg: 'transparent',
    },
    Select: {
      borderRadius: 999,
    },
  },
}