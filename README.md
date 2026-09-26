# Notes

A small, text-first notebook with Google sign-in and automatic cross-device sync. The app is a static site; Firebase Authentication and Cloud Firestore hold account identity and note data. Notes live under the signed-in user's ID, and the included Firestore rules prevent one account from reading another account's notes.

## Set it up

### 1. Create a free Firebase project

Create a dedicated project at [Firebase Console](https://console.firebase.google.com/) so these notes stay separate from any other app data. Choose the **Spark (no-cost)** plan; do not enable billing. Add a Web app and copy its API key, Auth domain, Project ID, and App ID.

In **Authentication → Sign-in method**, enable Google. In **Firestore Database**, create the database in production mode, then publish the rules in [`firestore.rules`](firestore.rules) (Firebase Console → Firestore → Rules). These rules let each signed-in user read and change only their own notes. Avoid adding a broad test rule such as `allow read, write: if true`.

Firestore's free quota currently includes 1 GiB stored data, 50,000 reads and 20,000 writes per day, and 10 GiB monthly transfer. Free quota applies to one database per project. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas). The app stores text only and autosaves after a short pause.

### 2. Run locally

```sh
npm install
cp .env.example .env
```

Fill in the four Firebase values in `.env`, then run `npm run dev`. Add `localhost` to Firebase Authentication's authorized domains if Firebase requires it.

### 3. Publish with GitHub Pages

In the repository's **Settings → Pages**, select **GitHub Actions** as the build source. Add these Actions repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Firebase web app value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_APP_ID` | App ID |

Add `amansachdev.github.io` to Firebase Authentication → Settings → Authorized domains. Push to `main` to publish; the workflow deploys to `https://amansachdev.github.io/personal-notes/`.

Firebase web app configuration is public by design; the Firestore security rules enforce data access. Do not put a service account key in this repository or in a `VITE_` variable. GitHub Pages and Firebase Spark can run this small, text-only app at no cost within their published limits. The code repository itself is public, but it contains no note data.
