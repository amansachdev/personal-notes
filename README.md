# Notepad

A simple, single-page shared notepad. Open the link and type or paste text; it saves automatically and syncs across devices. No account or sign-in is required.

The shared note is stored in Cloud Firestore at `notes/shared`. Firestore rules allow anyone to read and update that document, while blocking deletion and writes with a different shape. **Anyone who can access the app can read and edit the same note. Do not put private or sensitive information here.** The GitHub repository contains the app code, not the note contents.

## Firebase setup

The app uses the Firebase web configuration for the `note-taker-692b8` project. The values are supplied to the GitHub Pages build through repository Actions secrets:

| Secret | Firebase value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Web app API key |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |

The Firebase web configuration is public by design; Firestore rules control access. The default Firestore database is in Mumbai (`asia-south1`) on the Standard edition and is eligible for the free tier. Billing is not needed for this app's use of the free tier. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

## Run locally

```sh
npm install
cp .env.example .env
# Fill in the three Firebase values in .env, then:
npm run dev
```
