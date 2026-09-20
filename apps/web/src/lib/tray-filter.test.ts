import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NO_TRAY_FILTER,
  countTrayPhotos,
  filterTrayPhotos,
  isFiltering,
  type TrayContext,
  type TrayFilter,
} from "./tray-filter";

const photos = [
  { id: "a", fileName: "IMG_0001.jpg" },
  { id: "b", fileName: "IMG_0002.jpg" },
  { id: "c", fileName: "church-01.JPG" },
  { id: "d", fileName: "party-01.jpg" },
  { id: "e", fileName: "IMG_0005.jpg" },
];
const categories: Record<string, string> = { a: "PORTRAIT", b: "PORTRAIT", c: "CEREMONY", d: "RECEPTION" };
const context: TrayContext = {
  clientPickedIds: new Set(["a", "c", "d"]),
  usedPhotoIds: new Set(["a", "d"]),
  categoryOf: (id) => categories[id],
  isAlbumWorthy: (id) => ["a", "b", "c"].includes(id),
};
const ids = (filter: Partial<TrayFilter>) =>
  filterTrayPhotos(photos, { ...NO_TRAY_FILTER, ...filter }, context).map((photo) => photo.id);

describe("tray filter", () => {
  it("shows everything, in the original order, when no filter is set", () => {
    assert.deepEqual(ids({}), ["a", "b", "c", "d", "e"]);
    assert.equal(isFiltering(NO_TRAY_FILTER), false);
  });

  it("shows only the photos a client picked", () => {
    assert.deepEqual(ids({ show: "picks" }), ["a", "c", "d"]);
  });

  it("separates photos already in the album from those not yet used", () => {
    assert.deepEqual(ids({ show: "used" }), ["a", "d"]);
    assert.deepEqual(ids({ show: "unused" }), ["b", "c", "e"]);
  });

  it("lists the album-worthy ones", () => {
    assert.deepEqual(ids({ show: "worthy" }), ["a", "b", "c"]);
  });

  it("filters by photo type, and a photo with no analysis matches no type", () => {
    assert.deepEqual(ids({ category: "PORTRAIT" }), ["a", "b"]);
    assert.deepEqual(ids({ category: "CEREMONY" }), ["c"]);
    assert.ok(!ids({ category: "PORTRAIT" }).includes("e"));
  });

  it("searches the file name, ignoring case and surrounding spaces", () => {
    assert.deepEqual(ids({ search: "  CHURCH " }), ["c"]);
    assert.deepEqual(ids({ search: "img_" }), ["a", "b", "e"]);
    assert.deepEqual(ids({ search: "nothing like this" }), []);
  });

  it("combines every condition — client picks that are also portraits and not yet in the album", () => {
    assert.deepEqual(ids({ show: "picks", category: "PORTRAIT" }), ["a"]);
    assert.deepEqual(ids({ show: "picks", category: "CEREMONY", search: "church" }), ["c"]);
    assert.deepEqual(ids({ show: "unused", category: "PORTRAIT" }), ["b"]);
    assert.deepEqual(ids({ show: "picks", category: "RECEPTION", search: "img" }), []);
  });

  it("reports that a filter is active for each kind of filter", () => {
    assert.ok(isFiltering({ ...NO_TRAY_FILTER, show: "picks" }));
    assert.ok(isFiltering({ ...NO_TRAY_FILTER, category: "GROUP" }));
    assert.ok(isFiltering({ ...NO_TRAY_FILTER, search: "x" }));
    assert.equal(isFiltering({ ...NO_TRAY_FILTER, search: "   " }), false, "spaces alone are not a filter");
  });

  it("counts each choice for the menu labels", () => {
    assert.deepEqual(countTrayPhotos(photos, context), { all: 5, picks: 3, unused: 3, used: 2, worthy: 3 });
  });

  it("copes with no client picks at all", () => {
    const none = { ...context, clientPickedIds: new Set<string>() };
    assert.deepEqual(filterTrayPhotos(photos, { ...NO_TRAY_FILTER, show: "picks" }, none), []);
    assert.equal(countTrayPhotos(photos, none).picks, 0);
  });
});
