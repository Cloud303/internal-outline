import { Schema, NodeType, NodeSpec } from "prosemirror-model";
import React from "react";
import ReactDOM from "react-dom";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Editor } from "~/editor";
import toggleList from "../commands/toggleList";
import TableOfContents from "../components/TableOfContents";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

export default class TableOfContent extends Node {
  editor: Editor;

  get name() {
    return "tableOfContents";
  }

  get schema(): NodeSpec {
    return {
      content: "paragraph+",
      group: "block",
      parseDOM: [{ tag: "div" }],
      toDOM: (node) => {
        let dom;
        if (typeof document !== "undefined") {
          dom = document.createElement("div");
          ReactDOM.render(
            <TableOfContents editor={this.editor} node={node} />,
            dom
          );
          return dom;
        }
        return ["div"];
      },
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleList(type, schema.nodes.toggleList);
  }

  toMarkdown(state: MarkdownSerializerState) {
    state.write(`TOC`);
  }

  parseMarkdown() {
    // return {
    //   block: "text",
    //   getAttrs: (tok: Token) => {
    //     console.log("parseMarkdown", tok);
    //     return {
    //       toggleList: ` <details>
    //         <summary>${tok.attrGet("heading")}</summary>
    //         ${tok.attrGet("desc")}
    //         </details>
    //         `,
    //     };
    //   },
    // };
    return { block: "text" };
  }
}
