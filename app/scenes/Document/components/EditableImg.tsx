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
import * as React from "react";
import Document from "~/models/Document";

type Props = {
  value?: string | null | void | unknown;
  document: Document;
  readOnly?: boolean;
};

const EditableImg = React.forwardRef(({ value }: Props) => (
  <>
    {value ? (
      <div style={{ paddingBottom: "20rem" }}>
        <div
          style={{
            backgroundImage: `url(${value})`,
            backgroundSize: "cover",
            width: "100%",
            height: "20rem",
            position: "absolute",
            left: 0,
          }}
        />
      </div>
    ) : (
      <div />
    )}
  </>
));

export default observer(EditableImg);
