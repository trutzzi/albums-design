export type Language = "en" | "ro";

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ro", label: "Română" },
];

/**
 * One flat dictionary per language, English is the source of truth for which
 * keys exist. `t()` falls back to English, then to the key itself, if a
 * translation is ever missing — so a forgotten Romanian string degrades to
 * readable English rather than a blank UI.
 *
 * New features must add their strings to BOTH dictionaries here, not inline
 * text in a component — that's the whole point of this file.
 */
export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    // --- Header / nav ---------------------------------------------------
    "nav.shoots": "Shoots",
    "nav.studio": "Studio",
    "nav.changelog": "What's new",
    "nav.login": "Log in",
    "nav.signup": "Sign up",
    "nav.logout": "Log out",
    "greeting.morning": "Good morning",
    "greeting.afternoon": "Good afternoon",
    "greeting.evening": "Good evening",
    "greeting.night": "Burning the midnight oil",

    // --- Common -----------------------------------------------------------
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.save": "Save",
    "common.loading": "Loading…",

    // --- Auth ---------------------------------------------------------
    "auth.login.title": "Log in",
    "auth.login.email": "Email",
    "auth.login.password": "Password",
    "auth.login.submit": "Log in",
    "auth.login.submitting": "Logging in…",
    "auth.login.newHere": "New here?",
    "auth.login.createAccount": "Create an account",
    "auth.login.seeChangelog": "See what's new in AlbumFlow",
    "auth.register.title": "Create your account",
    "auth.register.subtitle":
      "Your own studio, your own subscription, your own shoots — nobody else can see them.",
    "auth.register.name": "Your name (or studio name)",
    "auth.register.email": "Email",
    "auth.register.password": "Password",
    "auth.register.passwordHint": "At least 8 characters.",
    "auth.register.submit": "Create account",
    "auth.register.submitting": "Creating account…",
    "auth.register.haveAccount": "Already have an account?",
    "auth.register.login": "Log in",
    "auth.error.generic": "Something went wrong.",

    // --- Language prompt (shown once, at first album creation) --------
    "language.prompt.title": "Choose your language",
    "language.prompt.body":
      "Pick the language you'd like to use in AlbumFlow. You can always change it later in Studio settings.",
    "language.prompt.continue": "Continue",
    "language.settings.title": "Language",
    "language.settings.description": "Choose the language AlbumFlow is shown in.",

    // --- Projects (shoots list) -----------------------------------------
    "projects.title": "Shoots",
    "projects.subtitle": "Each shoot holds its own photos and albums.",
    "projects.new.title": "New shoot",
    "projects.new.name": "Name",
    "projects.new.namePlaceholder": "Elena & Radu",
    "projects.new.type": "Type",
    "projects.new.type.wedding": "Wedding",
    "projects.new.type.baptism": "Baptism",
    "projects.new.type.event": "Event",
    "projects.new.eventDate": "Event date",
    "projects.new.submit": "Create shoot",
    "projects.new.submitting": "Creating…",
    "projects.all.title": "All shoots",
    "projects.all.empty": "No shoots yet — create one above to start uploading.",

    // --- Project (single shoot) ------------------------------------------
    "project.back": "← All shoots",
    "project.stats": "{uploaded} uploaded · {analysed} analysed · {albumWorthy} album-worthy",
    "project.deleteShoot": "Delete shoot",
    "project.deleteShoot.title": "Delete this shoot?",
    "project.deleteShoot.body":
      "This permanently removes {name} — every uploaded photo, every album built from it, their exports, and any review links already sent to the client. This cannot be undone.",
    "project.deleteShoot.confirm": "Delete shoot",
    "project.deleteShoot.deleting": "Deleting…",
    "project.dropzone.title": "Drop culled selects here",
    "project.dropzone.subtitle": "JPEG, PNG, TIFF or WebP — up to 75MB each",
    "project.uploading": "Uploading {count} file{plural}…",
    "project.generate.title": "Generate an album",
    "project.generate.targetSpreads": "Target spreads",
    "project.generate.submit": "Generate draft",
    "project.generate.submitting": "Generating…",
    "project.generate.waitingOnAnalysis": "Analysis has to finish before a draft can be built.",
    "project.photos.title": "Photos",
    "project.photos.empty": "No photos uploaded yet.",

    // --- Studio ---------------------------------------------------------
    "studio.billingPeriod": "This billing period",
    "studio.usage": "{used} of {included} albums used",
    "studio.usage.unlimited": "unlimited",
    "studio.usage.remaining": " · {count} remaining",
    "studio.watermarkNotice": "Drafts carry a watermark on this plan until you export.",
    "studio.plan.title": "Plan",
    "studio.team.title": "Team",
    "studio.team.seats": "{used} of {included} seats",
    "studio.team.invitePending": " · invite pending",
    "studio.team.remove": "Remove",
    "studio.invite.name": "Name",
    "studio.invite.email": "Email",
    "studio.invite.submit": "Invite",
    "studio.invite.submitting": "Inviting…",

    // --- Changelog --------------------------------------------------------
    "changelog.title": "What's new",
    "changelog.subtitle": "Everything added to AlbumFlow, and how to use it.",
    "changelog.howToUse": "How to use it:",
    "changelog.release.sep18.heading": "Personal accounts & print-ready guides",
    "changelog.release.launch.heading": "AlbumFlow 1.0.0",
    "changelog.item.account": "Your own account",
    "changelog.item.account.desc":
      "AlbumFlow now has real accounts instead of one shared studio key. Each account gets its own private studio, subscription, and shoots — nobody else can see them.",
    "changelog.item.account.how": "Create an account from the Sign up link, or log in if you already have one.",
    "changelog.item.guides": "Trim line & safe-area guides",
    "changelog.item.guides.desc":
      "See exactly where a spread gets trimmed and how much margin to leave around faces and text, based on real print-lab profiles — or your own custom bleed and safe-margin numbers.",
    "changelog.item.guides.how":
      "Toggle \"Guides\" in the album editor toolbar, then pick a print profile (or Custom) from the popup.",
    "changelog.item.guidesSnap": "Snap to print guides",
    "changelog.item.guidesSnap.desc":
      "Resizing a photo frame now snaps to the trim and safe-area lines too, not just other frames.",
    "changelog.item.guidesSnap.how": "Turn on both \"Snap\" and \"Guides\", then drag a frame's corner near a guide line.",
    "changelog.item.traySort": "Sort the photo tray",
    "changelog.item.traySort.desc":
      "Sort your uploaded photos by score, category, original filename, or a new \"similarity\" grouping that clusters photos taken in the same setting.",
    "changelog.item.traySort.how": "Use the \"Sort by\" dropdown above the photo tray in the album editor.",
    "changelog.item.trayHover": "A friendlier tray",
    "changelog.item.trayHover.desc":
      "Hover any photo in the tray to see its score, category, and rank. Photos already used in the album are dimmed with a checkmark.",
    "changelog.item.trayHover.how": "Just hover over a thumbnail in the photo tray.",
    "changelog.item.deleteShoot": "Delete a shoot",
    "changelog.item.deleteShoot.desc":
      "Remove an entire shoot — its photos, every album built from it, and their exports — in one place, with a confirmation before anything is lost.",
    "changelog.item.deleteShoot.how": "Open a shoot and click \"Delete shoot\" in the header.",
    "changelog.item.undoRedo": "Undo & redo",
    "changelog.item.undoRedo.desc":
      "Every edit to an album — moving a photo, resizing a frame, reshuffling a spread — can now be undone and redone.",
    "changelog.item.undoRedo.how": "Use the ↶ Undo / ↷ Redo buttons in the album editor header.",
    "changelog.item.dragMove": "Drag a photo to move it",
    "changelog.item.dragMove.desc":
      "Drag a photo already on a spread toward one of its edges to swap it with the neighbouring photo in that direction.",
    "changelog.item.dragMove.how": "Pick up a photo already placed on a spread and drag it toward the edge you want it to move.",
    "changelog.item.snapRuler": "Snap & ruler toggles",
    "changelog.item.snapRuler.desc":
      "Resizing a frame can snap to page edges, the centre, and other frames — or not. A centimetre grid can sit behind every spread for checking alignment by eye.",
    "changelog.item.snapRuler.how": "Toggle \"Snap\" and \"Ruler\" in the album editor toolbar.",
    "changelog.item.deleteAlbum": "Delete an album",
    "changelog.item.deleteAlbum.desc": "Remove a single album — its spreads, exports, and review links — with a confirmation first.",
    "changelog.item.deleteAlbum.how": "Open the album and click \"Delete album\" in its header.",
    "changelog.item.stickyToolbar": "Toolbar stays put while you scroll",
    "changelog.item.stickyToolbar.desc":
      "The Ruler, Snap, Guides toggles and \"Mark ready for review\" stay visible at the top of a long album instead of scrolling out of view.",
    "changelog.item.stickyToolbar.how": "Nothing to do — scroll down any album and the toolbar follows.",
    "changelog.item.greeting": "A personal touch",
    "changelog.item.greeting.desc": "The header now greets you by name, with a message that matches the time of day.",
    "changelog.item.greeting.how": "Nothing to do — log in and it's already there.",
    "changelog.item.branding": "AlbumFlow branding",
    "changelog.item.branding.desc": "A proper logo and icon, in the header, on the login pages, and in your browser tab.",
    "changelog.item.branding.how": "Look up.",
    "changelog.item.language": "AlbumFlow in Romanian",
    "changelog.item.language.desc":
      "The whole app is now available in Romanian as well as English, including a prompt to pick your language the first time you generate an album.",
    "changelog.item.language.how": "Switch languages any time from Studio → Language.",
    "changelog.item.launch": "AlbumFlow launches",
    "changelog.item.launch.desc":
      "Upload a shoot, let AlbumFlow score and categorise every photo, generate a draft album automatically, fine-tune the layout, collect client feedback, and export a print-ready PDF.",
    "changelog.item.launch.how": "Create a shoot, drop in your photos, and click \"Generate draft\" once analysis finishes.",

    // --- Album editor (toolbar) ------------------------------------------
    "album.back": "← Back to shoot",
    "album.stats": "{spreads} spreads · {pages} pages · {photos} photos",
    "album.undo": "↶ Undo",
    "album.redo": "↷ Redo",
    "album.ruler": "Ruler",
    "album.snap": "Snap",
    "album.guides": "Guides",
    "album.reopen": "Reopen for editing",
    "album.markReady": "Mark ready for review",
    "album.deleteAlbum": "Delete album",
    "album.deleteAlbum.title": "Delete this album?",
    "album.deleteAlbum.body":
      "This permanently removes {title} — every spread, its exports, and any review links already sent to the client. This cannot be undone.",
    "album.deleteAlbum.deleting": "Deleting…",
    "album.photoTray.title": "Photo tray",
    "album.photoTray.sortBy": "Sort by",
    "album.photoTray.sort.score": "Score",
    "album.photoTray.sort.category": "Category",
    "album.photoTray.sort.filename": "Order (filename)",
    "album.photoTray.sort.similarity": "Similarity",
    "album.photoTray.rankOf": "#{rank} of {count}",
    "album.photoTray.alreadyUsed": "Already used in this album",
  },
  ro: {
    // --- Header / nav ---------------------------------------------------
    "nav.shoots": "Sesiuni foto",
    "nav.studio": "Studio",
    "nav.changelog": "Noutăți",
    "nav.login": "Autentificare",
    "nav.signup": "Înregistrare",
    "nav.logout": "Deconectare",
    "greeting.morning": "Bună dimineața",
    "greeting.afternoon": "Bună ziua",
    "greeting.evening": "Bună seara",
    "greeting.night": "Lucrezi până târziu",

    // --- Common -----------------------------------------------------------
    "common.cancel": "Anulează",
    "common.delete": "Șterge",
    "common.save": "Salvează",
    "common.loading": "Se încarcă…",

    // --- Auth ---------------------------------------------------------
    "auth.login.title": "Autentificare",
    "auth.login.email": "Email",
    "auth.login.password": "Parolă",
    "auth.login.submit": "Autentificare",
    "auth.login.submitting": "Se autentifică…",
    "auth.login.newHere": "Ești nou aici?",
    "auth.login.createAccount": "Creează un cont",
    "auth.login.seeChangelog": "Vezi noutățile din AlbumFlow",
    "auth.register.title": "Creează-ți contul",
    "auth.register.subtitle":
      "Propriul tău studio, propriul abonament, propriile sesiuni foto — nimeni altcineva nu le poate vedea.",
    "auth.register.name": "Numele tău (sau al studioului)",
    "auth.register.email": "Email",
    "auth.register.password": "Parolă",
    "auth.register.passwordHint": "Minimum 8 caractere.",
    "auth.register.submit": "Creează cont",
    "auth.register.submitting": "Se creează contul…",
    "auth.register.haveAccount": "Ai deja un cont?",
    "auth.register.login": "Autentificare",
    "auth.error.generic": "A apărut o eroare.",

    // --- Language prompt --------------------------------------------------
    "language.prompt.title": "Alege-ți limba",
    "language.prompt.body":
      "Alege limba în care vrei să folosești AlbumFlow. O poți schimba oricând din setările Studioului.",
    "language.prompt.continue": "Continuă",
    "language.settings.title": "Limbă",
    "language.settings.description": "Alege limba în care este afișat AlbumFlow.",

    // --- Projects (shoots list) -----------------------------------------
    "projects.title": "Sesiuni foto",
    "projects.subtitle": "Fiecare sesiune are propriile fotografii și albume.",
    "projects.new.title": "Sesiune nouă",
    "projects.new.name": "Nume",
    "projects.new.namePlaceholder": "Elena & Radu",
    "projects.new.type": "Tip",
    "projects.new.type.wedding": "Nuntă",
    "projects.new.type.baptism": "Botez",
    "projects.new.type.event": "Eveniment",
    "projects.new.eventDate": "Data evenimentului",
    "projects.new.submit": "Creează sesiunea",
    "projects.new.submitting": "Se creează…",
    "projects.all.title": "Toate sesiunile",
    "projects.all.empty": "Nicio sesiune încă — creează una mai sus pentru a încărca fotografii.",

    // --- Project (single shoot) ------------------------------------------
    "project.back": "← Toate sesiunile",
    "project.stats": "{uploaded} încărcate · {analysed} analizate · {albumWorthy} bune pentru album",
    "project.deleteShoot": "Șterge sesiunea",
    "project.deleteShoot.title": "Ștergi această sesiune?",
    "project.deleteShoot.body":
      "Aceasta elimină definitiv {name} — toate fotografiile încărcate, toate albumele create din ele, exporturile lor și orice link de recenzie deja trimis clientului. Această acțiune nu poate fi anulată.",
    "project.deleteShoot.confirm": "Șterge sesiunea",
    "project.deleteShoot.deleting": "Se șterge…",
    "project.dropzone.title": "Trage aici selecțiile finale",
    "project.dropzone.subtitle": "JPEG, PNG, TIFF sau WebP — până la 75MB fiecare",
    "project.uploading": "Se încarcă {count} fișier{plural}…",
    "project.generate.title": "Generează un album",
    "project.generate.targetSpreads": "Pagini duble țintă",
    "project.generate.submit": "Generează schița",
    "project.generate.submitting": "Se generează…",
    "project.generate.waitingOnAnalysis": "Analiza trebuie să se termine înainte de a genera o schiță.",
    "project.photos.title": "Fotografii",
    "project.photos.empty": "Nicio fotografie încărcată încă.",

    // --- Studio ---------------------------------------------------------
    "studio.billingPeriod": "Perioada curentă de facturare",
    "studio.usage": "{used} din {included} albume folosite",
    "studio.usage.unlimited": "nelimitat",
    "studio.usage.remaining": " · {count} rămase",
    "studio.watermarkNotice": "Schițele au filigran pe acest plan până la export.",
    "studio.plan.title": "Plan",
    "studio.team.title": "Echipă",
    "studio.team.seats": "{used} din {included} locuri",
    "studio.team.invitePending": " · invitație în așteptare",
    "studio.team.remove": "Elimină",
    "studio.invite.name": "Nume",
    "studio.invite.email": "Email",
    "studio.invite.submit": "Invită",
    "studio.invite.submitting": "Se invită…",

    // --- Changelog --------------------------------------------------------
    "changelog.title": "Noutăți",
    "changelog.subtitle": "Tot ce s-a adăugat în AlbumFlow și cum se folosește.",
    "changelog.howToUse": "Cum se folosește:",
    "changelog.release.sep18.heading": "Conturi personale și ghidaje pentru tipar",
    "changelog.release.launch.heading": "AlbumFlow 1.0.0",
    "changelog.item.account": "Propriul tău cont",
    "changelog.item.account.desc":
      "AlbumFlow are acum conturi reale, nu o singură cheie de studio comună. Fiecare cont primește propriul studio privat, abonament și sesiuni foto — nimeni altcineva nu le poate vedea.",
    "changelog.item.account.how": "Creează-ți un cont din linkul Înregistrare, sau autentifică-te dacă ai deja unul.",
    "changelog.item.guides": "Linia de tăiere și ghidajele zonei sigure",
    "changelog.item.guides.desc":
      "Vezi exact unde se taie o pagină dublă și cât spațiu trebuie lăsat în jurul fețelor și textului, pe baza unor profiluri reale de laborator foto — sau cu propriile tale valori personalizate de tăiere și margine sigură.",
    "changelog.item.guides.how":
      "Activează \"Ghidaje\" din bara de unelte a editorului de album, apoi alege un profil de tipar (sau Personalizat) din fereastra afișată.",
    "changelog.item.guidesSnap": "Aliniere la ghidajele de tipar",
    "changelog.item.guidesSnap.desc":
      "Redimensionarea unui cadru foto se aliniază acum și la liniile de tăiere și zona sigură, nu doar la alte cadre.",
    "changelog.item.guidesSnap.how": "Activează atât \"Aliniere\" cât și \"Ghidaje\", apoi trage colțul unui cadru aproape de o linie de ghidaj.",
    "changelog.item.traySort": "Sortează fotografiile disponibile",
    "changelog.item.traySort.desc":
      "Sortează fotografiile încărcate după scor, categorie, numele fișierului original, sau o nouă grupare \"similaritate\" care adună fotografiile făcute în același loc.",
    "changelog.item.traySort.how": "Folosește lista \"Sortează după\" de deasupra fotografiilor disponibile din editorul de album.",
    "changelog.item.trayHover": "Fotografii disponibile mai prietenoase",
    "changelog.item.trayHover.desc":
      "Treci cu mouse-ul peste orice fotografie pentru a vedea scorul, categoria și clasamentul ei. Fotografiile deja folosite în album sunt estompate și marcate cu o bifă.",
    "changelog.item.trayHover.how": "Treci cu mouse-ul peste o fotografie din listă.",
    "changelog.item.deleteShoot": "Șterge o sesiune foto",
    "changelog.item.deleteShoot.desc":
      "Elimină o întreagă sesiune foto — fotografiile ei, toate albumele create din ele și exporturile lor — dintr-un singur loc, cu o confirmare înainte de ștergere.",
    "changelog.item.deleteShoot.how": "Deschide o sesiune foto și apasă \"Șterge sesiunea\" din antet.",
    "changelog.item.undoRedo": "Anulează și refă",
    "changelog.item.undoRedo.desc":
      "Orice modificare a unui album — mutarea unei fotografii, redimensionarea unui cadru, reorganizarea unei pagini duble — poate fi acum anulată și refăcută.",
    "changelog.item.undoRedo.how": "Folosește butoanele ↶ Anulează / ↷ Refă din antetul editorului de album.",
    "changelog.item.dragMove": "Trage o fotografie pentru a o muta",
    "changelog.item.dragMove.desc":
      "Trage o fotografie deja plasată pe o pagină dublă spre una din marginile ei pentru a o interschimba cu fotografia vecină din acea direcție.",
    "changelog.item.dragMove.how": "Prinde o fotografie deja plasată pe o pagină dublă și trage-o spre marginea în care vrei să o muți.",
    "changelog.item.snapRuler": "Comutatoare pentru aliniere și riglă",
    "changelog.item.snapRuler.desc":
      "Redimensionarea unui cadru se poate alinia la marginile paginii, centru și alte cadre — sau nu, alegerea îți aparține. O grilă în centimetri poate sta sub fiecare pagină dublă pentru verificarea alinierii din ochi.",
    "changelog.item.snapRuler.how": "Activează \"Aliniere\" și \"Riglă\" din bara de unelte a editorului de album.",
    "changelog.item.deleteAlbum": "Șterge un album",
    "changelog.item.deleteAlbum.desc": "Elimină un singur album — paginile lui duble, exporturile și linkurile de recenzie — cu o confirmare înainte.",
    "changelog.item.deleteAlbum.how": "Deschide albumul și apasă \"Șterge albumul\" din antet.",
    "changelog.item.stickyToolbar": "Bara de unelte rămâne vizibilă la derulare",
    "changelog.item.stickyToolbar.desc":
      "Comutatoarele Riglă, Aliniere, Ghidaje și \"Marchează gata pentru recenzie\" rămân vizibile în partea de sus a unui album lung, în loc să dispară la derulare.",
    "changelog.item.stickyToolbar.how": "Nimic de făcut — derulează orice album și bara de unelte te urmează.",
    "changelog.item.greeting": "O notă personală",
    "changelog.item.greeting.desc": "Antetul te salută acum pe nume, cu un mesaj potrivit momentului zilei.",
    "changelog.item.greeting.how": "Nimic de făcut — autentifică-te și e deja acolo.",
    "changelog.item.branding": "Identitate vizuală AlbumFlow",
    "changelog.item.branding.desc": "Un logo și o iconiță adevărate, în antet, pe paginile de autentificare și în tab-ul browserului.",
    "changelog.item.branding.how": "Uită-te în sus.",
    "changelog.item.language": "AlbumFlow în limba română",
    "changelog.item.language.desc":
      "Întreaga aplicație este acum disponibilă în română, pe lângă engleză, inclusiv o întrebare despre limba preferată prima dată când generezi un album.",
    "changelog.item.language.how": "Schimbă limba oricând din Studio → Limbă.",
    "changelog.item.launch": "AlbumFlow este lansat",
    "changelog.item.launch.desc":
      "Încarcă o sesiune foto, lasă AlbumFlow să evalueze și să categorisească fiecare fotografie, generează automat o schiță de album, ajustează aspectul, colectează feedback de la client și exportă un PDF gata de tipar.",
    "changelog.item.launch.how": "Creează o sesiune foto, adaugă fotografiile și apasă \"Generează schița\" după ce se termină analiza.",
    // --- Album editor (toolbar) ------------------------------------------
    "album.back": "← Înapoi la sesiune",
    "album.stats": "{spreads} pagini duble · {pages} pagini · {photos} fotografii",
    "album.undo": "↶ Anulează",
    "album.redo": "↷ Refă",
    "album.ruler": "Riglă",
    "album.snap": "Aliniere",
    "album.guides": "Ghidaje",
    "album.reopen": "Redeschide pentru editare",
    "album.markReady": "Marchează gata pentru recenzie",
    "album.deleteAlbum": "Șterge albumul",
    "album.deleteAlbum.title": "Ștergi acest album?",
    "album.deleteAlbum.body":
      "Aceasta elimină definitiv {title} — toate paginile duble, exporturile lui și orice link de recenzie deja trimis clientului. Această acțiune nu poate fi anulată.",
    "album.deleteAlbum.deleting": "Se șterge…",
    "album.photoTray.title": "Fotografii disponibile",
    "album.photoTray.sortBy": "Sortează după",
    "album.photoTray.sort.score": "Scor",
    "album.photoTray.sort.category": "Categorie",
    "album.photoTray.sort.filename": "Ordine (nume fișier)",
    "album.photoTray.sort.similarity": "Similaritate",
    "album.photoTray.rankOf": "#{rank} din {count}",
    "album.photoTray.alreadyUsed": "Deja folosită în acest album",
  },
};

/**
 * The actual lookup-and-interpolate logic, pulled out of the React context
 * so it can be unit tested without rendering anything: falls back to
 * English, then to the key itself, and replaces `{name}`-style placeholders.
 */
export function translate(
  language: Language,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dictionary = TRANSLATIONS[language];
  const template = dictionary[key] ?? TRANSLATIONS.en[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
}
