import { describe, expect, it } from "vitest";
import { demoBooks, expectFail, expectOk } from "./helpers";

const upload = (books: ReturnType<typeof demoBooks>) =>
  expectOk(
    books.engine.createImport({
      source_id: books.state.dataSources[0].id,
      entity: "Sales",
      file_name: "pos-oct.csv",
      post: false,
      records: [
        { row: 1, external_reference: "POS-T-90001", summary: "Till 1 takings", amount: 1200, status: "VALID" },
        { row: 2, external_reference: "", summary: "Till 2 takings", amount: 600, status: "ERROR", message: "Reference is missing." },
      ],
    }),
  );

describe("import rows", () => {
  it("can be corrected, then post with the batch", () => {
    const books = demoBooks();
    const batch = upload(books);
    expectFail(books.engine.updateImportRecord(batch.id, 2, { external_reference: "" }), /source reference/);
    expectFail(books.engine.updateImportRecord(batch.id, 2, { external_reference: "pos-t-90001" }), /already row 1 of this batch/);
    expectFail(books.engine.updateImportRecord(batch.id, 2, { external_reference: "POS-T-90002", amount: 0 }), /non-zero/);
    const fixed = expectOk(books.engine.updateImportRecord(batch.id, 2, { external_reference: "POS-T-90002", amount: 650 }));
    expect(fixed).toMatchObject({ status: "VALID", amount: 650 });

    expectOk(books.engine.postImportBatch(batch.id));
    const posted = books.state.importBatches.find((b) => b.id === batch.id)!;
    expect(posted.status).toBe("POSTED");
    expectFail(books.engine.updateImportRecord(batch.id, 1, { amount: 1 }), /already posted/);
  });
});

describe("import batches", () => {
  it("can be discarded until a row posts", () => {
    const books = demoBooks();
    const batch = upload(books);
    expectOk(books.engine.discardImportBatch(batch.id));
    expect(books.state.importBatches.some((b) => b.id === batch.id)).toBe(false);

    const again = upload(books);
    expectOk(books.engine.postImportBatch(again.id));
    expectFail(books.engine.discardImportBatch(again.id), /already posted\. Reverse its journal/);
  });
});
