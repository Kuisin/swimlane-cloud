/**
 * Build a nested folder tree from flat FileRef ids (POSIX relative paths).
 * Each id is split on "/" — intermediate segments become folder nodes.
 *
 * `folders` names directories that must appear even though no file in `files`
 * sits under them. Git cannot store an empty directory, so a host that has one
 * (the GitHub-backed hosts keep a `.gitkeep` marker) has no path to derive it
 * from — without this an empty folder is invisible the moment it is created.
 */
export function buildFolderTree(files, folders = []) {
  const root = { name: "", path: "", folders: new Map(), files: [] };

  const ensureFolder = (path) => {
    let node = root;
    let acc = "";
    for (const seg of String(path).split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${seg}` : seg;
      if (!node.folders.has(seg)) {
        node.folders.set(seg, { name: seg, path: acc, folders: new Map(), files: [] });
      }
      node = node.folders.get(seg);
    }
    return node;
  };

  for (const folder of folders) ensureFolder(folder);

  for (const file of files) {
    const parts = String(file.id).split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts.pop();
    const node = ensureFolder(parts.join("/"));
    node.files.push({ id: file.id, name: fileName, ref: file });
  }

  return toSortedTree(root);
}

function toSortedTree(node) {
  const folders = [...node.folders.values()]
    .map(toSortedTree)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  return { name: node.name, path: node.path, folders, files };
}

/** All folder paths in the tree (for the "create under folder" picker). */
export function collectFolderPaths(tree, acc = []) {
  for (const folder of tree.folders) {
    acc.push(folder.path);
    collectFolderPaths(folder, acc);
  }
  return acc;
}
