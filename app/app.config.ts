export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate'
    },
    icons: {
      light: 'ic:outline-light-mode',
      dark: 'ic:outline-dark-mode'
    },
    header: {
      slots: {
        toggle: 'hidden'
      }
    },
    dashboardNavbar: {
      slots: {
        toggle: 'hidden'
      }
    }
  }
})
