import {
  Schema,
  NodeType,
  NodeSpec,
  Node as ProsemirrorModel,
} from "prosemirror-model";
import React from "react";
import ReactDOM from "react-dom";
import { Editor } from "~/editor";
import toggleList from "../commands/toggleList";
import TableOfContents from "../components/TableOfContents";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";
// import { EditorState } from "prosemirror-state";

export default class ToggleList extends Node {
  editor: Editor;

  get name() {
    return "tableOfContents";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        heading: {
          default: "",
        },
        desc: {
          default: "",
        },
      },
      content: "paragraph+",
      group: "block",
      parseDOM: [{ tag: "div" }],
      toDOM: () => {
        const dom = document.createElement("div");
        ReactDOM.render(<TableOfContents editor={this.editor} />, dom);
        return dom;
      },
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleList(type, schema.nodes.toggleList);
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorModel) {
    state.write(
      `
        <details>
        <summary>${node.attrs.heading}</summary>
        ${node.attrs.desc}
        </details>
        `
    );
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
