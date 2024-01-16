import copy from "copy-to-clipboard";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMenuState } from "reakit/Menu";
import { toast } from "sonner";
import Comment from "~/models/Comment";
import CommentDeleteDialog from "~/components/CommentDeleteDialog";
import CommentReOpenDialog from "~/components/CommentReOpenDialog";
import CommentResolveDialog from "~/components/CommentResolveDialog";
import ContextMenu from "~/components/ContextMenu";
import MenuItem from "~/components/ContextMenu/MenuItem";
import OverflowMenuButton from "~/components/ContextMenu/OverflowMenuButton";
import Separator from "~/components/ContextMenu/Separator";
import EventBoundary from "~/components/EventBoundary";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { commentPath, urlify } from "~/utils/routeHelpers";

type Props = {
  /** The comment to associate with the menu */
  comment: Comment;
  /** CSS class name */
  className?: string;
  /** Callback when the "Edit" is selected in the menu */
  onEdit: () => void;
  /** Callback when the comment has been deleted */
  onDelete: () => void;
  /** Callback when the comment has been resolved */
  onResolve: () => void;
  /** Callback when the comment has been re-opend */
  onReopen: () => void;
};

function CommentMenu({
  comment,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
  className,
}: Props) {
  const menu = useMenuState({
    modal: true,
  });
  const { documents, dialogs } = useStores();
  const { t } = useTranslation();
  const can = usePolicy(comment);
  const document = documents.get(comment.documentId);
  const resolvedParentComment =
    comment.resolvedById !== null && comment.parentCommentId === null;
  const notResolvedParentComment =
    comment.resolvedById === null && comment.parentCommentId === null;

  const handleDelete = React.useCallback(() => {
    dialogs.openModal({
      title: t("Delete comment"),
      isCentered: true,
      content: <CommentDeleteDialog comment={comment} onSubmit={onDelete} />,
    });
  }, [dialogs, comment, onDelete, t]);

  const handleResolve = React.useCallback(() => {
    dialogs.openModal({
      title: t("Resolve comment"),
      isCentered: true,
      content: <CommentResolveDialog comment={comment} onSubmit={onResolve} />,
    });
  }, [dialogs, comment, onResolve, t]);

  const handleReopen = React.useCallback(() => {
    dialogs.openModal({
      title: t("Re-open comment"),
      isCentered: true,
      content: <CommentReOpenDialog comment={comment} onSubmit={onReopen} />,
    });
  }, [dialogs, comment, onReopen, t]);

  const handleCopyLink = React.useCallback(() => {
    if (document) {
      copy(urlify(commentPath(document, comment)));
      toast.message(t("Link copied"));
    }
  }, [t, document, comment]);

  return (
    <>
      <EventBoundary>
        <OverflowMenuButton
          aria-label={t("Show menu")}
          className={className}
          {...menu}
        />
      </EventBoundary>

      <ContextMenu {...menu} aria-label={t("Comment options")}>
        {can.update && (
          <>
            {comment.resolvedById === null && (
              <MenuItem {...menu} onClick={onEdit}>
                {t("Edit")}
              </MenuItem>
            )}
          </>
        )}

        {
          <>
            {notResolvedParentComment ? (
              <MenuItem {...menu} onClick={handleResolve} dangerous>
                {t("Resolve")}
              </MenuItem>
            ) : resolvedParentComment ? (
              <MenuItem {...menu} onClick={handleReopen} dangerous>
                {t("Re-open")}
              </MenuItem>
            ) : null}
          </>
        }
        <MenuItem {...menu} onClick={handleCopyLink}>
          {t("Copy link")}
        </MenuItem>
        {can.delete && (
          <>
            <Separator />
            <MenuItem {...menu} onClick={handleDelete} dangerous>
              {t("Delete")}
            </MenuItem>
          </>
        )}
      </ContextMenu>
    </>
  );
}

export default observer(CommentMenu);
