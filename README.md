# Notepad

A simple online notepad: one plain-text note that autosaves and syncs between your devices after Google sign-in. The app is hosted as a static page on GitHub Pages; Firebase Authentication and Firestore handle sign-in and syncing.

## One-time setup

### Firebase

1. Create a **dedicated** project in the [Firebase Console](https://console.firebase.google.com/) on the **Spark (no-cost)** plan. Do not enable billing.
2. Add a Web app. Copy its API key, Auth domain, Project ID, and App ID.
3. In **Authentication → Sign-in method**, enable Google.
4. Create a Cloud Firestore database in production mode and publish [`firestore.rules`](firestore.rules) from the **Firestore → Rules** page.

The rules allow only a signed-in user to read or write the single note stored under their own user ID. Keep these rules in place. Firestore's free quota currently includes 1 GiB of stored data, 50,000 reads and 20,000 writes per day, and 10 GiB of monthly transfer; it applies to one database per project. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

### GitHub Pages

In this repository's **Settings → Pages**, select **GitHub Actions** as the source. Under **Settings → Secrets and variables → Actions**, add these four repository secrets using the values from the Firebase Web app:

| Secret | Firebase value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_APP_ID` | App ID |

In Firebase **Authentication → Settings → Authorized domains**, add `amansachdev.github.io`. Push to `main` to publish at `https://amansachdev.github.io/personal-notes/`.

The app's Firebase web configuration is public by design; Firestore rules protect the note. Never add a service account key to the repository. GitHub Pages and Firebase Spark are no-cost within their published limits. The public repository contains only the app code, not your note.

## Run locally

```sh
npm install
cp .env.example .env
# Fill in the four Firebase values in .env, then:
npm run dev
```
