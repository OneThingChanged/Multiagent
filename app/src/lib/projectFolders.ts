import type { Project, ProjectFolder } from "../types";

export function machineKeyForProject(project: Pick<Project, "sshHostId">) {
  return project.sshHostId ? `ssh:${project.sshHostId}` : "local";
}

export function reorderProjectFolders(
  folders: ProjectFolder[],
  draggedId: string,
  targetId: string,
  before: boolean
) {
  if (draggedId === targetId) return folders;
  const dragged = folders.find((folder) => folder.id === draggedId);
  const target = folders.find((folder) => folder.id === targetId);
  if (!dragged || !target || dragged.machineKey !== target.machineKey) {
    return folders;
  }
  const without = folders.filter((folder) => folder.id !== draggedId);
  const targetIndex = without.findIndex((folder) => folder.id === targetId);
  if (targetIndex < 0) return folders;
  const insertIndex = before ? targetIndex : targetIndex + 1;
  return [
    ...without.slice(0, insertIndex),
    dragged,
    ...without.slice(insertIndex),
  ];
}

export function moveProjectToFolder(
  projects: Project[],
  folders: ProjectFolder[],
  projectId: string,
  projectFolderId: string | null,
  targetProjectId?: string,
  before = false
) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return projects;
  const machineKey = machineKeyForProject(project);
  const targetFolder = projectFolderId
    ? folders.find(
        (folder) =>
          folder.id === projectFolderId && folder.machineKey === machineKey
      )
    : null;
  if (projectFolderId && !targetFolder) return projects;

  const moved = { ...project, projectFolderId: targetFolder?.id };
  const without = projects.filter((item) => item.id !== projectId);
  if (targetProjectId && targetProjectId !== projectId) {
    const targetIndex = without.findIndex((item) => item.id === targetProjectId);
    if (targetIndex >= 0) {
      const target = without[targetIndex];
      if (
        machineKeyForProject(target) === machineKey &&
        (target.projectFolderId || undefined) ===
          (targetFolder?.id || undefined)
      ) {
        const insertIndex = before ? targetIndex : targetIndex + 1;
        return [
          ...without.slice(0, insertIndex),
          moved,
          ...without.slice(insertIndex),
        ];
      }
    }
  }

  let insertIndex = without.length;
  for (let index = without.length - 1; index >= 0; index -= 1) {
    const candidate = without[index];
    if (
      machineKeyForProject(candidate) === machineKey &&
      (candidate.projectFolderId || undefined) ===
        (targetFolder?.id || undefined)
    ) {
      insertIndex = index + 1;
      break;
    }
  }
  return [
    ...without.slice(0, insertIndex),
    moved,
    ...without.slice(insertIndex),
  ];
}

export function unassignProjectFolder(projects: Project[], folderId: string) {
  let changed = false;
  const next = projects.map((project) => {
    if (project.projectFolderId !== folderId) return project;
    changed = true;
    return { ...project, projectFolderId: undefined };
  });
  return changed ? next : projects;
}
