import React from "react";
import styled from "styled-components";
import getHeadings from "../lib/getHeadings";

const TableOfContents = ({ editor }: { editor: any; node: any }) => {
  const { view } = editor;

  return (
    <StyledCon>
      {getHeadings(view.state.doc)?.map(
        (heading: { id: string; title: string; level: number }) => {
          return (
            <StyledButton
              key={heading.title}
              style={{
                paddingLeft:
                  heading.level === 2
                    ? "30px"
                    : heading.level === 3
                    ? "50px"
                    : "15px",
              }}
              onClick={(e) => {
                window.location.hash = `#${heading.id}`;
              }}
            >
              {heading.title}
            </StyledButton>
          );
        }
      )}
    </StyledCon>
  );
};

export default TableOfContents;

const StyledCon = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const StyledButton = styled.button`
  width: 100%;
  cursor: pointer;
  border-radius: 5px;
  background-color: transparent;
  border: none;
  text-align: left;
  padding: 0.4rem 1rem;

  &:hover {
    background-color: gray;
  }
`;

const StyledAnchor = styled.button`
  color: white !important;
  text-decoration: none;
  width: 100% !important;
`;
