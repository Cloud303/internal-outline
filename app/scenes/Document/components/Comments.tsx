import { AnimatePresence } from "framer-motion";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useRouteMatch } from "react-router-dom";
import styled from "styled-components";
import { ProsemirrorData } from "@shared/types";
import Empty from "~/components/Empty";
import Flex from "~/components/Flex";
import Scrollable from "~/components/Scrollable";
import useCurrentUser from "~/hooks/useCurrentUser";
import useFocusedComment from "~/hooks/useFocusedComment";
import useKeyDown from "~/hooks/useKeyDown";
import usePersistedState from "~/hooks/usePersistedState";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import CommentForm from "./CommentForm";
import CommentThread from "./CommentThread";
import Sidebar from "./SidebarLayout";

function Comments() {
  const { ui, comments, documents } = useStores();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const match = useRouteMatch<{ documentSlug: string }>();
  const document = documents.getByUrl(match.params.documentSlug);
  const focusedComment = useFocusedComment();
  // const can = usePolicy(document?.id);
  const [threadOption, setThreadOption] = React.useState("Open");
  const dropDownMenuOptions = ["All", "Open", "Resolved"];
  const can = usePolicy(document);

  const handleChange = (event: {
    target: { value: React.SetStateAction<string> };
  }) => {
    setThreadOption(event.target.value);
  };
  useKeyDown("Escape", () => document && ui.collapseComments(document?.id));

  const [draft, onSaveDraft] = usePersistedState<ProsemirrorData | undefined>(
    `draft-${document?.id}-new`,
    undefined
  );

  if (!document) {
    return null;
  }

  const threads = comments
    .threadsInDocument(document.id)
    .filter((thread) => !thread.isNew || thread.createdById === user.id)
    .filter((thread) => {
      if (threadOption === "Resolved" && thread?.resolvedById !== null) {
        return thread;
      } else if (threadOption === "All") {
        return thread;
      } else if (
        (threadOption === "Open" && thread?.resolvedById === null) ||
        thread.isNew
      ) {
        return thread;
      }
      // Fallback: Return false for any other cases
      return false;
    });
  const hasComments = threads.length > 0;
  const hasMultipleComments = comments.inDocument(document.id).length > 1;

  return (
    <Sidebar
      title={t("Comments")}
      onClose={() => ui.collapseComments(document?.id)}
      scrollable={false}
    >
      <Scrollable
        id="comments"
        overflow={hasMultipleComments ? undefined : "initial"}
        bottomShadow={!focusedComment}
        hiddenScrollbars
        topShadow
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            paddingRight: "3vh",
            paddingBottom: "2vh",
            width: "100%",
          }}
        >
          <label>
            Show:
            <select value={threadOption} onChange={handleChange}>
              {dropDownMenuOptions.map((el, i) => (
                <option key={i} value={el}>
                  {el}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Wrapper $hasComments={hasComments}>
          {hasComments ? (
            threads.map((thread) => (
              <CommentThread
                key={thread.id}
                comment={thread}
                document={document}
                recessed={!!focusedComment && focusedComment.id !== thread.id}
                focused={focusedComment?.id === thread.id}
              />
            ))
          ) : (
            <NoComments align="center" justify="center" auto>
              <PositionedEmpty>{t("No comments yet")}</PositionedEmpty>
            </NoComments>
          )}
        </Wrapper>
      </Scrollable>
      <AnimatePresence initial={false}>
        {!focusedComment && can.comment && (
          <NewCommentForm
            draft={draft}
            onSaveDraft={onSaveDraft}
            documentId={document.id}
            placeholder={`${t("Add a comment")}…`}
            autoFocus={false}
            dir={document.dir}
            animatePresence
            standalone
          />
        )}
      </AnimatePresence>
    </Sidebar>
  );
}

const PositionedEmpty = styled(Empty)`
  position: absolute;
  top: calc(50vh - 30px);
  transform: translateY(-50%);
`;

const NoComments = styled(Flex)`
  padding-bottom: 65px;
  height: 100%;
`;

const Wrapper = styled.div<{ $hasComments: boolean }>`
  padding-bottom: ${(props) => (props.$hasComments ? "50vh" : "0")};
  height: ${(props) => (props.$hasComments ? "auto" : "100%")};
`;

const NewCommentForm = styled(CommentForm)<{ dir?: "ltr" | "rtl" }>`
  padding: 12px;
  padding-right: ${(props) => (props.dir !== "rtl" ? "18px" : "12px")};
  padding-left: ${(props) => (props.dir === "rtl" ? "18px" : "12px")};
`;

export default observer(Comments);
