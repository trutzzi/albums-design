import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVCard,
  displayWebsite,
  filterGallery,
  filterKey,
  formatBytes,
  scopeBytes,
  sectionCounts,
  splitTabs,
  telUrl,
  whatsappUrl,
} from "./client-gallery";

const photos = [
  { id: "a", section: "PREPARATION" },
  { id: "b", section: "CEREMONY" },
  { id: "c", section: null },
];

describe("filterGallery", () => {
  it("shows everything, one chapter, or the client's favourites", () => {
    const favorites = new Set(["c", "a"]);
    assert.deepEqual(
      filterGallery(photos, { kind: "all" }, favorites).map((p) => p.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      filterGallery(photos, { kind: "section", section: "CEREMONY" }, favorites).map((p) => p.id),
      ["b"],
    );
    assert.deepEqual(
      filterGallery(photos, { kind: "favorites" }, favorites).map((p) => p.id),
      ["a", "c"],
    );
  });

  it("gives every filter its own key", () => {
    assert.equal(filterKey({ kind: "all" }), "all");
    assert.equal(filterKey({ kind: "section", section: "COUPLE" }), "section:COUPLE");
  });
});

describe("splitTabs", () => {
  const sections = ["A", "B", "C", "D", "E"];

  it("puts the chapters that do not fit behind More", () => {
    assert.deepEqual(splitTabs(sections, 3), [
      ["A", "B", "C"],
      ["D", "E"],
    ]);
    assert.deepEqual(splitTabs(sections, 9), [sections, []]);
  });

  it("keeps the chosen chapter visible even when it would be under More", () => {
    assert.deepEqual(splitTabs(sections, 3, "E"), [
      ["A", "B", "E"],
      ["C", "D"],
    ]);
    assert.deepEqual(splitTabs(sections, 3, "B"), [
      ["A", "B", "C"],
      ["D", "E"],
    ]);
  });
});

describe("contact links", () => {
  it("dials and chats on the bare international number", () => {
    assert.equal(whatsappUrl("+40 (721) 283-080"), "https://wa.me/40721283080");
    assert.equal(telUrl("+40 (721) 283-080"), "tel:+40721283080");
  });

  it("shows a website the way people say it", () => {
    assert.equal(displayWebsite("https://artzz.ro/"), "artzz.ro");
    assert.equal(displayWebsite("http://artzz.ro/gallery"), "artzz.ro/gallery");
  });

  it("builds a vCard the address book can open, escaping what would break it", () => {
    const card = buildVCard({
      name: "Artzz Foto; Studio, Iasi",
      title: "Photographer",
      phone: "+40 721 283 080",
      email: "hello@artzz.ro",
      website: "https://artzz.ro",
    });
    assert.ok(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n"));
    assert.match(card, /FN:Artzz Foto\\; Studio\\, Iasi\r\n/);
    assert.match(card, /TEL;TYPE=CELL:\+40721283080\r\n/);
    assert.match(card, /EMAIL:hello@artzz.ro\r\n/);
    assert.ok(card.endsWith("END:VCARD\r\n"));
  });

  it("leaves out what the studio has not filled in", () => {
    const card = buildVCard({ name: "Artzz Foto" });
    assert.doesNotMatch(card, /TEL|EMAIL|URL|TITLE/);
  });
});

describe("sectionCounts", () => {
  it("counts each chapter and leaves out photos with none", () => {
    const counted = sectionCounts([...photos, { id: "d", section: "CEREMONY" }]);
    assert.deepEqual(
      [...counted],
      [
        ["PREPARATION", 1],
        ["CEREMONY", 2],
      ],
    );
  });
});

describe("scopeBytes", () => {
  const sized = [
    { id: "a", section: "PREPARATION", byteSize: 100 },
    { id: "b", section: "CEREMONY", byteSize: 250 },
    { id: "c", section: "CEREMONY", byteSize: null },
  ];

  it("adds up the photos in the download, skipping ones no longer stored", () => {
    assert.equal(scopeBytes(sized, { kind: "all" }, new Set()), 350);
    assert.equal(scopeBytes(sized, { kind: "section", section: "CEREMONY" }, new Set()), 250);
    assert.equal(scopeBytes(sized, { kind: "favorites" }, new Set(["a", "c"])), 100);
  });
});

describe("formatBytes", () => {
  it("reads like a person would say it", () => {
    assert.equal(formatBytes(300), "1 KB");
    assert.equal(formatBytes(512 * 1024), "512 KB");
    assert.equal(formatBytes(5.25 * 1024 * 1024), "5.3 MB");
    assert.equal(formatBytes(9.8 * 1024 * 1024 * 1024), "9.80 GB");
  });
});
