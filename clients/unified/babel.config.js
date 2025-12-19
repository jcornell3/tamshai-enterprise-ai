module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Fix Chakra Regex Compatibility (ES2018+ features not supported)
    // These plugins transpile modern regex to ES5-compatible patterns
    '@babel/plugin-transform-named-capturing-groups-regex',
    '@babel/plugin-transform-unicode-property-regex',
  ],
};
