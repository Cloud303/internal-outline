import React from "react";
import styled from "styled-components";
import getHeadings from "../lib/getHeadings";

const TableOfContents = ({ editor }: { editor: any; node: any }) => {
  const { view } = editor;

  return (
    <StyledCon>
      {getHeadings(view.state.doc)?.map(
        (heading: { id: string; title: string }) => {
          return (
            <StyledAnchor href={`#${heading.id}`}>
              <StyledButton key={heading.title}>{heading.title}</StyledButton>
            </StyledAnchor>
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
  width: 50%;
`;

const StyledButton = styled.button`
  width: 100%;
  cursor: pointer;
  margin-top: 3px;
`;

const StyledAnchor = styled.a`
  color: white !important;
  text-decoration: none;
  width: 100% !important;
`;
