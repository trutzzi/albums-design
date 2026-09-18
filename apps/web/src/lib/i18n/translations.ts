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
    "nav.contact": "Contact",
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
    "project.generate.dimension": "Print size",
    "project.photos.title": "Photos",
    "project.photos.empty": "No photos uploaded yet.",

    // --- Album print-size picker ------------------------------------------
    "dimension.chip": "{width}×{height} cm",
    "dimension.modal.title": "Choose a print size",
    "dimension.modal.body":
      "Pick the finished page size for this album, in centimetres — every popular photobook size is here, or set your own.",
    "dimension.custom": "Custom",
    "dimension.custom.width": "Width (cm)",
    "dimension.custom.height": "Height (cm)",
    "dimension.useCustom": "Use custom size",
    "dimension.shape.square": "Square",
    "dimension.shape.portrait": "Portrait",
    "dimension.shape.landscape": "Landscape",

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
    "changelog.item.printSize": "Choose your album's print size",
    "changelog.item.printSize.desc":
      "Pick from popular album sizes in centimetres — 20×20, 25×25, 30×40, and more — or enter your own custom width and height. The chosen size is shown highlighted right in the album editor.",
    "changelog.item.printSize.how":
      "Pick a print size in the \"Generate an album\" panel before generating — the size then shows next to the album's title.",
    "changelog.item.dragBetweenSpreads": "Move a photo between spreads",
    "changelog.item.dragBetweenSpreads.desc":
      "Drag a photo from one spread and drop it onto a slot on a different spread — the two photos swap places, each keeping its own framing and colour treatment.",
    "changelog.item.dragBetweenSpreads.how":
      "Pick up a photo already placed on a spread and drop it onto a slot on another spread.",
    "changelog.item.insertSpread": "Insert a spread anywhere",
    "changelog.item.insertSpread.desc":
      "Add a brand-new spread between two existing ones, not just at the end — and choose any layout for it, since it has no photos yet to narrow the choice down.",
    "changelog.item.insertSpread.how":
      "Click the small + button that appears just below any spread.",
    "changelog.item.toolbarBelow": "Clearer photo editing toolbar",
    "changelog.item.toolbarBelow.desc":
      "The zoom, black & white, and remove controls for a selected photo now sit just below it instead of over it, so a small photo is never hidden behind them.",
    "changelog.item.toolbarBelow.how": "Select any photo on a spread — the toolbar appears right underneath it.",
    "changelog.item.moveAsNewPhoto": "Move a photo into a spread",
    "changelog.item.moveAsNewPhoto.desc":
      "Drop a dragged photo onto a spread's margin instead of onto another photo, and it joins that spread outright — both spreads' layouts refresh automatically for their new photo counts.",
    "changelog.item.moveAsNewPhoto.how":
      "Drag a photo from one spread and drop it on the empty margin of another spread, rather than on top of one of its photos.",
    "changelog.item.landingPage": "A proper welcome page",
    "changelog.item.landingPage.desc":
      "Visitors now see a page describing what AlbumFlow does and why, before they're asked to sign up — instead of being sent straight to a login screen.",
    "changelog.item.landingPage.how": "Just visit the site while logged out.",
    "changelog.item.launch": "AlbumFlow launches",
    "changelog.item.launch.desc":
      "Upload a shoot, let AlbumFlow score and categorise every photo, generate a draft album automatically, fine-tune the layout, collect client feedback, and export a print-ready PDF.",
    "changelog.item.launch.how": "Create a shoot, drop in your photos, and click \"Generate draft\" once analysis finishes.",

    // --- Landing page -------------------------------------------------------
    "landing.kicker": "For wedding & event photographers",
    "landing.hero.title": "Turn a shoot into an album your clients will love",
    "landing.hero.subtitle":
      "AlbumFlow scores every photo, builds the spreads for you, and gets your client's sign-off — so you spend less time laying out pages and more time behind the camera.",
    "landing.hero.cta.primary": "Get started free",
    "landing.hero.cta.secondary": "Log in",
    "landing.features.heading": "Everything a photographer needs, nothing they don't",
    "landing.features.subheading":
      "Built for the whole workflow, from the memory card to a delivered PDF.",
    "landing.feature.scoring.title": "Smart photo scoring",
    "landing.feature.scoring.desc":
      "Every photo is scored for sharpness, exposure, and composition, so the best shots rise to the top on their own.",
    "landing.feature.layouts.title": "Instant layouts",
    "landing.feature.layouts.desc":
      "Pick a set of photos and AlbumFlow suggests spreads that genuinely fit them — no blank templates to wrestle with.",
    "landing.feature.dragdrop.title": "Drag, drop, done",
    "landing.feature.dragdrop.desc":
      "Rearrange photos within a spread, or drag one into a different spread entirely — the design refreshes itself either way.",
    "landing.feature.guides.title": "Print-ready guides",
    "landing.feature.guides.desc":
      "Trim lines and safe areas from real print-lab profiles, shown right on the page, with snapping built in.",
    "landing.feature.sizes.title": "Any album size",
    "landing.feature.sizes.desc":
      "Square, portrait, or landscape, from 20×20 to 30×40 cm — or set your own custom size in one click.",
    "landing.feature.review.title": "Client-ready reviews",
    "landing.feature.review.desc":
      "Share a private link, collect feedback spread by spread, and export a print-ready PDF the moment it's approved.",
    "landing.feature.language.title": "Speak your language",
    "landing.feature.language.desc":
      "The whole app — this page included — works in English and Romanian, switchable any time.",
    "landing.steps.heading": "From memory card to finished album",
    "landing.steps.upload.title": "1. Upload the shoot",
    "landing.steps.upload.desc":
      "Drop in a folder of JPEGs — AlbumFlow analyses every one while you get on with your day.",
    "landing.steps.design.title": "2. Design the album",
    "landing.steps.design.desc":
      "Accept the layout AlbumFlow suggests, or drag, resize, and rearrange until it's exactly right.",
    "landing.steps.approve.title": "3. Get the sign-off",
    "landing.steps.approve.desc":
      "Share a review link with your client, resolve their notes, and export a print-ready PDF.",
    "landing.cta.heading": "Ready to build your next album in an afternoon?",
    "landing.cta.subtitle": "Create a free account and upload your first shoot in minutes.",
    "landing.cta.button": "Create your free account",

    // --- Contact page -------------------------------------------------------
    "contact.title": "Contact",
    "contact.subtitle": "Questions, feedback, or a feature you'd like to see — we'd love to hear from you.",
    "contact.body": "Send us an email and we'll get back to you as soon as we can.",

    // --- Album editor (toolbar) ------------------------------------------
    "album.back": "← Back to shoot",
    "album.stats": "{spreads} spreads · {pages} pages · {photos} photos",
    "album.undo": "↶ Undo",
    "album.redo": "↷ Redo",
    "album.ruler": "Ruler",
    "album.snap": "Snap",
    "album.guides": "Guides",
    "album.addSpread": "+ Add spread",
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

    // --- Album editor (per-spread block) ---------------------------------
    "spread.heading": "Spread {number}",
    "spread.comments": "{count} client note{plural} on this spread",
    "spread.moveUp": "↑",
    "spread.moveDown": "↓",
    "spread.resetLayout": "Reset layout",
    "spread.resetLayout.title": "Put every photo back where the template had it",
    "spread.shuffle": "Shuffle design",
    "spread.shuffle.title": "Try the next layout that fits these photos",
    "spread.addPhoto": "+ Add photo",
    "spread.addPhoto.clickPhoto": "Click a photo…",
    "spread.addPhoto.title.adding": "Click a photo in the tray to add it here",
    "spread.addPhoto.title.disabled": "This spread already holds as many photos as any layout supports",
    "spread.addPhoto.title.ready": "Pick a photo from the tray to add to this spread",
    "spread.treatment.color": "Colour",
    "spread.treatment.bw": "B&W",
    "spread.treatment.title": "Toggle black and white for the whole spread",
    "spread.remove": "Remove",
    "spread.unknownLayout": "Unknown layout",
    "spread.zoom": "Zoom",
    "spread.bwToggle.title": "Black and white",
    "spread.resetFraming.title": "Reset framing",
    "spread.resetFraming": "Reset",
    "spread.removePhoto": "Remove",
    "spread.removePhoto.title.canRemove": "Remove this photo from the spread",
    "spread.removePhoto.title.lastPhoto":
      "A spread needs at least one photo — remove the whole spread instead",
    "spread.slot.landscape": "landscape",
    "spread.slot.portrait": "portrait",
    "spread.slot.square": "square",
    "spread.slot.any": "any",
    "spread.layoutPicker.label": "Spread layout",
    "spread.layoutPicker.noneFit": "No other layout holds {count} photos.",
    "spread.insert.title": "Insert a new spread here",
    "spread.insert.modal.title": "Choose a layout",
    "spread.insert.modal.body":
      "Pick a layout for the new spread — you can add photos to it afterwards.",

    // --- Layout template names -------------------------------------------
    "template.hero-full-bleed": "Full bleed hero",
    "template.single-centred": "Single centred",
    "template.panorama-band": "Panoramic band",
    "template.single-right-page": "Right page only",
    "template.single-left-page": "Left page only",
    "template.editorial-plate": "Editorial plate",
    "template.gallery-square": "Gallery square",
    "template.standing-portrait": "Standing portrait",
    "template.portrait-pair": "Portrait pair",
    "template.landscape-stack": "Landscape stack",
    "template.duo-offset": "Offset pair",
    "template.panorama-stack": "Banner over wide",
    "template.page-and-inset": "Full page with inset",
    "template.dominant-left": "Dominant left",
    "template.dominant-right": "Dominant right",
    "template.pair-diagonal": "Diagonal pair",
    "template.square-duo": "Two squares",
    "template.tall-and-wide": "Tall and wide",
    "template.feature-left": "Feature left with pair",
    "template.feature-right": "Feature right with pair",
    "template.triptych": "Triptych",
    "template.banner-over-two": "Banner over pair",
    "template.two-over-banner": "Pair over banner",
    "template.stack-three": "Three bands",
    "template.trio-flanked": "Centre stage",
    "template.three-diagonal": "Descending three",
    "template.page-pair-plate": "Pair left, plate right",
    "template.plate-page-pair": "Plate left, pair right",
    "template.mosaic-left": "Mosaic, feature left",
    "template.mosaic-right": "Mosaic, feature right",
    "template.feature-over-three": "Feature over three",
    "template.two-per-page": "Two per page",
    "template.detail-strip": "Detail strip",
    "template.pinwheel-four": "Pinwheel",
    "template.three-over-feature": "Three over feature",
    "template.plate-and-trio": "Plate left, three right",
    "template.trio-and-plate": "Three left, plate right",
    "template.quad-offset": "Offset quad",
    "template.gallery-five": "Feature with gallery",
    "template.gallery-five-left": "Gallery with feature right",
    "template.banner-over-four": "Banner over four",
    "template.strip-five": "Five across",
    "template.four-over-banner": "Four over banner",
    "template.feature-with-quartet": "Feature with quartet",
    "template.pair-and-trio": "Pair left, three right",
    "template.trio-and-pair": "Three left, pair right",
    "template.staircase-five": "Staircase",
    "template.three-per-page": "Three per page",
    "template.banner-over-five": "Banner over five",
    "template.six-across": "Six across",
    "template.mosaic-six": "Feature with five",
    "template.two-over-four": "Two over four",
    "template.four-over-two": "Four over two",
    "template.feature-with-six": "Feature with six",
    "template.banner-over-six": "Banner over six",
    "template.seven-mosaic": "Three, banner, three",
    "template.trio-and-quartet": "Three left, four right",
    "template.quad-per-page": "Four per page",
    "template.feature-with-seven": "Feature with seven",
    "template.two-over-six": "Two over six",
    "template.feature-with-eight": "Feature with eight",
    "template.banner-over-eight": "Banner over eight",
    "template.cascade-nine": "Two, three, four",

    // --- Album editor (review & export sidebar) --------------------------
    "album.review.title": "Client review",
    "album.review.clientName": "Client name",
    "album.review.createLink": "Create share link",
    "album.review.creating": "Creating…",
    "album.review.session": "{name} — {status}",
    "album.review.openComments": " · {count} open comments",
    "album.feedback.title": "Client feedback",
    "album.export.title": "Export",
    "album.export.button": "Export print-ready PDF",
    "album.export.queueing": "Queueing…",
    "album.export.download": "Download ({size} KB)",
    "album.export.inProgress.title": "This export is still in progress",
    "album.export.delete.title": "Delete this export",
    "album.export.delete.confirm": "Delete this export? This cannot be undone.",
    "album.export.delete": "Delete",
    "album.export.deleting": "Deleting…",

    // --- Client feedback panel --------------------------------------------
    "feedback.loading": "Loading feedback…",
    "feedback.loadError":
      "Comments could not be loaded, so this list may be incomplete. If the message above says the route was not found, the API is running older code than the editor — restart it and reload.",
    "feedback.empty.waiting": "No comments yet — the share link is open and waiting.",
    "feedback.empty.none": "Create a share link and your client's notes will appear here.",
    "feedback.toActOn": "to act on",
    "feedback.done": "done",
    "feedback.jumpTo.title": "Jump to this spread",
    "feedback.spreadLabel": "Spread {number}",
    "feedback.doneChip": "Done",
    "feedback.markDone": "Mark done",
    "feedback.marking": "Marking…",
  },
  ro: {
    // --- Header / nav ---------------------------------------------------
    "nav.shoots": "Sesiuni foto",
    "nav.studio": "Studio",
    "nav.changelog": "Noutăți",
    "nav.contact": "Contact",
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
    "project.generate.dimension": "Dimensiune tipar",
    "project.photos.title": "Fotografii",
    "project.photos.empty": "Nicio fotografie încărcată încă.",

    // --- Album print-size picker ------------------------------------------
    "dimension.chip": "{width}×{height} cm",
    "dimension.modal.title": "Alege o dimensiune de tipar",
    "dimension.modal.body":
      "Alege dimensiunea finală a paginii pentru acest album, în centimetri — toate dimensiunile populare de fotocarte sunt aici, sau setează-ți propria dimensiune.",
    "dimension.custom": "Personalizat",
    "dimension.custom.width": "Lățime (cm)",
    "dimension.custom.height": "Înălțime (cm)",
    "dimension.useCustom": "Folosește dimensiunea personalizată",
    "dimension.shape.square": "Pătrat",
    "dimension.shape.portrait": "Portret",
    "dimension.shape.landscape": "Peisaj",

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
    "changelog.item.printSize": "Alege dimensiunea de tipar a albumului",
    "changelog.item.printSize.desc":
      "Alege dintre dimensiuni populare de album în centimetri — 20×20, 25×25, 30×40 și altele — sau introdu propria lățime și înălțime. Dimensiunea aleasă este evidențiată chiar în editorul de album.",
    "changelog.item.printSize.how":
      "Alege o dimensiune de tipar în panoul \"Generează un album\" înainte de generare — dimensiunea apare apoi lângă titlul albumului.",
    "changelog.item.dragBetweenSpreads": "Mută o fotografie între pagini duble",
    "changelog.item.dragBetweenSpreads.desc":
      "Trage o fotografie de pe o pagină dublă și las-o pe un cadru dintr-o altă pagină dublă — cele două fotografii își schimbă locul, fiecare păstrându-și încadrarea și tratamentul de culoare.",
    "changelog.item.dragBetweenSpreads.how":
      "Prinde o fotografie deja plasată pe o pagină dublă și las-o pe un cadru din altă pagină dublă.",
    "changelog.item.insertSpread": "Inserează o pagină dublă oriunde",
    "changelog.item.insertSpread.desc":
      "Adaugă o pagină dublă complet nouă între două existente, nu doar la final — și alege orice aspect pentru ea, pentru că încă nu are fotografii care să restrângă alegerea.",
    "changelog.item.insertSpread.how":
      "Apasă pe micul buton + care apare imediat sub orice pagină dublă.",
    "changelog.item.toolbarBelow": "Bară de unelte mai clară pentru editarea fotografiilor",
    "changelog.item.toolbarBelow.desc":
      "Comenzile de zoom, alb-negru și ștergere pentru o fotografie selectată stau acum chiar sub ea, nu peste ea, astfel încât o fotografie mică nu mai este ascunsă de ele.",
    "changelog.item.toolbarBelow.how":
      "Selectează orice fotografie de pe o pagină dublă — bara de unelte apare chiar dedesubt.",
    "changelog.item.moveAsNewPhoto": "Mută o fotografie într-o pagină dublă",
    "changelog.item.moveAsNewPhoto.desc":
      "Lasă o fotografie trasă pe marginea unei pagini duble, nu peste altă fotografie, și se alătură acelei pagini duble direct — aspectul ambelor pagini duble se reface automat pentru noul număr de fotografii.",
    "changelog.item.moveAsNewPhoto.how":
      "Trage o fotografie de pe o pagină dublă și las-o pe marginea liberă a altei pagini duble, nu peste una din fotografiile ei.",
    "changelog.item.landingPage": "O pagină de întâmpinare adevărată",
    "changelog.item.landingPage.desc":
      "Vizitatorii văd acum o pagină care descrie ce face AlbumFlow și de ce, înainte să fie rugați să se înscrie — în loc să fie trimiși direct la ecranul de autentificare.",
    "changelog.item.landingPage.how": "Vizitează site-ul cât ești deconectat.",
    "changelog.item.launch": "AlbumFlow este lansat",
    "changelog.item.launch.desc":
      "Încarcă o sesiune foto, lasă AlbumFlow să evalueze și să categorisească fiecare fotografie, generează automat o schiță de album, ajustează aspectul, colectează feedback de la client și exportă un PDF gata de tipar.",
    "changelog.item.launch.how": "Creează o sesiune foto, adaugă fotografiile și apasă \"Generează schița\" după ce se termină analiza.",

    // --- Landing page -------------------------------------------------------
    "landing.kicker": "Pentru fotografi de nuntă și evenimente",
    "landing.hero.title": "Transformă o ședință foto într-un album pe care clienții tăi îl vor iubi",
    "landing.hero.subtitle":
      "AlbumFlow evaluează fiecare fotografie, construiește paginile duble pentru tine și obține aprobarea clientului — așa că petreci mai puțin timp aranjând pagini și mai mult timp în spatele aparatului.",
    "landing.hero.cta.primary": "Începe gratuit",
    "landing.hero.cta.secondary": "Conectează-te",
    "landing.features.heading": "Tot ce are nevoie un fotograf, nimic în plus",
    "landing.features.subheading":
      "Construit pentru întregul flux de lucru, de la cardul de memorie până la PDF-ul livrat.",
    "landing.feature.scoring.title": "Evaluare inteligentă a fotografiilor",
    "landing.feature.scoring.desc":
      "Fiecare fotografie este evaluată pentru claritate, expunere și compoziție, astfel încât cele mai bune cadre ies în evidență de la sine.",
    "landing.feature.layouts.title": "Aspecte instant",
    "landing.feature.layouts.desc":
      "Alege un set de fotografii, iar AlbumFlow propune pagini duble care se potrivesc cu adevărat — fără șabloane goale cu care să te lupți.",
    "landing.feature.dragdrop.title": "Trage, plasează, gata",
    "landing.feature.dragdrop.desc":
      "Rearanjează fotografiile într-o pagină dublă sau trage una într-o pagină dublă complet diferită — designul se reface automat în ambele cazuri.",
    "landing.feature.guides.title": "Ghidaje pentru tipar",
    "landing.feature.guides.desc":
      "Linii de tăiere și zone de siguranță din profiluri reale de laborator foto, afișate direct pe pagină, cu aliniere automată.",
    "landing.feature.sizes.title": "Orice dimensiune de album",
    "landing.feature.sizes.desc":
      "Pătrat, portret sau peisaj, de la 20×20 la 30×40 cm — sau setează propria dimensiune personalizată dintr-un click.",
    "landing.feature.review.title": "Recenzii pregătite pentru clienți",
    "landing.feature.review.desc":
      "Trimite un link privat, colectează observații pentru fiecare pagină dublă și exportă un PDF pregătit pentru tipar imediat ce este aprobat.",
    "landing.feature.language.title": "Vorbește limba ta",
    "landing.feature.language.desc":
      "Întreaga aplicație — inclusiv această pagină — funcționează în română și engleză, comutabile în orice moment.",
    "landing.steps.heading": "De la cardul de memorie la albumul finalizat",
    "landing.steps.upload.title": "1. Încarcă ședința foto",
    "landing.steps.upload.desc":
      "Adaugă un folder cu fotografii JPEG — AlbumFlow le analizează pe toate cât tu continui cu ziua ta.",
    "landing.steps.design.title": "2. Proiectează albumul",
    "landing.steps.design.desc":
      "Acceptă aspectul propus de AlbumFlow sau trage, redimensionează și rearanjează până este exact cum vrei.",
    "landing.steps.approve.title": "3. Obține aprobarea",
    "landing.steps.approve.desc":
      "Trimite clientului un link de recenzie, rezolvă observațiile lui și exportă un PDF pregătit pentru tipar.",
    "landing.cta.heading": "Ești pregătit să construiești următorul album într-o singură după-amiază?",
    "landing.cta.subtitle": "Creează un cont gratuit și încarcă prima ta ședință foto în câteva minute.",
    "landing.cta.button": "Creează-ți contul gratuit",

    // --- Contact page -------------------------------------------------------
    "contact.title": "Contact",
    "contact.subtitle": "Întrebări, feedback sau o funcționalitate pe care ai vrea să o vezi — ne-ar face plăcere să auzim de la tine.",
    "contact.body": "Trimite-ne un email și îți vom răspunde cât mai rapid posibil.",

    // --- Album editor (toolbar) ------------------------------------------
    "album.back": "← Înapoi la sesiune",
    "album.stats": "{spreads} pagini duble · {pages} pagini · {photos} fotografii",
    "album.undo": "↶ Anulează",
    "album.redo": "↷ Refă",
    "album.ruler": "Riglă",
    "album.snap": "Aliniere",
    "album.guides": "Ghidaje",
    "album.addSpread": "+ Adaugă pagină dublă",
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

    // --- Album editor (per-spread block) ---------------------------------
    "spread.heading": "Pagina dublă {number}",
    "spread.comments": "{count} notă{plural} de la client pe această pagină dublă",
    "spread.moveUp": "↑",
    "spread.moveDown": "↓",
    "spread.resetLayout": "Resetează aspectul",
    "spread.resetLayout.title": "Pune fiecare fotografie înapoi unde era în șablon",
    "spread.shuffle": "Schimbă designul",
    "spread.shuffle.title": "Încearcă următorul aspect care se potrivește acestor fotografii",
    "spread.addPhoto": "+ Adaugă fotografie",
    "spread.addPhoto.clickPhoto": "Apasă pe o fotografie…",
    "spread.addPhoto.title.adding": "Apasă pe o fotografie din listă pentru a o adăuga aici",
    "spread.addPhoto.title.disabled": "Această pagină dublă are deja câte fotografii permite orice aspect",
    "spread.addPhoto.title.ready": "Alege o fotografie din listă pentru a o adăuga pe această pagină dublă",
    "spread.treatment.color": "Color",
    "spread.treatment.bw": "Alb-negru",
    "spread.treatment.title": "Comută alb-negru pentru toată pagina dublă",
    "spread.remove": "Șterge",
    "spread.unknownLayout": "Aspect necunoscut",
    "spread.zoom": "Zoom",
    "spread.bwToggle.title": "Alb-negru",
    "spread.resetFraming.title": "Resetează încadrarea",
    "spread.resetFraming": "Resetează",
    "spread.removePhoto": "Șterge",
    "spread.removePhoto.title.canRemove": "Șterge această fotografie din pagina dublă",
    "spread.removePhoto.title.lastPhoto":
      "O pagină dublă are nevoie de cel puțin o fotografie — șterge toată pagina dublă în schimb",
    "spread.slot.landscape": "orizontală",
    "spread.slot.portrait": "verticală",
    "spread.slot.square": "pătrată",
    "spread.slot.any": "oricare",
    "spread.layoutPicker.label": "Aspectul paginii duble",
    "spread.layoutPicker.noneFit": "Niciun alt aspect nu are loc pentru {count} fotografii.",
    "spread.insert.title": "Inserează o pagină dublă nouă aici",
    "spread.insert.modal.title": "Alege un aspect",
    "spread.insert.modal.body":
      "Alege un aspect pentru noua pagină dublă — poți adăuga fotografii pe ea după aceea.",

    // --- Layout template names -------------------------------------------
    "template.hero-full-bleed": "Erou pe toată pagina",
    "template.single-centred": "Una centrată",
    "template.panorama-band": "Bandă panoramică",
    "template.single-right-page": "Doar pagina dreaptă",
    "template.single-left-page": "Doar pagina stângă",
    "template.editorial-plate": "Placă editorială",
    "template.gallery-square": "Pătrat galerie",
    "template.standing-portrait": "Portret în picioare",
    "template.portrait-pair": "Pereche portret",
    "template.landscape-stack": "Stivă peisaj",
    "template.duo-offset": "Pereche decalată",
    "template.panorama-stack": "Banner peste lată",
    "template.page-and-inset": "Pagină întreagă cu inset",
    "template.dominant-left": "Dominantă stânga",
    "template.dominant-right": "Dominantă dreapta",
    "template.pair-diagonal": "Pereche diagonală",
    "template.square-duo": "Două pătrate",
    "template.tall-and-wide": "Înaltă și lată",
    "template.feature-left": "Vedetă stânga cu pereche",
    "template.feature-right": "Vedetă dreapta cu pereche",
    "template.triptych": "Triptic",
    "template.banner-over-two": "Banner peste pereche",
    "template.two-over-banner": "Pereche peste banner",
    "template.stack-three": "Trei benzi",
    "template.trio-flanked": "Centrul atenției",
    "template.three-diagonal": "Trei descendente",
    "template.page-pair-plate": "Pereche stânga, placă dreapta",
    "template.plate-page-pair": "Placă stânga, pereche dreapta",
    "template.mosaic-left": "Mozaic, vedetă stânga",
    "template.mosaic-right": "Mozaic, vedetă dreapta",
    "template.feature-over-three": "Vedetă peste trei",
    "template.two-per-page": "Două pe pagină",
    "template.detail-strip": "Bandă de detalii",
    "template.pinwheel-four": "Morișcă",
    "template.three-over-feature": "Trei peste vedetă",
    "template.plate-and-trio": "Placă stânga, trei dreapta",
    "template.trio-and-plate": "Trei stânga, placă dreapta",
    "template.quad-offset": "Cvartet decalat",
    "template.gallery-five": "Vedetă cu galerie",
    "template.gallery-five-left": "Galerie cu vedetă dreapta",
    "template.banner-over-four": "Banner peste patru",
    "template.strip-five": "Cinci pe orizontală",
    "template.four-over-banner": "Patru peste banner",
    "template.feature-with-quartet": "Vedetă cu cvartet",
    "template.pair-and-trio": "Pereche stânga, trei dreapta",
    "template.trio-and-pair": "Trei stânga, pereche dreapta",
    "template.staircase-five": "Scară",
    "template.three-per-page": "Trei pe pagină",
    "template.banner-over-five": "Banner peste cinci",
    "template.six-across": "Șase pe orizontală",
    "template.mosaic-six": "Vedetă cu cinci",
    "template.two-over-four": "Două peste patru",
    "template.four-over-two": "Patru peste două",
    "template.feature-with-six": "Vedetă cu șase",
    "template.banner-over-six": "Banner peste șase",
    "template.seven-mosaic": "Trei, banner, trei",
    "template.trio-and-quartet": "Trei stânga, patru dreapta",
    "template.quad-per-page": "Patru pe pagină",
    "template.feature-with-seven": "Vedetă cu șapte",
    "template.two-over-six": "Două peste șase",
    "template.feature-with-eight": "Vedetă cu opt",
    "template.banner-over-eight": "Banner peste opt",
    "template.cascade-nine": "Doi, trei, patru",

    // --- Album editor (review & export sidebar) --------------------------
    "album.review.title": "Recenzie client",
    "album.review.clientName": "Numele clientului",
    "album.review.createLink": "Creează link de partajare",
    "album.review.creating": "Se creează…",
    "album.review.session": "{name} — {status}",
    "album.review.openComments": " · {count} comentarii deschise",
    "album.feedback.title": "Feedback de la client",
    "album.export.title": "Export",
    "album.export.button": "Exportă PDF gata de tipar",
    "album.export.queueing": "Se pune în coadă…",
    "album.export.download": "Descarcă ({size} KB)",
    "album.export.inProgress.title": "Acest export este încă în curs",
    "album.export.delete.title": "Șterge acest export",
    "album.export.delete.confirm": "Ștergi acest export? Această acțiune nu poate fi anulată.",
    "album.export.delete": "Șterge",
    "album.export.deleting": "Se șterge…",

    // --- Client feedback panel --------------------------------------------
    "feedback.loading": "Se încarcă feedback-ul…",
    "feedback.loadError":
      "Comentariile nu au putut fi încărcate, așa că această listă poate fi incompletă. Dacă mesajul de mai sus spune că ruta nu a fost găsită, API-ul rulează cod mai vechi decât editorul — repornește-l și reîncarcă pagina.",
    "feedback.empty.waiting": "Niciun comentariu încă — linkul de partajare este activ și în așteptare.",
    "feedback.empty.none": "Creează un link de partajare și notele clientului vor apărea aici.",
    "feedback.toActOn": "de rezolvat",
    "feedback.done": "finalizate",
    "feedback.jumpTo.title": "Sari la această pagină dublă",
    "feedback.spreadLabel": "Pagina dublă {number}",
    "feedback.doneChip": "Finalizat",
    "feedback.markDone": "Marchează finalizat",
    "feedback.marking": "Se marchează…",
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
