# Captured pages

Real pages, exported from a browser and labelled by hand. Anything dropped here
as `<name>.json` becomes a corpus page with `source: real` — the one source
value that cannot be earned by writing a file.

The corpus is currently **38 pages and none of them is real**. Closing that is
the remaining half of TASKS.md T1.1.

## Capturing

Build with the export enabled. This project is developed on Windows, so the
PowerShell form comes first:

```powershell
$env:SHIELD_DEV = '1'
npm run build
```

```bash
SHIELD_DEV=1 npm run build     # bash / zsh
```

`$env:` persists for the whole PowerShell window, so clear it afterwards or
every later build in that terminal still carries the export:

```powershell
Remove-Item Env:\SHIELD_DEV
npm run build
```

Confirm which kind of build you have by reading the bundle rather than trusting
the terminal:

```powershell
Select-String -Path dist\popup.js -Pattern 'wireCorpusCapture'
```

A shipping build gives no match at all — the panel is absent, not hidden.

Then:

1. Reload the extension, open the page, open the popup, expand **Capture this
   page for the corpus**.
2. Type one line saying what the page is.
3. **Read the page** lists every value the file would contain. Read it.
4. **Save these values to a file** writes the export. There is no one-click
   path, deliberately — the file carries field values verbatim.

To capture a `file://` test screen, turn on **Allow access to file URLs** for
Shield in `chrome://extensions`.

Capture from **logged-out or synthetic-data pages only**. Values are exported
as they are, because a benchmark fed sanitised input measures a detector on a
page that does not exist: Verhoeff runs on the actual digits, and the Aadhaar
rule reads the leading one. See DECISIONS.md 171.

No URL is recorded, for the reason DECISIONS.md 148 gives for the audit log.

## Labelling

Add two keys to the exported JSON:

```json
{
  "about": "State transport booking, logged out",
  "sensitive": [
    { "elementId": "e7", "category": "id_number" },
    { "elementId": "e9", "category": "phone" }
  ]
}
```

Categories: `password`, `name`, `email`, `phone`, `address`, `face`,
`id_number`, `other`.

**Label the page, never the detector output.** Do not run the benchmark and
then write labels that match it — a corpus labelled from output scores 100% by
construction and goes on scoring 100% through every regression. Label anything
a careful person would not want transmitted, *including* things the DOM path
cannot reach: a name in prose, an identifier inside an image, an amount. Those
count as misses, they lower the recall figure, and that figure is the honest
one.

Everything not named in `sensitive` counts as something that must NOT be
flagged. That is what makes precision measurable, so leaving a page half
labelled does not produce a partial score — it produces a wrong one.

A file with no `sensitive` array is **skipped and named** in the report rather
than scored, because a page with no labels would otherwise read as a page with
nothing sensitive on it and quietly raise precision.

## Before committing one of these

Open it and read it. It contains whatever was on the screen.
