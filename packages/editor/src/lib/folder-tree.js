/**
 * Build a nested folder tree from flat FileRef ids (POSIX relative paths).
 * Each id is split on "/" — intermediate segments become folder nodes.
 */
export function buildFolderTree(files) {
  const root = { name: "", path: "", folders: new Map(), files: [] };

  for (const file of files) {
    const parts = String(file.id).split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts.pop();
    let node = root;
    let acc = "";
    for (const seg of parts) {
      acc = acc ? `${acc}/${seg}` : seg;
      if (!node.folders.has(seg)) {
        node.folders.set(seg, { name: seg, path: acc, folders: new Map(), files: [] });
      }
      node = node.folders.get(seg);
    }
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
