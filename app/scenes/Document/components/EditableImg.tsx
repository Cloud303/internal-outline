// import { observer } from "mobx-react";
// import React, { useState, useRef, useEffect } from "react";
// import Document from "~/models/Document";
// // import Draggable from "react-draggable";

// type Props = {
//   value?: string | null | void | unknown;
//   document: Document;
//   readOnly?: boolean;
// };

// const EditableImg = React.forwardRef(({ value }: Props) => {
//   const [offsetY, setOffsetY] = useState(0);
//   const [isDragging, setIsDragging] = useState(false);
//   const [backgroundPositionY, setBackgroundPositionY] = useState(0);
//   const [maxBackgroundPositionY, setMaxBackgroundPositionY] = useState(0);
//   const draggableDivRef = useRef(null);
//   const imageRef = useRef(null);

//   useEffect(() => {
//     if (!imageRef?.current) {
//       return;
//     }
//     const imageHeight = imageRef.current.offsetHeight;
//     const newMaxBackgroundPositionY =
//       draggableDivRef.current.offsetHeight - imageHeight;
//     setMaxBackgroundPositionY(newMaxBackgroundPositionY);
//     setBackgroundPositionY((prevPositionY) => {
//       if (prevPositionY < 0) {
//         return 0;
//       } else if (prevPositionY > newMaxBackgroundPositionY) {
//         return newMaxBackgroundPositionY;
//       }
//       return prevPositionY;
//     });
//   }, []);

//   const handleMouseDown = (e) => {
//     setOffsetY(e.clientY);
//     setIsDragging(true);
//   };

//   const handleMouseMove = (e) => {
//     if (isDragging) {
//       setBackgroundPositionY(
//         (prevPositionY) => prevPositionY + e.clientY - offsetY
//       );
//       setOffsetY(e.clientY);
//     }
//   };

//   const handleMouseUp = () => {
//     setIsDragging(false);
//   };

//   const draggableDivStyle = {
//     width: "100%",
//     height: "20rem",
//     overflowY: "clip",
//     overflowX: "visible",
//     // position: "relative",
//     paddingBottom: "20rem",
//     // left: 0,
//   };

//   const imageStyle = {
//     top: `${backgroundPositionY}px`,
//     width: "100%",
//     height: "20rem",
//     position: "absolute",
//     left: 0,
//   };

//   return value ? (
//     <div
//       className="draggable-div"
//       style={draggableDivStyle}
//       ref={draggableDivRef}
//       onMouseDown={handleMouseDown}
//       onMouseMove={handleMouseMove}
//       onMouseUp={handleMouseUp}
//     >
//       {/* <img src={value} alt="Your Image" style={imageStyle} ref={imageRef} /> */}
//       <div
//         style={{
//           backgroundImage: `url(${value})`,
//           backgroundSize: "cover",
//           width: "100%",
//           height: "20rem",
//           position: "absolute",
//           left: 0,
//           top: `${backgroundPositionY}px`,
//         }}
//       />
//     </div>
//   ) : (
//     <div />
//   );
// });

// export default observer(EditableImg);

import { observer } from "mobx-react";
import React, { useRef, useState } from "react";
import styled from "styled-components";
import Document from "~/models/Document";

type Props = {
  value?: string | null | void | unknown;
  document: Document;
  readOnly?: boolean;
  editCover: boolean;
};

const StyledCon = styled.div`
  -ms-overflow-style: none; /* Internet Explorer 10+ */
  scrollbar-width: none; /* Firefox */

  &::-webkit-scrollbar {
    display: none; /* Safari and Chrome */
  }
`;

const EditableImg = React.forwardRef(({ value, editCover }: Props) => {
  const [dragging, setDragging] = useState(false);
  const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const scrollContainerRef = useRef(null);
  const initialMousePositionRef = useRef({ x: 0, y: 0 });
  const initialScrollPositionRef = useRef({ left: 0, top: 0 });

  const handleMouseDown = (event: any) => {
    event.preventDefault();
    setDragging(true);
    initialMousePositionRef.current = { x: event.clientX, y: event.clientY };
    initialScrollPositionRef.current = { ...scrollPosition };
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleMouseMove = (event: any) => {
    if (!dragging && !scrollContainerRef?.current) {
      return;
    }

    const { clientX, clientY } = event;
    const deltaX = clientX - initialMousePositionRef.current.x;
    const deltaY = clientY - initialMousePositionRef.current.y;

    (scrollContainerRef.current as any).scrollLeft =
      initialScrollPositionRef.current.left - deltaX;
    (scrollContainerRef.current as any).scrollTop =
      initialScrollPositionRef.current.top - deltaY;

    setScrollPosition({
      left: (scrollContainerRef.current as any).scrollLeft,
      top: (scrollContainerRef.current as any).scrollTop,
    });

    setDragPosition({ x: deltaX > 0 ? 0 : deltaX, y: deltaY > 0 ? 0 : deltaY });
  };

  return (
    <>
      {value ? (
        <div
          style={{
            paddingBottom: "20rem",
            width: "100%",
          }}
          onMouseLeave={() => editCover && handleMouseUp()}
        >
          <div
            style={{
              position: "absolute",
              width: "100%",
              left: 0,
            }}
          >
            <StyledCon
              ref={scrollContainerRef}
              style={{
                position: "relative",
                height: "20rem",
                width: "100%",
                overflow: "scroll",
                cursor: !editCover ? "default" : dragging ? "grabbing" : "grab",
              }}
              onMouseDown={(e) => editCover && handleMouseDown(e)}
              onMouseUp={() => editCover && handleMouseUp}
              onMouseMove={(e) => editCover && handleMouseMove(e)}
              className="editable-image-scroll"
            >
              <img
                src={value as string}
                style={{
                  position: "absolute",
                  left: dragPosition.x,
                  top: dragPosition.y,
                }}
                draggable="false"
              />
            </StyledCon>
          </div>
        </div>
      ) : (
        <div />
      )}
    </>
  );
});

export default observer(EditableImg);
