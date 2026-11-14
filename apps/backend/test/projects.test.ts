import assert from "node:assert/strict";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import type { Scope } from "@omp-console/protocol";
import { migrateStore } from "../src/store/migrate.js";
import {
  pairWithScopes,
  startTestServer,
  type TestServer,
} from "./helpers.js";

function authed(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function postJson(
  server: TestServer,
  path: string,
  token: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authed(token) },
    body: JSON.stringify(body),
  });
}

describe("project registry", () => {
  let server: TestServer;
  let token: string;

  before(async () => {
    server = await startTestServer({ pairingCode: null });
    token = await pairWithScopes(
      server,
      ["read", "agent", "manage"] as Scope[],
      "project-admin",
    );
  });

  after(async () => {
    await server.stop();
  });

  it("lists projects as an array", async () => {
    const res = await fetch(`${server.baseUrl}/v1/projects`, { headers: authed(token) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { projects: unknown[] };
    assert.ok(Array.isArray(body.projects));
  });

  it("adds a directory, resolves the path, and defaults the name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-add-project-"));
    const res = await postJson(server, "/v1/projects", token, { path: dir });
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
      project: { id: string; name: string; path: string };
    };
    assert.equal(body.project.path, resolve(dir));
    assert.equal(body.project.name, basename(dir));

    const list = await fetch(`${server.baseUrl}/v1/projects`, { headers: authed(token) });
    const listBody = (await list.json()) as { projects: Array<{ id: string }> };
    assert.ok(listBody.projects.some((p) => p.id === body.project.id));
    await rm(dir, { recursive: true, force: true });
  });

  it("dedupes by resolved path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-dup-project-"));
    const first = await postJson(server, "/v1/projects", token, { path: dir });
    const second = await postJson(server, "/v1/projects", token, { path: dir });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    const a = (await first.json()) as { project: { id: string } };
    const b = (await second.json()) as { project: { id: string } };
    assert.equal(a.project.id, b.project.id);
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps an explicit name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-named-project-"));
    const res = await postJson(server, "/v1/projects", token, {
      path: dir,
      name: "My Project",
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { project: { name: string } };
    assert.equal(body.project.name, "My Project");
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects a path that is not an existing directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-bad-project-"));
    const missing = await postJson(server, "/v1/projects", token, {
      path: join(dir, "nope"),
    });
    assert.equal(missing.status, 400);

    const filePath = join(dir, "file.txt");
    await writeFile(filePath, "hello", "utf8");
    const notDir = await postJson(server, "/v1/projects", token, { path: filePath });
    assert.equal(notDir.status, 400);

    await unlink(filePath);
    await rm(dir, { recursive: true, force: true });
  });

  it("removes a project and reports a missing one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-remove-project-"));
    const added = await postJson(server, "/v1/projects", token, { path: dir });
    const project = ((await added.json()) as { project: { id: string } }).project;

    const removed = await fetch(`${server.baseUrl}/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: authed(token),
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { removed: true });

    const again = await fetch(`${server.baseUrl}/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: authed(token),
    });
    assert.equal(again.status, 404);
    await rm(dir, { recursive: true, force: true });
  });

  it("enforces the read and manage scopes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-scope-project-"));
    const readOnly = await pairWithScopes(server, ["read"] as Scope[], "project-reader");
    const canList = await fetch(`${server.baseUrl}/v1/projects`, {
      headers: authed(readOnly),
    });
    assert.equal(canList.status, 200);
    const cannotAdd = await postJson(server, "/v1/projects", readOnly, { path: dir });
    assert.equal(cannotAdd.status, 403);

    const manageOnly = await pairWithScopes(server, ["manage"] as Scope[], "project-manager");
    const cannotRead = await fetch(`${server.baseUrl}/v1/projects`, {
      headers: authed(manageOnly),
    });
    assert.equal(cannotRead.status, 403);

    const added = await postJson(server, "/v1/projects", manageOnly, { path: dir });
    assert.equal(added.status, 201);
    const project = ((await added.json()) as { project: { id: string } }).project;
    const cannotRemove = await fetch(`${server.baseUrl}/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: authed(readOnly),
    });
    assert.equal(cannotRemove.status, 403);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("store migration v2 to v3", () => {
  it("adds an empty project registry and keeps devices", () => {
    const migrated = migrateStore({
      schemaVersion: 2,
      serverId: "server-2",
      pairingCodes: [],
      devices: [
        {
          id: "dev-1",
          name: "phone",
          tokenHash: "hash",
          scopes: ["read"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    assert.equal(migrated.schemaVersion, 3);
    assert.deepEqual(migrated.projects, []);
    assert.equal(migrated.devices.length, 1);
    assert.equal(migrated.devices[0]?.id, "dev-1");
  });
});
