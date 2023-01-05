import React from "react";
import headingToSlug from "../lib/headingToSlug";

const TableOfContents = ({ editor, node }: { editor: any; node: any }) => {
  const { view } = editor;
  const { doc } = view.state;
  const previouslySeen = {};

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
        const slug = headingToSlug(heading);

        previouslySeen[slug] =
          previouslySeen[slug] !== undefined ? previouslySeen[slug] + 1 : 0;

        console.log(previouslySeen);
        return (
          <li key={heading.textContent}>
            <a
              href={`#${
                previouslySeen[slug] > 0
                  ? headingToSlug(heading, previouslySeen[slug])
                  : headingToSlug(heading)
              }`}
            >
              {heading.textContent}
            </a>
          </li>
        );
      })}
    </ul>
  );
};

export default TableOfContents;
