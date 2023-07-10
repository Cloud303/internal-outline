import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";

const useFocus = () => {
  const htmlElRef = useRef<any>(null);
  const setFocus = () => {
    htmlElRef.current && htmlElRef.current.focus();
  };

  return [htmlElRef, setFocus] as const;
};
const AccordionEditor = ({
  heading,
  desc,
  editor,
}: {
  heading: any;
  desc: any;
  editor?: any;
}) => {
  const [open, setOpen] = useState(false);
  const [inputRef, setInputFocus] = useFocus();
  const [headingElement, setHeadingElement] = useState<any>(null);
  const [values, setValues] = useState({
    heading,
    desc,
  });
  const { view } = editor;
  const { tr } = view.state;

  useEffect(() => {
    if (!inputRef?.current?.value) {
      setInputFocus();
    }
  }, [values]);

  const setAttributes = () => {
    // console.log(headingElement);
    const { top, left } = headingElement.target.getBoundingClientRect();
    const result = view.posAtCoords({ top, left });
    if (
      headingElement.target.localName === "input" &&
      values.heading !== heading
    ) {
      if (result) {
        const transaction = tr.setNodeMarkup(result.inside, undefined, {
          heading: headingElement.target.value,
          desc,
        });
        view.dispatch(transaction);
      }
    } else if (
      headingElement.target.localName === "textarea" &&
      values.desc !== desc
    ) {
      if (result) {
        const transaction = tr.setNodeMarkup(result.inside, undefined, {
          heading,
          desc: headingElement.target.value,
        });
        view.dispatch(transaction);
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <button
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
          padding: "0.4rem 0",
          border: "none",
          backgroundColor: "transparent",
          cursor: "pointer",
          outline: "none",
          boxShadow: "none !important",
        }}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <StyledButton>
          {open ? (
            <svg
              className="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiBox-root css-1om0hkc"
              focusable="false"
              aria-hidden="true"
              viewBox="0 0 24 24"
              data-testid="ArrowDropDownIcon"
              width="100%"
              height="100%"
              fill="currentColor"
            >
              <path d="m7 10 5 5 5-5z" />
            </svg>
          ) : (
            <svg
              className="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiBox-root css-1om0hkc"
              focusable="false"
              aria-hidden="true"
              viewBox="0 0 24 24"
              data-testid="ArrowRightIcon"
              width="100%"
              height="100%"
              fill="currentColor"
            >
              <path d="m10 17 5-5-5-5v10z" />
            </svg>
          )}
        </StyledButton>
        <StyledInput
          type="text"
          ref={inputRef}
          value={values.heading}
          placeholder="Enter title"
          onChange={(e) => {
            setHeadingElement(e);
            setValues({ ...values, heading: e.target.value });
          }}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => setHeadingElement(e)}
          onKeyDown={(e) => {
            e.stopPropagation();
          }}
          onBlur={setAttributes}
        />
      </button>
      {open && (
        <div style={{ paddingTop: "0.4rem" }}>
          <StyledArea
            value={values.desc}
            placeholder="Enter description"
            onChange={(e) => {
              setHeadingElement(e);
              setValues({ ...values, desc: e.target.value });
            }}
            onFocus={(e) => setHeadingElement(e)}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            onBlur={setAttributes}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
};

export default AccordionEditor;

const StyledInput = styled.input`
  border: none;
  font-size: 20px;
  font-weight: 500;
  width: 100%;
  outline: none;
  margin-left: 5px;
  /* margin-bottom: -20px !important; */
  background-color: transparent;
`;

const StyledButton = styled.button`
  border: none;
  padding: 0 !important;
  width: 24px;
  height: 22px;
  border-radius: 3px;
  background-color: transparent;
  cursor: pointer;
  outline: none;

  &:hover {
    background-color: #8080806c;
  }
  &:active {
    background-color: #80808094;
  }
`;

const StyledArea = styled.textarea`
  width: 100%;
  height: 100%;
  border: none;
  resize: none;
  outline: none;
  background-color: transparent;
`;
