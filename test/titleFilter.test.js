const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getTitleFilterLabel,
  normalizeTitleFilters,
  passesTitleFilter
} = require("../src/utils/titleFilter");

test("normalizeTitleFilters splits, trims, and deduplicates keywords", () => {
  assert.deepEqual(
    normalizeTitleFilters("Praz Teguh, Habib Jafar, Praz Teguh"),
    ["Praz Teguh", "Habib Jafar"]
  );
  assert.equal(
    getTitleFilterLabel([]),
    "Semua Judul"
  );
});

test("passesTitleFilter matches case-insensitive normalized titles", () => {
  assert.equal(
    passesTitleFilter(["dr gia"], { title: "Podcast Bareng Dr. Gia Pratama" }),
    true
  );
  assert.equal(
    passesTitleFilter(["habib jafar"], { title: "Podcast Bareng Dr. Gia Pratama" }),
    false
  );
});
