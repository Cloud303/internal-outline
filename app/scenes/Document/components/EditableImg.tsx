import { observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import Draggable from "react-draggable";
import styled from "styled-components";
import Document from "~/models/Document";

type Props = {
  value?: string | null | void | unknown;
  document: Document;
  readOnly?: boolean;
  editCover: boolean;
  positionX: any;
  positionY: any;
  handleUpdatePostion: any;
};

const StyledCon = styled.div`
  -ms-overflow-style: none; /* Internet Explorer 10+ */
  scrollbar-width: none; /* Firefox */

  &::-webkit-scrollbar {
    display: none; /* Safari and Chrome */
  }
`;

const EditableImg = ({
  value,
  editCover,
  positionX,
  positionY,
  handleUpdatePostion,
}: Props) => {
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const posx = positionX === null ? 0 : Number(positionX);
    const poxy = positionY === null ? 0 : Number(positionY);

    if (posx !== dragPosition.x || poxy !== dragPosition.y) {
      setDragPosition({ x: posx, y: poxy });
    }
  }, [positionY, positionX]);

  const handleStop = (e: any, data: { x: any; y: any }) => {
    setDragPosition({
      x: data.x,
      y: data.y,
    });
    handleUpdatePostion(data.y, data.x);
  };

  const DraggableRender = React.useCallback(
    () => (
      <Draggable
        defaultPosition={{ x: dragPosition.x, y: dragPosition.y }}
        onStop={handleStop}
        disabled={!editCover}
      >
        <img src={value as string} draggable="false" />
      </Draggable>
    ),
    [dragPosition, editCover]
  );

  return (
    <>
      {value ? (
        <div
          style={{
            paddingBottom: "20rem",
            width: "100%",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "100%",
              left: 0,
            }}
          >
            <StyledCon
              style={{
                position: "relative",
                height: "20rem",
                width: "100%",
                overflow: editCover ? "scroll" : "hidden",
                cursor: editCover ? "move" : "default",
              }}
              className="editable-image-scroll"
            >
              <DraggableRender />
            </StyledCon>
          </div>
        </div>
      ) : (
        <div />
      )}
    </>
  );
};

export default observer(EditableImg);
