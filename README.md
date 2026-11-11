# FileVault 3.0.1

- **Reader – Continue Reading** now only shows collections of the tab you are on: the Novels tab lists novels only, the Manga tab lists manga only.
- **Reader – "Failed to fetch" on novels**: EPUB/TXT books are now read through the Android plugin first (then Capacitor Filesystem, then the WebView address as a last resort), so file names with apostrophes, brackets or other special characters no longer matter. If it still fails, the toast now shows the real reason in brackets, e.g. "Could not read this book (File not found.)". Send me that text.

# FileVault 3.0

Offline Android file organizer with CineVault built in. Same Capacitor + GitHub Actions build as before.

## What changed in 3.0: Reader looks and works like Star Stream's Manhua and Novel pages
The Reader tab now uses the same layout as Star Stream (cover grid, categories, series page), painted with FileVault's own theme, so every theme and accent color applies. Your files are still opened in place and never copied. Your existing folders, progress and bookmarks are kept.

- **Library**: covers in a grid with two badges on each cover (accent = unread chapters, darker = total chapters). **Manga** and **Novels** tabs on top, then **category tabs** (Default, your own, and a + tab). Your selected tab is remembered per kind.
- **Search** (magnifier, searches every category), **Filter & sort** (icon turns accent colored when active): has unread / started / completed / favorites only, sort by last read, title, most chapters, date added.
- **Categories**: + tab or the three-dot menu, Manage categories (add, rename, reorder, delete). Deleting a category never deletes folders, they go back to Default. Included in backups.
- **Series page** (tap a cover): blurred-cover header, cover, title, author, chapter count, status (Not started / Reading / Completed), category. Action row: **Favorite**, **Category**, **Progress %**, **Add**. Collapsible **synopsis** and **genre chips** (the pencil edits name, synopsis, genres and cover). Chapter list is **newest first**; the sort button in the top bar flips it and remembers your choice. Read chapters show a check, a partly read one shows a progress ring. Each row has a three-dot menu (Mark read / unread, Remove from folder). A floating **Resume / Start** button continues where you stopped.
- **Novels**: a novel folder holding one book lists that book's **own chapters** (read from the EPUB contents list), so you can jump straight to any chapter. The synopsis and genres are picked up from the EPUB itself; you can overwrite them with the pencil. Row menu: **Mark read up to here** and **Mark this and later chapters unread**. A folder with several books lists the books instead.
- A chapter you scroll to the end of now counts as read, and the next one becomes the current chapter.
- The Continue Reading strip, subfolders, bookmarks and the manga and novel readers themselves are unchanged.

### Files
`www/js/reader2.js` is new (library and series pages). `reader.js` only got small changes (EPUB synopsis/genres, and book info no longer overwrites the saved chapter list). Plus new icons in `index.html`, styles at the end of `css/app.css`, and category backup in `settings.js`.

### "Failed to fetch" when opening a novel
Book names with an apostrophe (for example "Omniscient Reader's Viewpoint") broke the file address in builds before 2.9. This build keeps the 2.9 fix: addresses are escaped, and if the WebView still refuses to fetch a file, the book is read through the Android plugin instead. If you still see it after installing this version, send the exact toast text and the file size.

## Build
1. Upload everything in this folder to a GitHub repo (keep `.github`).
2. Actions -> Build FileVault APK -> Run workflow.
3. Download `filevault-debug-apk`, install the APK, grant "All files access", tap the scan button.

## What changed in 2.9
- **"Failed to fetch" when opening a novel or manga**: file addresses now escape characters such as the apostrophe in names like "Reader's Viewpoint", and if the WebView still cannot fetch a file, the Reader reads it through the Android plugin instead (files up to 40 MB; larger files still use streaming).
- **Reader - novels**: a collection card now keeps its own name. Before, once its cover loaded, a novel collection such as "My Fantasy Novels" was renamed to the title of the first book inside it.
- **Reader - Continue Reading**: the top of the Reader tab shows **one card per collection** (manga and novels together, most recent first), not one card per chapter. Manga cards read "Manga · 2 chapters recently read" with **Continue Chapter N**; novel cards read "Novels · 3 books" with **Continue reading** and a progress bar. Tap a card to resume exactly where you stopped; the small folder icon opens the collection instead.
- **Reader - recently opened collections**: sort the folder grid by **Recently read** (default) or **A-Z**. Inside a manga collection the chapter you stopped on is highlighted ("continue here").
- **Reader - manga**: jumping with the page slider in webtoon mode now saves your page (before, only scrolling saved it, so Continue could return to an older page).
- **Reader - reading backgrounds**: new **Sepia** and **Night** next to App theme, Paper and Black.
- **Accent colors** are now true circles (they were stretched into ovals), and the one you picked shows a ring.

### Added in 2.8
- **Albums**: names, **descriptions** and **cover photos** (only a small copy of the picture is kept), **nested subfolders** (a subfolder can hold subfolders), **sort** (recently added, name, newest, oldest, largest), **grid size** (list, small, medium, large), **search inside an album or subfolder**, and a **favorites only** filter. Originals are never touched.
- **Reader**: **.txt books** (chapters are detected from "Chapter 1"-style lines, otherwise the text is cut into parts), **.pdf** books (opened in the PDF viewer), **.cbr** comics (works when the file is really a ZIP, which most are; a true RAR shows a clear message), **custom folder covers and descriptions**, **favorite folders** with a Favorites filter, and **bookmarks** inside every novel and manga series (bookmark button in the reader bar).
- **CineVault watch history**: clock button in CineVault (also Settings > Tools and Search everything): in-progress and finished videos with dates, remove one or clear all. Resume from the exact second already worked.
- **Biometric unlock**: Settings > Lock > "Unlock with fingerprint or face". Uses Android's own prompt (Android 9+). The pattern always still works. This only unlocks the app screen; it does not encrypt your files.
- Backups now also carry bookmarks and watch history.

### Added in 2.7
- **Sleep timer** (Now playing): 15, 30, 45 or 60 minutes. It runs inside the Android music service, so it still stops the music with the screen off.
- **Equalizer** (Now playing or Settings > Tools): per-band sliders plus Flat, Bass boost, Treble boost, Vocal and Rock presets, using the phone's own equalizer. Needs the new `MODIFY_AUDIO_SETTINGS` permission, which `prepare-android.js` adds.
- **Music history**: Recently played and Most played lists, saved on the phone and included in backups.
- **Search everything**: the magnifier in the Library header searches files (every type), albums, CineVault movies and Reader collections at once. With the box empty it also offers shortcuts to Favorites, Music history and Storage.
- **Storage dashboard**: phone used/free space, FileVault library size by file type, biggest folders, largest files, recently added. Calculated locally.
- **Accent colors** (Settings): pick or mix your own highlight color on top of any theme. Included in backups.
- Backups now also carry play history, accent color and equalizer settings.

### Still not included
- Real RAR extraction for .cbr, per-album file-type rules beyond the existing album/subfolder types, and custom app icons.

### Earlier in 2.6
- **Video player** is now the CineVault player: full-screen, Landscape/Portrait switch, +/-10 second buttons, seek bar, fit/fill, speed, subtitles for CineVault movies. Videos stream directly from storage (no loading into memory), so long videos work. Resume position is saved every few seconds, on close and when the app goes to the background, so it works for any length. A "Continue watching" row appears in Library > Videos.
- **Photo viewer**: long file names now shrink with "..." so the full-screen, slideshow and share buttons always stay visible. Swipe between photos, pinch or double-tap to zoom.
- **Albums**: an album holds any file types or just one (you choose when creating it). Each subfolder holds exactly one type, chosen when you create it; the file picker inside a subfolder is locked to that type. In an "any types" album the picker lets you choose which type to browse.
- **Music** now plays through a native Android foreground service (notification with previous/play/next, lock-screen controls, keeps playing with the screen off or the app closed, pauses when headphones unplug or a call comes in, goes to the next song by itself). The native media session explicitly advertises transport controls and remains active while the queue is paused so Android can populate its system media controls. Now-playing screen with queue, shuffle, repeat, mini-player, and **lyrics**: paste or type them, or import a .lrc/.txt file. Lyrics with [mm:ss.xx] times scroll in sync with the song. Stored per song, included in backups.
- **App lock**: the CineVault pattern lock (sounds, recovery word, auto-lock after 20 s away, hide-line option) now protects the whole app. You create the pattern on first launch.
- **CineVault** is the third item in the bottom menu (Library, Albums, CineVault, Settings). Movies, folders, stats, cast, notes and ratings work as before. Instead of importing, the **movie video and soundtrack songs are linked to files FileVault already sees**, so nothing big is copied. Posters are shrunk to a small image. Settings > Restore also imports a backup file from the old CineVault app (songs keep their titles; link each to a file in Edit).
- Library index is remembered between launches, thumbnails are made on demand and never saved, back button closes screens one by one, backups go to Documents/FileVault.

- **Shows and Movies tabs** (Library): videos named like `Show.Name.S01E03`, `1x03`, `Season 1 Episode 3`, `Show Ep 05`, or kept in `Show/Season 2/05.mkv` are grouped into Show > Season > Episode. Opening a show gives season chips, an episode list with watched marks and progress bars, and a **Continue** button (resume the episode you were on, otherwise the next unwatched one). The next episode plays automatically when one ends, and the player has a next-episode button. Everything that is not an episode is listed under Movies. You can fix a show name, season or episode by hand, rename a whole show, mark episodes watched or not watched, or mark a movie as an episode with the film button on its row.

- **CineVault movie thumbnail**: when you link a video, the Add movie form and the movie screen show a small preview frame from that video (tap it to play). If you have not chosen a poster, that frame is used as the poster. Only the tiny image is saved, never the video. If Android cannot make the preview, FileVault makes it inside the app instead, and movies linked earlier get their thumbnail filled in automatically when you open the CineVault tab.
- **Installed apps** tab in Library: lists apps with icons, search, tap to launch. (APK files stay under "APK files".)
- **Album filter** in Library, next to the tag filter.
- **Missing files cleanup**: Albums shows a notice when entries in albums, favorites or tags are no longer on the phone; Review & clean up removes only those entries. Also in Settings.
- **Thumbnail cache** now lives on disk with a size limit (100 MB to 1 GB, default 300 MB), oldest removed first, with a Clear cache button in Settings. Backups include movie thumbnails.

## Known limits
- The Java code could not be compiled here; if the build fails, send me the log.
- Some formats (for example certain .mkv or HEVC videos) may not play in the Android WebView; FileVault then offers "Open with".
- Videos larger than about 2 GB may not seek correctly.
- Android 13+ asks permission to show notifications the first time you play a song. Music still plays if you say no, but the notification and its controls will not appear.

- **Seasons & episodes picker (CineVault player)**: while watching a CineVault episode, tap the list button in the bottom bar, choose a season, then an episode inside it. The episode you leave keeps its resume position. Seasons come from the Season/Episode fields (or the file name / folder) of the entries in the same folder or sibling Season folders.
- **Short videos** now resume and count as finished correctly (the resume rules scale with video length).

- **Updates keep your data**: every build is now signed with the fixed key in `signing/debug.keystore`, so a new APK installs over the previous one without uninstalling. (The first install of this version still needs the old app uninstalled once, because older builds used a random key each time. Save a backup in Settings first.)

- **Reader tab (manga + novels)**: opens `.cbz` comics and `.epub` books straight from the phone (nothing is imported or copied). Manga: webtoon scroll or paged left-to-right / right-to-left, chapters grouped per series, page slider, auto-resume. Novels: contents list, text size, line spacing, font and background (App theme / Paper / Black), saved position. Reader progress is resumed from inside the collection folder, rather than showing every chapter as a separate Continue Reading card. ZIP reads use byte-array caching for WebView compatibility, fixing EPUB open failures on devices where Blob slicing is unavailable. You can also open a `.cbz` / `.epub` from the Library.
- **Back to top**: a round button appears after scrolling down long lists and jumps back to the top.
