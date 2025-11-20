// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt({
  rules: {
    '@stylistic/semi': ['error', 'always'],
    '@stylistic/indent': ['error', 2],
    'eol-last': ['error', 'always']
  }
});
