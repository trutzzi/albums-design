import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { ExportJob } from "../src/modules/export-print/domain/export-job";
import { DeleteExportUseCase } from "../src/modules/export-print/application/use-cases/delete-export.use-case";
import { InMemoryExportJobRepository, InMemoryObjectStorage } from "./support/in-memory";

const ALBUM = UniqueEntityId.create();

describe("deleting an export", () => {
  it("removes a READY job's row and its stored PDF", async () => {
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const job = ExportJob.request({ albumId: ALBUM, printProfileId: "client-proof-150" });
    job.markReady({ storageKey: "exports/a.pdf", byteSize: 1024, pageCount: 3 });
    await jobs.save(job);
    storage.upload("exports/a.pdf", new Uint8Array([1, 2, 3]));

    const result = await new DeleteExportUseCase(jobs, storage).execute({
      exportJobId: job.id.toString(),
    });

    assert.ok(result.isSuccess);
    assert.equal(await jobs.findById(job.id), undefined);
    assert.equal(storage.objects.has("exports/a.pdf"), false, "the stored PDF should be gone too");
  });

  it("removes a FAILED job with nothing stored, without erroring on storage", async () => {
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const job = ExportJob.request({ albumId: ALBUM, printProfileId: "client-proof-150" });
    job.markFailed("Ran out of memory rendering spread 14.");
    await jobs.save(job);

    const result = await new DeleteExportUseCase(jobs, storage).execute({
      exportJobId: job.id.toString(),
    });

    assert.ok(result.isSuccess);
    assert.equal(await jobs.findById(job.id), undefined);
  });

  it("refuses to delete a job that is still QUEUED", async () => {
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const job = ExportJob.request({ albumId: ALBUM, printProfileId: "client-proof-150" });
    await jobs.save(job);

    const result = await new DeleteExportUseCase(jobs, storage).execute({
      exportJobId: job.id.toString(),
    });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "CONFLICT");
    // Deliberately still there — refusing must not have deleted anything.
    assert.ok(await jobs.findById(job.id));
  });

  it("refuses to delete a job that is still RENDERING", async () => {
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const job = ExportJob.request({ albumId: ALBUM, printProfileId: "client-proof-150" });
    job.markRendering();
    await jobs.save(job);

    const result = await new DeleteExportUseCase(jobs, storage).execute({
      exportJobId: job.id.toString(),
    });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "CONFLICT");
  });

  it("reports 404 for an export that does not exist", async () => {
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();

    const result = await new DeleteExportUseCase(jobs, storage).execute({
      exportJobId: UniqueEntityId.create().toString(),
    });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "NOT_FOUND");
  });
});
