module.exports = {
  extends: ['expo'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.ts', '.tsx']
      },
      typescript: {
        project: __dirname + '/tsconfig.json',
      },
    },
  },
};
