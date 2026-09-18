export interface ChangelogItem {
  titleKey: string;
  descriptionKey: string;
  howToKey: string;
}

export interface ChangelogRelease {
  date: string;
  headingKey: string;
  items: ChangelogItem[];
}

/**
 * Each entry is a translation key, not text — the actual English/Romanian
 * strings live in `lib/i18n/translations.ts` alongside every other string in
 * the app, so a changelog entry is translated the same way anything else is.
 */
export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    date: "September 18, 2026",
    headingKey: "changelog.release.sep18.heading",
    items: [
      { titleKey: "changelog.item.account", descriptionKey: "changelog.item.account.desc", howToKey: "changelog.item.account.how" },
      { titleKey: "changelog.item.guides", descriptionKey: "changelog.item.guides.desc", howToKey: "changelog.item.guides.how" },
      { titleKey: "changelog.item.guidesSnap", descriptionKey: "changelog.item.guidesSnap.desc", howToKey: "changelog.item.guidesSnap.how" },
      { titleKey: "changelog.item.traySort", descriptionKey: "changelog.item.traySort.desc", howToKey: "changelog.item.traySort.how" },
      { titleKey: "changelog.item.trayHover", descriptionKey: "changelog.item.trayHover.desc", howToKey: "changelog.item.trayHover.how" },
      { titleKey: "changelog.item.deleteShoot", descriptionKey: "changelog.item.deleteShoot.desc", howToKey: "changelog.item.deleteShoot.how" },
      { titleKey: "changelog.item.undoRedo", descriptionKey: "changelog.item.undoRedo.desc", howToKey: "changelog.item.undoRedo.how" },
      { titleKey: "changelog.item.dragMove", descriptionKey: "changelog.item.dragMove.desc", howToKey: "changelog.item.dragMove.how" },
      { titleKey: "changelog.item.snapRuler", descriptionKey: "changelog.item.snapRuler.desc", howToKey: "changelog.item.snapRuler.how" },
      { titleKey: "changelog.item.deleteAlbum", descriptionKey: "changelog.item.deleteAlbum.desc", howToKey: "changelog.item.deleteAlbum.how" },
      { titleKey: "changelog.item.stickyToolbar", descriptionKey: "changelog.item.stickyToolbar.desc", howToKey: "changelog.item.stickyToolbar.how" },
      { titleKey: "changelog.item.greeting", descriptionKey: "changelog.item.greeting.desc", howToKey: "changelog.item.greeting.how" },
      { titleKey: "changelog.item.branding", descriptionKey: "changelog.item.branding.desc", howToKey: "changelog.item.branding.how" },
      { titleKey: "changelog.item.language", descriptionKey: "changelog.item.language.desc", howToKey: "changelog.item.language.how" },
      { titleKey: "changelog.item.printSize", descriptionKey: "changelog.item.printSize.desc", howToKey: "changelog.item.printSize.how" },
      { titleKey: "changelog.item.dragBetweenSpreads", descriptionKey: "changelog.item.dragBetweenSpreads.desc", howToKey: "changelog.item.dragBetweenSpreads.how" },
      { titleKey: "changelog.item.insertSpread", descriptionKey: "changelog.item.insertSpread.desc", howToKey: "changelog.item.insertSpread.how" },
      { titleKey: "changelog.item.toolbarBelow", descriptionKey: "changelog.item.toolbarBelow.desc", howToKey: "changelog.item.toolbarBelow.how" },
      { titleKey: "changelog.item.moveAsNewPhoto", descriptionKey: "changelog.item.moveAsNewPhoto.desc", howToKey: "changelog.item.moveAsNewPhoto.how" },
      { titleKey: "changelog.item.landingPage", descriptionKey: "changelog.item.landingPage.desc", howToKey: "changelog.item.landingPage.how" },
      { titleKey: "changelog.item.contactPage", descriptionKey: "changelog.item.contactPage.desc", howToKey: "changelog.item.contactPage.how" },
      { titleKey: "changelog.item.aiAnalysis", descriptionKey: "changelog.item.aiAnalysis.desc", howToKey: "changelog.item.aiAnalysis.how" },
    ],
  },
  {
    date: "September 14, 2026",
    headingKey: "changelog.release.launch.heading",
    items: [
      { titleKey: "changelog.item.launch", descriptionKey: "changelog.item.launch.desc", howToKey: "changelog.item.launch.how" },
    ],
  },
];
