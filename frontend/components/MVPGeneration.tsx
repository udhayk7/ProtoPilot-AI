"use client";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
}

type Props = {
  /** Structured file/folder tree, or null for empty state */
  structure?: FileNode[] | null;
  /** Fallback: preformatted string (e.g. from backend) */
  structureText?: string | null;
};

function TreeItem({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const isFolder = node.type === "folder";
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="mvp-tree__item" style={{ paddingLeft: `${depth * 1.25}rem` }}>
      <span className={`mvp-tree__icon mvp-tree__icon--${isFolder ? "folder" : "file"}`} aria-hidden>
        {isFolder ? (hasChildren ? "📁" : "📂") : "📄"}
      </span>
      <span className="mvp-tree__name">{node.name}</span>
      {hasChildren && (
        <div className="mvp-tree__children">
          {node.children!.map((child, i) => (
            <TreeItem key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MVPGeneration({ structure, structureText }: Props) {
  const hasStructure = structure && structure.length > 0;
  const hasText = structureText && structureText.trim() !== "";

  if (!hasStructure && !hasText) {
    return null;
  }

  if (hasText) {
    return (
      <div className="mvp-generation">
        <pre className="mvp-tree mvp-tree--pre">
          {structureText}
        </pre>
      </div>
    );
  }

  return (
    <div className="mvp-generation">
      <div className="mvp-tree" role="tree">
        {structure!.map((node, i) => (
          <TreeItem key={`${node.name}-${i}`} node={node} />
        ))}
      </div>
    </div>
  );
}
