import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.viami.app",
  appName: "via-mi",
  webDir: "native-shell",
  server: {
    url: "https://via-mi.com",
    cleartext: false,
    allowNavigation: ["via-mi.com", "www.via-mi.com"],
  },
  appendUserAgent: " via-mi-ios",
  backgroundColor: "#f7fcff",
  loggingBehavior: "none",
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
};

export default config;
