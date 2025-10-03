module.exports = {
  extends: ['expo'],
  settings: {
    'import/resolver': {
      typescript: {
        project: __dirname + '/tsconfig.json',
      },
    },
  },
};
