import { observer } from "mobx-react";
import * as React from "react";
import Document from "~/models/Document";

type Props = {
  value: string;
  document: Document;
  readOnly?: boolean;
};

const EditableImg = React.forwardRef(({ value }: Props) => {
  return (
    <>
      {value ? (
        <div
          style={{
            backgroundImage: `url(${value})`,
            backgroundSize: "cover",
            width: "100%",
            height: "20rem",
          }}
        ></div>
      ) : (
        <div />
      )}
    </>
  );
});

export default observer(EditableImg);
