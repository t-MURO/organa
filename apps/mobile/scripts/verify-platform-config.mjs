import { readFile } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);
const repoRoot = new URL("../../../", import.meta.url);
const [
  appConfigText,
  packageText,
  easConfigText,
  gradleProperties,
  androidAppBuildGradle,
  androidManifest,
  workManagerPlugin,
  podfilePropertiesText,
  xcodeProject,
  platformSupport,
  browserSupport,
  requirements,
] = await Promise.all([
  readFile(new URL("app.json", appRoot), "utf8"),
  readFile(new URL("package.json", appRoot), "utf8"),
  readFile(new URL("eas.json", appRoot), "utf8"),
  readFile(new URL("android/gradle.properties", appRoot), "utf8"),
  readFile(new URL("android/app/build.gradle", appRoot), "utf8"),
  readFile(
    new URL("android/app/src/main/AndroidManifest.xml", appRoot),
    "utf8",
  ),
  readFile(
    new URL(
      "plugins/with-android-work-manager-resolution.js",
      appRoot,
    ),
    "utf8",
  ),
  readFile(new URL("ios/Podfile.properties.json", appRoot), "utf8"),
  readFile(
    new URL("ios/Organa.xcodeproj/project.pbxproj", appRoot),
    "utf8",
  ),
  readFile(new URL("docs/PLATFORM_SUPPORT.md", repoRoot), "utf8"),
  readFile(new URL("docs/BROWSER_SUPPORT.md", repoRoot), "utf8"),
  readFile(new URL("REQUIREMENTS.md", repoRoot), "utf8"),
]);

const appConfig = JSON.parse(appConfigText).expo;
const packageJson = JSON.parse(packageText);
const easConfig = JSON.parse(easConfigText);
const podfileProperties = JSON.parse(podfilePropertiesText);
const checks = [];

const buildPropertiesEntry = appConfig.plugins.find(
  (entry) => Array.isArray(entry) && entry[0] === "expo-build-properties",
);
const androidBuild = buildPropertiesEntry?.[1]?.android;

ok(appConfig.ios.deploymentTarget === "16.4", "source pins iOS 16.4");
ok(
  easConfig.build?.["preview-simulator"]?.extends === "preview" &&
    easConfig.build["preview-simulator"].environment === "preview" &&
    easConfig.build["preview-simulator"].ios?.simulator === true,
  "EAS has a preview-configured standalone iOS Simulator profile",
);
ok(
  androidBuild?.minSdkVersion === 24 &&
    androidBuild.compileSdkVersion === 36 &&
    androidBuild.targetSdkVersion === 36 &&
    androidBuild.buildToolsVersion === "36.0.0",
  "source pins Android API 24/36/36 and Build Tools 36",
);
ok(
  packageJson.dependencies.expo === "~57.0.8" &&
    packageJson.dependencies["expo-build-properties"] === "~57.0.7",
  "Expo and build-properties versions match the selected contract",
);
ok(
  appConfig.plugins.includes(
    "./plugins/with-android-work-manager-resolution",
  ) &&
    workManagerPlugin.includes(
      'implementation "androidx.work:work-runtime:2.8.1"',
    ) &&
    workManagerPlugin.includes(
      'implementation "androidx.work:work-runtime-ktx:2.8.1"',
    ) &&
    androidAppBuildGradle.includes(
      'implementation "androidx.work:work-runtime:2.8.1"',
    ) &&
    androidAppBuildGradle.includes(
      'implementation "androidx.work:work-runtime-ktx:2.8.1"',
    ),
  "source plugin and generated app align WorkManager runtime artifacts",
);

for (const property of [
  "android.minSdkVersion=24",
  "android.compileSdkVersion=36",
  "android.targetSdkVersion=36",
  "android.buildToolsVersion=36.0.0",
]) {
  ok(
    gradleProperties.includes(property),
    `generated Gradle properties include ${property}`,
  );
}

ok(
  podfileProperties["ios.deploymentTarget"] === "16.4",
  "generated Podfile properties pin iOS 16.4",
);

const xcodeTargets = [
  ...xcodeProject.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = "?([^";]+)"?;/g),
].map((match) => match[1]);
ok(
  xcodeTargets.length >= 6 && xcodeTargets.every((target) => target === "16.4"),
  "all generated iOS app and widget configurations target iOS 16.4",
);
ok(
  androidManifest.includes('android:allowBackup="false"'),
  "generated Android application backup remains disabled",
);

for (const permission of [
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.SYSTEM_ALERT_WINDOW",
]) {
  ok(
    new RegExp(
      `<uses-permission android:name="${permission.replaceAll(".", "\\.")}" tools:node="remove"\\s*/>`,
    ).test(androidManifest),
    `generated Android manifest removes ${permission}`,
  );
}

ok(
  platformSupport.includes("iOS/iPadOS 16.4 or newer") &&
    platformSupport.includes("Android 7.0 (API 24) or newer"),
  "platform document states the selected native minimums",
);
ok(
  platformSupport.includes("| Today Tasks widget | Supported | Supported |") &&
    platformSupport.includes("| Next Reminder widget | Supported | Supported |") &&
    androidManifest.includes('android:name=".widget.TodayTasksWidget"') &&
    androidManifest.includes('android:name=".widget.NextReminderWidget"'),
  "platform contract and generated Android manifest include both mobile widgets",
);
ok(
  platformSupport.includes("https://docs.expo.dev/versions/latest/") &&
    platformSupport.includes(
      "https://docs.expo.dev/versions/latest/sdk/widgets/",
    ),
  "platform contract links its authoritative Expo references",
);
ok(
  browserSupport.includes("current stable releases") &&
    browserSupport.includes("active-tab reminders remain available"),
  "browser policy remains versioned and fail-visible",
);
ok(
  !requirements.includes("- Supported OS and browser version matrix"),
  "platform matrix is no longer an unresolved product decision",
);

console.log(
  `Platform configuration verification passed (${checks.length} checks).`,
);

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}
