# Notepad

A simple shared notepad with multiple tabs. Open the link and type or paste text; tabs save automatically and sync across devices. Add, rename, and delete as many tabs as you need. No account or sign-in is required.

Tabs are stored in Cloud Firestore in the `notepadTabs` collection. **Anyone who can access the app can read, edit, create, rename, and delete tabs. Do not put private or sensitive information here.** The GitHub repository contains the app code, not note contents.

## Firebase setup

The app uses the Firebase web configuration for the `note-taker-692b8` project. The values are supplied to the GitHub Pages build through repository Actions secrets:

| Secret | Firebase value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Web app API key |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |

The Firebase web configuration is public by design; Firestore rules control data access. The default Firestore database is in Mumbai (`asia-south1`) on the Standard edition and is eligible for the free tier. Usage is subject to [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

## Run locally

```sh
npm install
cp .env.example .env
# Fill in the three Firebase values in .env, then:
npm run dev
```
