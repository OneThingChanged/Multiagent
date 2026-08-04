import { describe, expect, it } from "vitest";
import type { Project, ProjectFolder } from "../types";
import {
  moveProjectToFolder,
  reorderProjectFolders,
  unassignProjectFolder,
} from "./projectFolders";

const folders: ProjectFolder[] = [
  { id: "work", name: "Work", machineKey: "local", createdAt: 1 },
  { id: "personal", name: "Personal", machineKey: "local", createdAt: 2 },
  { id: "remote", name: "Remote", machineKey: "ssh:host-1", createdAt: 3 },
];

const projects: Project[] = [
  {
    id: "a",
    name: "A",
    folder: "K:\\A",
    projectFolderId: "work",
    createdAt: 1,
  },
  {
    id: "b",
    name: "B",
    folder: "K:\\B",
    projectFolderId: "personal",
    createdAt: 2,
  },
  {
    id: "ssh",
    name: "SSH",
    folder: "",
    sshHostId: "host-1",
    projectFolderId: "remote",
    createdAt: 3,
  },
];

describe("project folder operations", () => {
  it("moves and orders projects inside a same-machine folder", () => {
    const moved = moveProjectToFolder(projects, folders, "b", "work", "a", true);
    expect(moved.map((project) => project.id)).toEqual(["b", "a", "ssh"]);
    expect(moved[0].projectFolderId).toBe("work");
  });

  it("rejects moving a local project into an SSH folder", () => {
    expect(moveProjectToFolder(projects, folders, "a", "remote")).toBe(projects);
  });

  it("only reorders folders within the same machine", () => {
    expect(reorderProjectFolders(folders, "personal", "work", true).map((x) => x.id))
      .toEqual(["personal", "work", "remote"]);
    expect(reorderProjectFolders(folders, "work", "remote", true)).toBe(folders);
  });

  it("moves children to uncategorized without deleting projects", () => {
    const next = unassignProjectFolder(projects, "work");
    expect(next).toHaveLength(3);
    expect(next.find((project) => project.id === "a")?.projectFolderId).toBeUndefined();
  });
});
