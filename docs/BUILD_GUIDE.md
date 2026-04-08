# Build Guide

## Development
```bash
cd game-client
npm run dev
```

## Production Build (Web)
```bash
cd game-client
npm run build
```

## Desktop (Electron / Steam)
```bash
# First build the game client
cd game-client && npm run build

# Then build Electron
cd ../electron
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

Output: dist-electron/

## Mobile (iOS / Android)
```bash
# First build the game client
cd game-client && npm run build

# Sync with Capacitor
npx cap sync

# Open in IDE
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio
```

## Steam Integration (Future)
- Install Steamworks SDK
- Add steam_appid.txt with your App ID
- Integrate via electron preload script

## App Store / Google Play (Future)
- iOS: Build from Xcode with signing profile
- Android: Build signed APK from Android Studio
