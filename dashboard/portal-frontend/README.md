# Portal Frontend Folder

## What goes here?

This folder will contain the **built frontend files** from your Lovable project.

After you download the frontend build from Lovable, you'll extract the `dist` folder here.

## Expected structure:

```
portal-frontend/
└── dist/
    ├── index.html
    ├── assets/
    │   ├── index-[hash].js
    │   ├── index-[hash].css
    │   └── [other assets]
    └── vite.svg (or other static files)
```

## Instructions:

1. Go to Lovable project: https://lovable.dev/projects/30da4f04-f806-4927-811f-a7a92cf51094
2. Click "Share" → "Download Project" → Get the build files
3. Extract the `dist` folder from the download
4. Place the `dist` folder inside this `portal-frontend` folder
5. The backend will automatically serve these files!

## Status:

- [x] Folder created
- [ ] Frontend dist files added (waiting for Lovable download)

Once the `dist` folder is here, the backend will serve:
- Frontend at: `https://your-portal-domain.com/`
- API at: `https://your-portal-domain.com/api/portal/*`

No CORS issues, no cookie blocking, everything on the same domain! 🎉
