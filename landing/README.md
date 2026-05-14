# CIARA Landing Page

React + Vite landing page for CIARA.

## Local development

```powershell
cd C:\Users\MILES\Documents\ciara\landing
npm install
npm run dev
```

## Production build

```powershell
npm run build
npm run preview
```

The Windows download buttons serve the installer from:

```text
public/downloads/CIARA-Setup-1.0.0.exe
```

For Vercel, import this `landing` folder as the project root. Vercel will run `npm install`, `npm run build`, and publish `dist`.
