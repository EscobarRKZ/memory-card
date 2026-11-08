# Memory Card — Android / Google Play packaging preflight (v91)

**State: NOT signed or built. No Android package ID, signing certificate, App Bundle or Google Play listing has been created.**

The existing web app is hosted at **https://escobarrkz.github.io/memory-card/**. Its PWA manifest, icon and Service Worker are published. The app is a natural candidate for an Android **Trusted Web Activity (TWA)** packaged with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).

## Confirmed blocker: association file must be on the HOST ROOT

Android Digital Asset Links requires:

\`https://escobarrkz.github.io/.well-known/assetlinks.json\`

**NOT** \`https://escobarrkz.github.io/memory-card/.well-known/assetlinks.json\`.

On 2026-11-09 the host-root URL was checked and returned **404**. GitHub Pages is currently serving the application from a repository **project path**. Adding \`.well-known/\` inside the Memory Card repository would only create the wrong project-path URL. To fix this, either:

1. Manage a separate GitHub Pages **user-site root** repository for the owner (\`EscobarRKZ/escobarrkz.github.io\`) so it publishes \`/.well-known/assetlinks.json\`, or
2. Move Memory Card to a domain the developer owns and can publish from its root, configuring DNS/HTTPS, links and Supabase redirect allowlists first.

Do not create an assetlinks file with invented package names or signatures. Do not use an unrelated company domain without permission.

Official spec: https://developers.google.com/digital-asset-links/v1/create-statement

## Developer-controlled steps (after deciding package ID and signing)

1. Select a permanent package ID and create or obtain a signing key **outside public GitHub**. For Google Play App Signing, use the appropriate **app signing certificate** SHA-256 fingerprint from Play Console; upload and debug certs differ. Keep keys in a secure private location.
2. Check official requirements at submission: from 2026-08-31, new regular Android apps require **target API 36 (Android 16)** or newer. https://support.google.com/googleplay/android-developer/answer/11926878
3. Install Node 18+ and Android SDK/JDK, then install Bubblewrap:
   \`\`\`sh
   npm install -g @bubblewrap/cli
   bubblewrap validate --url=https://escobarrkz.github.io/memory-card/
   bubblewrap init --manifest=https://escobarrkz.github.io/memory-card/manifest.webmanifest
   \`\`\`
   During initialization, choose the **approved package ID**, real app details and private signing configuration. Inspect generated Android project: raise \`targetSdkVersion\` to at least **36** and use a compatible Android Gradle Plugin/build toolchain. Then run \`bubblewrap update\` if needed and \`bubblewrap build\` to build signed artifacts. Do not upload a bundle until tests and permissions are complete.
4. Once a real SHA-256 app signing cert is available, generate the JSON with:
   \`\`\`sh
   node scripts/generate-assetlinks.mjs --package YOUR_REAL_PACKAGE_ID \
     --fingerprint AA:BB:CC:...:FF --output ./android/assetlinks.json
   \`\`\`
   The fingerprint example above is **not usable**; supply the actual 32-byte SHA-256 colon-separated fingerprint. The generator refuses missing/invalid fingerprints and will not overwrite an existing file.
5. Publish that JSON **at the host root** specified above. Test HTTP 200, no redirects, correct \`application/json\` content type, matching package and fingerprint. Invalid association makes the TWA show as a Custom Tab instead of fully trusted fullscreen.
6. Install the signed test APK on an actual Android phone, verify fullscreen trust/Back/keyboard/rotation/offline, login, local library, sync, deletion page and re-entry after backgrounding.
7. Complete Play Console policies: final privacy/support contact, data safety, deletion URL, social reporting moderation, copyrighted cover permissions, billing rules if monetized, testing eligibility and store listing.

Android TWA overview: https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities

## Operational guarantees

No signing key is stored in this repository. No fake package ID, certificate fingerprint, passwords or production credentials are committed. The new \`android/assetlinks.json\` output is deliberately ignored by Git. A real AAB and verified asset association remain **blocked** until the developer's package and signing decisions are available.
