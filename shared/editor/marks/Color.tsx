import { MarkSpec } from "prosemirror-model";
import Mark from "./Mark";

export default class Color extends Mark {
  get name() {
    return "color";
  }

  get schema(): MarkSpec {
    return {
      attrs: {
        color: {
          default: "",
        },
      },
      parseDOM: [
        {
          tag: "span",
          getAttrs: (node: HTMLElement) => ({
            color: node.style.color ? node.style.color : "red",
          }),
        },
      ],
      toDOM: (node) => [
        "span",
        {
          ...node.attrs,
          class: `custom-color`,
          style: `color:${node.attrs.color}`,
          color: `${node.attrs.color}`,
        },
        0,
      ],
    };
  }

  toMarkdown() {
    return {
      open: "<span>",
      close: "<span>",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return { mark: "color" };
  }
}
