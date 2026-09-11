// @ts-ignore - types available after `npm i @capacitor/cli` in native/android
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hajatmanager.app",
  appName: "Hajat Manager",
  webDir: "../../out",
  server: {
    // dev: url: "http://10.0.2.2:3000" untuk emulator
    androidScheme: "https"
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/CapacitorDatabase",
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login"
      }
    }
  },
  android: {
    minVersion: "12.0",
    targetSdkVersion: 34
  }
};

export default config;
