# Setting up LionCourse

You need Node.js 20+ and Java 21+ (Java is only for the local test database).

## 1. Create the Firebase project (one time, ~10 minutes)

1. Go to <https://console.firebase.google.com>, sign in with a **personal** Google account
   (not LionMail, in case Columbia restricts what school accounts can create), and click **Create a project**.
   Name it something like `lioncourse`.
2. **Turn on Google sign-in:** Build → Authentication → Get started → Sign-in method → Google → Enable → Save.
3. **Create the database:** Build → Firestore Database → Create database → pick a US location →
   start in **production mode** (our rules file replaces the defaults anyway).
4. **Register the website:** Project settings (gear icon) → General → Your apps → the `</>` (Web) icon.
   Give it a name, then copy the `firebaseConfig` values into `public/firebase-config.js`.

## 2. Install tools

```bash
npm install
npx firebase login
npx firebase use --add      # pick the project you just made
```

## 3. Run the privacy tests

```bash
npm test
```

This starts a throwaway local database and checks that outsiders, look-alike email domains,
and hidden profiles are all blocked. Every test should pass before you deploy.

## 4. Try it on your own computer

```bash
npm start
```

Open <http://localhost:5000>. Note: this uses the real Google sign-in and the **real** database,
because the page isn't wired to the local emulators. That's fine while you're the only user.

**First thing to check:** sign in with your LionMail account. If Google says Columbia has
blocked the app, Google sign-in won't work for Columbia accounts and we need a different plan.

## 5. Put it online

```bash
npm run deploy
```

This uploads the site and the database rules. Firebase prints the public address
(something like `https://lioncourse.web.app`). The free plan is plenty for a campus directory.
