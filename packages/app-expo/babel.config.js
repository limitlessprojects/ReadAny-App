module.exports = (api) => {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src",
          },
        },
      ],
      "babel-plugin-transform-import-meta",
      "react-native-reanimated/plugin",
    ],
  };
};
