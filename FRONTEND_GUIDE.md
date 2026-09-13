# RoadLens frontend quick-edit guide

Use this guide to make safe, visible changes while an examiner is watching. Search the project for `FRONTEND EDIT:` to jump directly to the main customization points.

## Where the project is

Your complete project folder is:

```text
C:\Users\Faridun\Documents\Codex\2026-09-11\create-an-image-of\outputs\roadlens
```

To open it in Windows:

1. Open **File Explorer**.
2. Click the address bar at the top.
3. Paste the complete path above and press **Enter**.
4. Right-click an empty area and choose **Open with Code**, if that option is available.

Or open PowerShell and paste:

```powershell
cd "C:\Users\Faridun\Documents\Codex\2026-09-11\create-an-image-of\outputs\roadlens"
code .
```

If `code .` is not recognized, open VS Code manually, choose **File → Open Folder**, and select the `roadlens` folder.

The VS Code Explorer on the left will show this simplified structure:

```text
roadlens
├── app
│   ├── roadlens-app.tsx       public page structure
│   ├── globals.css            public page appearance
│   ├── dushanbe-map.tsx       map appearance and behavior
│   ├── language.tsx           translated text
│   └── review
│       ├── page.tsx           admin page structure
│       └── admin.css          admin page appearance
├── public                     icons and PWA files
├── inference                  Python detection service
└── FRONTEND_GUIDE.md          this guide
```

## Syntax you need to recognize

You do not need to learn all of React. For visual changes, recognize these three forms.

### 1. TSX controls what exists and where it appears

```tsx
<section className="map-panel">
  <Button onClick={openScan}>Start scan</Button>
</section>
```

- `<section>` is an opening tag.
- `</section>` is its closing tag.
- Everything between them is inside that section.
- `className="map-panel"` connects it to the `.map-panel` CSS rule.
- `onClick={openScan}` runs the existing function when clicked.
- Text without braces, such as `Start scan`, is visible on screen.
- Values inside `{curly braces}` are JavaScript. Do not translate or delete function names inside braces.

To move something, select the complete block from its opening tag through its matching closing tag, cut it with `Ctrl+X`, and paste it with `Ctrl+V` at the new position.

JSX comments look like this and do not appear on the website:

```tsx
{/* FRONTEND EDIT: explanation */}
```

### 2. CSS controls appearance and size

```css
.map-panel {
  background: #0a1511;
  min-height: 500px;
}
```

- `.map-panel` selects every element with `className="map-panel"`.
- `background` changes its color.
- `min-height` changes its minimum height.
- Each setting is written as `property: value;` and ends with a semicolon.
- `{` opens a CSS rule and `}` closes it.
- `px` means pixels, `%` means a percentage, and `1fr` means one share of available space.
- Colors such as `#b7f451` are hexadecimal color codes.

CSS comments look like this:

```css
/* FRONTEND EDIT: explanation */
```

### 3. Translation data controls labels

```ts
startScan: ["Start road scan", "Оғози санҷиши роҳ", "Начать осмотр дороги"],
```

The order is always English, Tajik, Russian. Keep the quotes, square brackets, commas, and key before the colon.

## Exact change finder

| Examiner asks for | Open this file | Search for this text |
| --- | --- | --- |
| Change the main colors | `app/globals.css` | `Global visual theme` |
| Make the sidebar narrower | `app/globals.css` | `Desktop split` |
| Make the map taller | `app/globals.css` | `Map rows are` |
| Change phone layout | `app/globals.css` | `Phone breakpoint` |
| Move dashboard or map | `app/roadlens-app.tsx` | `Main desktop layout` |
| Reorder public KPI cards | `app/roadlens-app.tsx` | `metrics-grid` |
| Move header buttons | `app/roadlens-app.tsx` | `Top navigation` |
| Change scan dialog | `app/roadlens-app.tsx` | `Complete photo-report dialog` |
| Change map zoom | `app/dushanbe-map.tsx` | `zoom: 12` |
| Change translated labels | `app/language.tsx` | The current visible words |
| Reorder admin KPI cards | `app/review/page.tsx` | `KPI cards` |
| Move admin queue/inspector | `app/review/page.tsx` | `Queue is the first column` |
| Resize admin columns | `app/review/admin.css` | `Admin columns are` |

In VS Code, press `Ctrl+P`, type a file path such as `app/globals.css`, and press **Enter** to open it quickly.

## Run the frontend

From the `roadlens` folder:

```powershell
npm run dev
```

Open `http://localhost:5173`. Most frontend edits refresh automatically after you save. Press `Ctrl+C` to stop the server.

Before presenting or deploying, run:

```powershell
npm test
npm run lint
npm run build
```

## Important frontend files

| File | What you change there |
| --- | --- |
| `app/roadlens-app.tsx` | Public dashboard structure, buttons, KPI cards, issue list, map area, and scan dialog |
| `app/globals.css` | Public colors, spacing, dimensions, desktop layout, and responsive breakpoints |
| `app/dushanbe-map.tsx` | Initial map center, zoom, markers, route line, and map controls |
| `app/language.tsx` | English, Tajik, and Russian interface text |
| `app/review/page.tsx` | Admin sections, table, inspector, filters, and workflow controls |
| `app/review/admin.css` | Admin dimensions and responsive layout |

## Common examiner requests

### Change colors

Open `app/globals.css` and edit the variables under `:root`:

```css
--background: #07100d; /* page background */
--foreground: #eef8f1; /* main text */
--primary: #b7f451;    /* main action color */
--border: #26382f;     /* borders */
--radius: 0.9rem;      /* global corner roundness */
```

Some status colors are written directly in the same file. Search for `.critical`, `.high`, `.medium`, and `.repaired` to change them.

### Make the map larger

In `app/globals.css`, find `.workspace`:

```css
grid-template-columns: minmax(320px, 28%) 1fr;
```

Reduce `28%` to give the map more horizontal space. Then find `.map-panel` and increase its `390px` minimum to make the map taller.

### Move the map before the dashboard

In `app/roadlens-app.tsx`, find the `FRONTEND EDIT: Main desktop layout` comment. Inside `<section className="workspace">` there are two siblings:

1. `<aside className="control-panel">`
2. `<section className="map-panel">`

Move the complete `map-panel` block above the `control-panel` block. Move whole blocks, including their closing tags; do not copy only their contents.

### Reorder KPI cards

Find `<div className="metrics-grid">` in `app/roadlens-app.tsx`. Each `<article>` is one card. Move complete `<article>...</article>` elements into the requested order. Keep the values inside `metrics.*` unchanged.

Admin KPI cards work the same way under `<div className="admin-kpis">` in `app/review/page.tsx`.

### Rename labels

For translated labels, edit `app/language.tsx`. Every value is ordered like this:

```ts
label: ["English", "Tajik", "Russian"]
```

For English-only messages, search for the exact visible sentence in `app/roadlens-app.tsx` or `app/review/page.tsx`.

### Move or hide a button

Move the entire `<Button>...</Button>` element. Keep its `onClick`, `disabled`, and `className` properties attached. To temporarily hide a button without deleting its behavior, add a class and hide that class in CSS:

```tsx
<Button className="demo-hidden" onClick={openScan}>...</Button>
```

```css
.demo-hidden { display: none; }
```

### Change the map start view

Open `app/dushanbe-map.tsx`. Change `DUSHANBE_CENTER` using `[latitude, longitude]`, and change `zoom: 12`. Typical Leaflet zoom levels are:

- `11` — wider city view
- `12` — current city view
- `14` — neighborhood view
- `16` — street-level view

Do not remove the OpenStreetMap attribution or expand the bounds without also updating `lib/dushanbe.ts`.

### Rearrange the admin panel

In `app/review/page.tsx`, `.admin-console` contains the report queue first and inspector second. Swap those two complete child `<div>` blocks to reverse them. In `app/review/admin.css`, change the `42%` in `.admin-console` to resize the queue column.

The audit trail is a complete `<section className="audit-panel">`. It can be moved above `.admin-console` without changing its internal logic.

## Rules that prevent accidental breakage

- Move complete JSX elements with matching opening and closing tags.
- Preserve `onClick`, `onChange`, `disabled`, `ref`, and `aria-*` properties.
- Keep the map dynamically imported with `ssr: false`; Leaflet requires the browser.
- Do not rename a CSS `className` unless you also rename every matching selector.
- Do not change API paths such as `/api/reports`, `/api/analyze`, or `/api/route` for visual work.
- Keep camera and upload inputs connected to `cameraRef` and `uploadRef`.
- Test both desktop and an iPhone-sized browser width after moving sections.
- If a change fails, undo only the last small edit and save again.

## Find every edit point

In VS Code, press `Ctrl+Shift+F` and search for:

```text
FRONTEND EDIT:
```

From PowerShell, run:

```powershell
rg -n "FRONTEND EDIT:" app
```
