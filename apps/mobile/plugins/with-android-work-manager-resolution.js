const { withAppBuildGradle } = require("expo/config-plugins");

const marker = "// Organa WorkManager compatibility alignment";
const dependencyBlock = `${marker}
dependencies {
    implementation "androidx.work:work-runtime:2.8.1"
    implementation "androidx.work:work-runtime-ktx:2.8.1"
}`;

module.exports = function withAndroidWorkManagerResolution(config) {
  return withAppBuildGradle(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "groovy") {
      throw new Error("Organa requires a Groovy Android app build file.");
    }

    const contents = nextConfig.modResults.contents;
    if (!contents.includes(marker)) {
      nextConfig.modResults.contents = `${contents.trimEnd()}\n\n${dependencyBlock}\n`;
    }
    return nextConfig;
  });
};
