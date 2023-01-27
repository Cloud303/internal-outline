import {
  Schema,
  NodeType,
  NodeSpec,
  Node as ProsemirrorModel,
} from "prosemirror-model";
import React from "react";
import ReactDOM from "react-dom";
import DocumentTemplate from "~/scenes/Document/components/DocumentTemplate";
import { Editor } from "~/editor";
import DocumentEditor from "~/editor/DocumentEditor";
import toggleList from "../commands/toggleList";
import Accordion from "../components/Accordion";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

export default class ToggleList extends Node {
  editor: Editor;

  get name() {
    return "template";
  }

  get schema(): NodeSpec {
    return {
      content: "paragraph+",
      group: "block",
      parseDOM: [{ tag: "div" }],
      toDOM: (node) => {
        const dom = document.createElement("div");
        ReactDOM.render(
          // <DocumentTemplate
          //   document={this.editor.view.state.doc}
          //   editor={this.editor}
          // />,
          <h1>hello</h1>,
          dom
        );
        return dom;
      },
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleList(type, schema.nodes.list_item);
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

const TemplateComponent = () => {
  return <div>Template</div>;
};
