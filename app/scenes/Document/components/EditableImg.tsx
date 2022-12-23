import { observer } from "mobx-react";
import * as React from "react";
import Document from "~/models/Document";

type Props = {
  value?: string | null | void | unknown;
  document: Document;
  readOnly?: boolean;
};

const EditableImg = React.forwardRef(({ value }: Props) => {
  return (
    <div style={{ paddingBottom: "20rem" }}>
      {value ? (
        <div
          style={{
            backgroundImage: `url(${value})`,
            backgroundSize: "cover",
            width: "100%",
            height: "20rem",
            position: "absolute",
            left: 0,
          }}
        ></div>
      ) : (
        <div />
      )}
    </div>
  );
});

export default observer(EditableImg);
