import React from "react";

const TableOfContents = ({ editor, node }: { editor: any; node: any }) => {
  const { view } = editor;
  const { doc } = view.state;

  const headings = [];
  for (let i = 0; i < doc.nodeSize - 2; i++) {
    const node = doc.nodeAt(i);
    if (node?.type?.name === "heading") {
      headings.push(node);
    }
  }

  console.log("node node todo", node);

  return (
    <ul>
      {headings?.map((heading) => {
        console.log(heading);
        return (
          <li key={heading.textContent}>
            <a href={`#h-${heading.textContent?.toLowerCase()}`}>
              {heading.textContent}
            </a>
          </li>
        );
      })}
    </ul>
  );
};

export default TableOfContents;
