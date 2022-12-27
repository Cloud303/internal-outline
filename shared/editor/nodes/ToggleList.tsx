import { wrappingInputRule } from "prosemirror-inputrules";
import {
  Schema,
  NodeType,
  NodeSpec,
  Node as ProsemirrorModel,
} from "prosemirror-model";
import React from "react";
import ReactDOM from "react-dom";
import toggleList from "../commands/toggleList";
import Accordion from "../components/Accordion";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

export default class ToggleList extends Node {
  get name() {
    return "toggleList";
  }

  get schema(): NodeSpec {
    return {
      content: "list_item",
      group: "block",
      parseDOM: [{ tag: "div" }],
      toDOM: () => {
        const dom = document.createElement("div");
        ReactDOM.render(<Accordion />, dom);
        return dom;
      },
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleList(type, schema.nodes.list_item);
  }

  keys({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      "Shift-Ctrl-8": toggleList(type, schema.nodes.list_item),
    };
  }

  inputRules({ type }: { type: NodeType }) {
    return [wrappingInputRule(/^\s*([-+*])\s$/, type)];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorModel) {
    state.renderList(node, "  ", () => (node.attrs.bullet || "*") + " ");
  }

  parseMarkdown() {
    return { block: "bullet_list" };
  }
}
