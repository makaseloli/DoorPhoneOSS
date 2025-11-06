export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate'
    },
    icons: {
      light: 'material-symbols:sunny-outline',
      dark: 'material-symbols:nightlight-outline'
    },
    header: {
      slots: {
        toggle: 'hidden'
      }
    }
  }
})
