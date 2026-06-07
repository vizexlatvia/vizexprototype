# Vercel upload checklist

GitHub repository root must contain these files and folders:

```text
package.json
package-lock.json
index.html
vite.config.ts
vercel.json
tsconfig.json
tsconfig.app.json
tsconfig.node.json
src/
public/
```

The most important source files are:

```text
src/main.tsx
src/App.tsx
src/components/AuthScreen.tsx
src/components/Dashboard.tsx
src/components/Toast.tsx
src/styles.css
public/assets/login-background.jpg
public/assets/vizex-logo-transparent.png
```

Do not upload only the ZIP file to GitHub. Extract it first, then upload the contents.

Do not upload:

```text
node_modules/
dist/
deploy-test/
```

If all files are inside a subfolder in GitHub, either move them to the repository root or set Vercel Project Settings -> Root Directory to that subfolder.
